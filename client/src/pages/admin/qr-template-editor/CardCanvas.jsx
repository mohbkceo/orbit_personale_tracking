import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle,
  Ellipse,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from 'react-konva';
import QRCode from 'qrcode';
import { api } from '../../../api/client.js';
import { constrainElement, HEIGHT, sampleText, snapElement, WIDTH } from './design.js';

const PADDING = 14;
function useImageAsset(id) {
  const [asset, setAsset] = useState(null);
  useEffect(() => {
    if (!id) return;
    let active = true;
    let url;
    api
      .get(`/admin/qr-print-templates/assets/${id}`, { responseType: 'blob', timeout: 60000 })
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        const image = new window.Image();
        image.onload = () => {
          if (active) setAsset({ id, image });
        };
        image.src = url;
      })
      .catch(() => {});
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return asset?.id === id ? asset.image : null;
}

function Artwork({ element, common }) {
  const image = useImageAsset(element.assetId);
  if (!image) return <Rect {...common} fill="#e5e7eb" />;
  return (
    <KonvaImage
      {...common}
      image={image}
      crop={{
        x: image.width * element.cropX,
        y: image.height * element.cropY,
        width: image.width * element.cropW,
        height: image.height * element.cropH,
      }}
    />
  );
}
function BackgroundImage({ id, scale }) {
  const image = useImageAsset(id);
  if (!image) return null;
  const width = WIDTH * scale;
  const height = HEIGHT * scale;
  const ratio = Math.max(width / image.width, height / image.height);
  return (
    <Group clipWidth={width} clipHeight={height} listening={false}>
      <KonvaImage
        image={image}
        x={(width - image.width * ratio) / 2}
        y={(height - image.height * ratio) / 2}
        width={image.width * ratio}
        height={image.height * ratio}
      />
    </Group>
  );
}
function QrMatrix({ element, common, scale }) {
  const matrix = useMemo(
    () =>
      QRCode.create(`${window.location.origin}/activate/${'A'.repeat(43)}`, {
        errorCorrectionLevel: 'M',
      }).modules,
    [],
  );
  const unit = (element.w * scale) / (matrix.size + 8);
  const cells = useMemo(() => {
    const result = [];
    for (let row = 0; row < matrix.size; row += 1)
      for (let col = 0; col < matrix.size; col += 1)
        if (matrix.get(row, col))
          result.push(
            <Rect
              key={`${row}-${col}`}
              x={(col + 4) * unit}
              y={(row + 4) * unit}
              width={unit + 0.02}
              height={unit + 0.02}
              fill={element.foreground}
              listening={false}
            />,
          );
    return result;
  }, [matrix, unit, element.foreground]);
  return (
    <Group {...common}>
      <Rect width={element.w * scale} height={element.h * scale} fill={element.background} />
      {cells}
    </Group>
  );
}
function ShapeNode({ element, common, scale }) {
  const style = {
    fill: element.fill,
    stroke: element.stroke,
    strokeWidth: element.strokeWidth * scale,
  };
  return (
    <Group {...common}>
      <Rect width={common.width} height={common.height} opacity={0.001} />
      {element.shape === 'line' && (
        <Line points={[0, common.height / 2, common.width, common.height / 2]} {...style} />
      )}
      {element.shape === 'circle' && (
        <Circle
          x={common.width / 2}
          y={common.height / 2}
          radius={Math.min(common.width, common.height) / 2}
          {...style}
        />
      )}
      {element.shape === 'ellipse' && (
        <Ellipse
          x={common.width / 2}
          y={common.height / 2}
          radiusX={common.width / 2}
          radiusY={common.height / 2}
          {...style}
        />
      )}
      {['rect', 'roundRect'].includes(element.shape) && (
        <Rect
          width={common.width}
          height={common.height}
          cornerRadius={element.shape === 'roundRect' ? element.radius * scale : 0}
          {...style}
        />
      )}
    </Group>
  );
}
function ElementNode({ element, scale, selected, select, change, guide, elements, editText }) {
  const ref = useRef(null);
  const transformer = useRef(null);
  useEffect(() => {
    if (selected && transformer.current && ref.current) {
      transformer.current.nodes([ref.current]);
      transformer.current.getLayer()?.batchDraw();
    }
  }, [selected, element.w, element.h, element.locked, scale]);
  const common = {
    ref,
    x: element.x * scale,
    y: element.y * scale,
    width: element.w * scale,
    height: element.h * scale,
    rotation: element.rotation,
    opacity: element.opacity,
    draggable: !element.locked,
    onClick: (event) => {
      event.cancelBubble = true;
      select(element.id);
    },
    onTap: (event) => {
      event.cancelBubble = true;
      select(element.id);
    },
    onDblClick: () => !element.locked && element.type === 'text' && editText(element),
    onDblTap: () => !element.locked && element.type === 'text' && editText(element),
    onDragStart: () => select(element.id),
    onDragMove: (event) => {
      const snap = snapElement(
        element,
        event.target.x() / scale,
        event.target.y() / scale,
        elements.filter((e) => e.id !== element.id),
        5 / scale,
      );
      event.target.position({ x: snap.x * scale, y: snap.y * scale });
      guide((current) =>
        current.length === snap.guides.length &&
        current.every(
          (line, index) =>
            line.direction === snap.guides[index].direction && line.at === snap.guides[index].at,
        )
          ? current
          : snap.guides,
      );
    },
    onDragEnd: (event) => {
      change(element.id, { x: event.target.x() / scale, y: event.target.y() / scale });
      guide([]);
    },
    onTransformEnd: () => {
      const node = ref.current;
      const w = (node.width() * node.scaleX()) / scale;
      const h = element.type === 'qr' ? w : (node.height() * node.scaleY()) / scale;
      const next = constrainElement(element, {
        x: node.x() / scale,
        y: node.y() / scale,
        w,
        h,
        rotation: node.rotation(),
      });
      node.scale({ x: 1, y: 1 });
      node.setAttrs({
        x: next.x * scale,
        y: next.y * scale,
        width: next.w * scale,
        height: next.h * scale,
        rotation: next.rotation,
      });
      change(element.id, next);
    },
    onMouseEnter: (event) => {
      event.target.getStage().container().style.cursor = element.locked ? 'pointer' : 'move';
    },
    onMouseLeave: (event) => {
      event.target.getStage().container().style.cursor = 'default';
    },
  };
  let shape;
  if (element.type === 'qr') shape = <QrMatrix element={element} common={common} scale={scale} />;
  else if (element.type === 'image') shape = <Artwork element={element} common={common} />;
  else if (element.type === 'shape')
    shape = <ShapeNode element={element} common={common} scale={scale} />;
  else
    shape = (
      <Text
        {...common}
        text={sampleText(element)}
        fontFamily={element.fontFamily}
        fontSize={(element.fontSize * scale * 25.4) / 72}
        fontStyle={element.fontWeight}
        fill={element.color}
        align={element.align}
        wrap="word"
        ellipsis
      />
    );
  return (
    <>
      {shape}
      {selected &&
        (element.locked ? (
          <Rect
            x={common.x}
            y={common.y}
            width={common.width}
            height={common.height}
            rotation={element.rotation}
            stroke="#EB4300"
            strokeWidth={1}
            dash={[4, 3]}
            listening={false}
          />
        ) : (
          <Transformer
            ref={transformer}
            rotateEnabled={element.type !== 'qr'}
            keepRatio={element.type === 'qr'}
            flipEnabled={false}
            borderStroke="#EB4300"
            anchorStroke="#EB4300"
            anchorFill="#ffffff"
            anchorSize={9}
            anchorCornerRadius={2}
            rotateAnchorOffset={22}
            rotationSnaps={[0, 90, 180, 270]}
            enabledAnchors={
              element.type === 'qr'
                ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                : undefined
            }
            boundBoxFunc={(old, next) =>
              next.width < (element.type === 'qr' ? 20 : 1) * scale ||
              next.height < (element.type === 'qr' ? 20 : 1) * scale
                ? old
                : next
            }
          />
        ))}
    </>
  );
}

export function CardCanvas({
  template,
  scale,
  selected,
  select,
  change,
  guides,
  setGuides,
  safeMargins,
  saveText,
}) {
  const [editing, setEditing] = useState(null);
  const finishText = () => {
    if (editing) change(editing.id, { text: editing.text });
    setEditing(null);
  };
  const deselect = (event) => {
    if (event.target === event.target.getStage() || event.target.name() === 'card-background')
      select(null);
  };
  const width = WIDTH * scale;
  const height = HEIGHT * scale;
  return (
    <div
      className="ce-card-stage"
      style={{ width: width + PADDING * 2, height: height + PADDING * 2 }}
    >
      <div className="ce-card-paper" style={{ inset: PADDING }} />
      <Stage
        width={width + PADDING * 2}
        height={height + PADDING * 2}
        onMouseDown={deselect}
        onTouchStart={deselect}
      >
        <Layer>
          <Group x={PADDING} y={PADDING}>
            <Rect
              name="card-background"
              width={width}
              height={height}
              fill={template.background.type === 'color' ? template.background.color : '#ffffff'}
            />
            {template.background.type === 'image' && (
              <BackgroundImage id={template.background.assetId} scale={scale} />
            )}
            {[...template.elements]
              .sort((a, b) => Number(a.type === 'qr') - Number(b.type === 'qr'))
              .map((element) => (
                <ElementNode
                  key={element.id}
                  element={element}
                  elements={template.elements}
                  scale={scale}
                  selected={selected === element.id && editing?.id !== element.id}
                  select={select}
                  change={change}
                  guide={setGuides}
                  editText={(e) => setEditing({ ...e })}
                />
              ))}
            {safeMargins && (
              <Rect
                x={3 * scale}
                y={3 * scale}
                width={91 * scale}
                height={49 * scale}
                stroke="#9c92ab"
                strokeWidth={1}
                dash={[4, 5]}
                listening={false}
              />
            )}
            {guides.map((line, index) => (
              <Line
                key={index}
                points={
                  line.direction === 'vertical'
                    ? [line.at * scale, 0, line.at * scale, height]
                    : [0, line.at * scale, width, line.at * scale]
                }
                stroke="#EB4300"
                strokeWidth={1}
                listening={false}
              />
            ))}
          </Group>
        </Layer>
      </Stage>
      {editing && (
        <textarea
          autoFocus
          aria-label="Edit text on card"
          className="ce-inline-text"
          maxLength={500}
          value={editing.text}
          style={{
            left: PADDING + editing.x * scale,
            top: PADDING + editing.y * scale,
            width: editing.w * scale,
            height: Math.max(32, editing.h * scale),
            fontFamily: editing.fontFamily,
            fontSize: (editing.fontSize * scale * 25.4) / 72,
            fontWeight: editing.fontWeight,
            color: editing.color,
            textAlign: editing.align,
            transform: `rotate(${editing.rotation}deg)`,
          }}
          onChange={(event) => setEditing({ ...editing, text: event.target.value })}
          onBlur={finishText}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
              event.preventDefault();
              event.stopPropagation();
              finishText();
              saveText(editing.id, editing.text);
            }
            if (event.key === 'Escape') {
              event.stopPropagation();
              setEditing(null);
            }
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              finishText();
            }
          }}
        />
      )}
    </div>
  );
}
