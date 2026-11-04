import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  Copy,
  LockKeyhole,
  SlidersHorizontal,
  Trash2,
  UnlockKeyhole,
  X,
} from 'lucide-react';
import {
  ColorField,
  IconButton,
  NumberField,
  PanelHeading,
  UploadButton,
} from './EditorControls.jsx';
import { clamp, elementLabel, FIELDS, HEIGHT, WIDTH } from './design.js';

export function PropertiesPanel({
  chosen,
  template,
  change,
  commit,
  duplicate,
  remove,
  reorder,
  canForward,
  canBack,
  upload,
  uploading,
  uploadError,
  error,
  onClose,
  limitReached,
}) {
  const update = (patch) => change(chosen.id, patch);
  const setBackground = (color) =>
    commit((current) => ({ ...current, background: { type: 'color', color } }));
  const text = chosen && ['text', 'variable'].includes(chosen.type);
  return (
    <aside id="ce-properties" className="ce-properties" aria-label="Design properties">
      <PanelHeading
        title={chosen ? (chosen.type === 'text' ? 'Text' : elementLabel(chosen)) : 'Your card'}
        description={
          chosen
            ? chosen.locked
              ? 'Locked · unlock to make changes'
              : 'Make it look just right.'
            : 'A small card. A great first impression.'
        }
      >
        <IconButton
          icon={X}
          label="Close properties"
          className="ce-close-properties"
          onClick={onClose}
        />
      </PanelHeading>
      <div className="ce-panel-body" key={chosen?.id || 'card'}>
        {!chosen ? (
          <>
            <div className="ce-card-spec">
              <span aria-hidden="true">
                <i />
              </span>
              <div>
                <strong>Activation card</strong>
                <small>97 × 55 mm · Landscape</small>
              </div>
            </div>
            <div className="ce-section">
              <h3>Background</h3>
              <ColorField
                label="Card color"
                value={template.background.color || '#ffffff'}
                onChange={setBackground}
              />
              <div className="ce-swatches" aria-label="Background colors">
                {['#ffffff', '#f6f3ed', '#f1f4f6', '#fff1e9', '#202329'].map((color) => (
                  <button
                    key={color}
                    aria-label={`Set background to ${color}`}
                    title={color}
                    style={{ backgroundColor: color }}
                    onClick={() => setBackground(color)}
                    aria-pressed={template.background.color === color}
                  />
                ))}
              </div>
              <UploadButton
                label={
                  template.background.type === 'image'
                    ? 'Replace background'
                    : 'Use a background image'
                }
                secondary
                onUpload={(file) => upload(true, file)}
                busy={uploading}
              />
              {template.background.type === 'image' && (
                <button className="ce-text-button" onClick={() => setBackground('#ffffff')}>
                  Remove background image
                </button>
              )}
              {uploadError && (
                <p role="alert" className="ce-validation">
                  {uploadError}
                </p>
              )}
            </div>
            <div className="ce-section ce-guidance">
              <SlidersHorizontal size={20} strokeWidth={1.5} />
              <h3>A little guidance</h3>
              <p>
                Select anything on the card to customize it. Drag to move, or use the corner handles
                to resize.
              </p>
              <p>Double-click text to edit it directly.</p>
            </div>
            <details className="ce-advanced">
              <summary>Print tips</summary>
              <p className="ce-hint">
                Keep important details inside the safe margin. Preview your PDF, then print at 100%
                or actual size on 97 × 55 mm card stock.
              </p>
              <p className="ce-hint">
                The editor shows sample details. Printed cards use real activation codes and plan
                details.
              </p>
            </details>
          </>
        ) : (
          <>
            <div className="ce-selection-actions" aria-label="Element actions">
              <IconButton
                icon={Copy}
                label="Duplicate element"
                onClick={duplicate}
                disabled={chosen.locked || chosen.type === 'qr' || limitReached}
              />
              <IconButton
                icon={chosen.locked ? UnlockKeyhole : LockKeyhole}
                label={chosen.locked ? 'Unlock element' : 'Lock element'}
                active={chosen.locked}
                onClick={() => update({ locked: !chosen.locked })}
              />
              <span />{' '}
              <IconButton
                icon={Trash2}
                label="Delete element"
                className="ce-delete"
                onClick={remove}
                disabled={chosen.locked}
              />
            </div>
            {chosen.locked && (
              <p className="ce-note">
                This element is locked in place. Unlock it above to edit, duplicate or delete it.
              </p>
            )}
            {error && (
              <p className="ce-validation" role="alert">
                {error}
              </p>
            )}
            <fieldset disabled={chosen.locked} className="ce-properties-fields">
              {text && (
                <>
                  {chosen.type === 'text' ? (
                    <label className="ce-field">
                      <span>Text content</span>
                      <textarea
                        data-text-content
                        maxLength={500}
                        value={chosen.text}
                        rows={3}
                        onChange={(event) => update({ text: event.target.value })}
                      />
                    </label>
                  ) : (
                    <>
                      <label className="ce-field">
                        <span>Dynamic field</span>
                        <select
                          value={chosen.variable}
                          onChange={(event) => update({ variable: event.target.value })}
                        >
                          {Object.entries(FIELDS).map(([key, field]) => (
                            <option key={key} value={key}>
                              {field.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="ce-note">
                        Sample: {FIELDS[chosen.variable]?.sample}. Filled in automatically for each
                        card.
                      </p>
                    </>
                  )}
                  <label className="ce-field">
                    <span>Font</span>
                    <select
                      value={chosen.fontFamily}
                      onChange={(event) => update({ fontFamily: event.target.value })}
                    >
                      {['Noto Sans', 'Noto Serif', 'Noto Sans Mono'].map((font) => (
                        <option key={font} style={{ fontFamily: font }}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="ce-control-row">
                    <NumberField
                      label="Font size"
                      value={chosen.fontSize}
                      min={4}
                      max={72}
                      step={1}
                      unit="pt"
                      onChange={(fontSize) => update({ fontSize })}
                    />
                    <div className="ce-field">
                      <span>Style</span>
                      <div className="ce-toggle-group">
                        <IconButton
                          icon={Bold}
                          label="Bold"
                          aria-pressed={chosen.fontWeight === 'bold'}
                          active={chosen.fontWeight === 'bold'}
                          onClick={() =>
                            update({ fontWeight: chosen.fontWeight === 'bold' ? 'normal' : 'bold' })
                          }
                        />
                      </div>
                    </div>
                  </div>
                  <ColorField
                    label="Text color"
                    value={chosen.color}
                    onChange={(color) => update({ color })}
                  />
                  <div className="ce-field">
                    <span>Alignment</span>
                    <div className="ce-toggle-group">
                      {[
                        ['left', AlignLeft],
                        ['center', AlignCenter],
                        ['right', AlignRight],
                      ].map(([align, Icon]) => (
                        <IconButton
                          key={align}
                          icon={Icon}
                          label={`Align ${align}`}
                          aria-pressed={chosen.align === align}
                          active={chosen.align === align}
                          onClick={() => update({ align })}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
              {chosen.type === 'qr' && (
                <>
                  <NumberField
                    label="QR size"
                    unit="mm"
                    min={20}
                    max={HEIGHT}
                    value={chosen.w}
                    onChange={(w) => update({ w, h: w })}
                  />
                  <ColorField
                    label="QR color"
                    value={chosen.foreground}
                    onChange={(foreground) => update({ foreground })}
                  />
                  <ColorField
                    label="QR background"
                    value={chosen.background}
                    onChange={(background) => update({ background })}
                  />
                  <p className="ce-note">
                    Keep it dark on a light background. A clear border is included to help phones
                    scan it.
                  </p>
                </>
              )}
              {chosen.type === 'shape' && (
                <>
                  <ColorField
                    label="Fill color"
                    value={chosen.fill}
                    onChange={(fill) => update({ fill })}
                  />
                  <ColorField
                    label="Border color"
                    value={chosen.stroke}
                    onChange={(stroke) => update({ stroke })}
                  />
                  <NumberField
                    label="Border width"
                    unit="mm"
                    value={chosen.strokeWidth}
                    max={5}
                    onChange={(strokeWidth) => update({ strokeWidth })}
                  />
                  {chosen.shape === 'roundRect' && (
                    <NumberField
                      label="Corner radius"
                      unit="mm"
                      value={chosen.radius}
                      max={20}
                      onChange={(radius) => update({ radius })}
                    />
                  )}
                </>
              )}
              {chosen.type === 'image' && (
                <>
                  <div className="ce-section">
                    <h3>Crop image</h3>
                    <label className="ce-field">
                      <span>
                        Crop zoom <small>{Math.round(100 / chosen.cropW)}%</small>
                      </span>
                      <input
                        type="range"
                        aria-label="Crop zoom"
                        min={1}
                        max={5}
                        step={0.05}
                        value={1 / chosen.cropW}
                        onChange={(event) => {
                          const size = 1 / Number(event.target.value);
                          update({
                            cropW: size,
                            cropH: size,
                            cropX: clamp(chosen.cropX + (chosen.cropW - size) / 2, 0, 1 - size),
                            cropY: clamp(chosen.cropY + (chosen.cropH - size) / 2, 0, 1 - size),
                          });
                        }}
                      />
                    </label>
                    <label className="ce-field">
                      <span>Horizontal crop</span>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, 1 - chosen.cropW)}
                        step={0.001}
                        value={chosen.cropX}
                        disabled={chosen.cropW === 1}
                        onChange={(event) => update({ cropX: Number(event.target.value) })}
                      />
                    </label>
                    <label className="ce-field">
                      <span>Vertical crop</span>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, 1 - chosen.cropH)}
                        step={0.001}
                        value={chosen.cropY}
                        disabled={chosen.cropH === 1}
                        onChange={(event) => update({ cropY: Number(event.target.value) })}
                      />
                    </label>
                    <button
                      className="ce-text-button"
                      onClick={() => update({ cropX: 0, cropY: 0, cropW: 1, cropH: 1 })}
                    >
                      Reset crop
                    </button>
                  </div>
                </>
              )}
              {chosen.type !== 'qr' && (
                <div className="ce-section">
                  <h3>Size</h3>
                  <div className="ce-control-row">
                    <NumberField
                      label="Width"
                      unit="mm"
                      value={chosen.w}
                      min={1}
                      max={WIDTH}
                      onChange={(w) => update({ w })}
                    />
                    <NumberField
                      label="Height"
                      unit="mm"
                      value={chosen.h}
                      min={1}
                      max={HEIGHT}
                      onChange={(h) => update({ h })}
                    />
                  </div>
                </div>
              )}
              <div className="ce-section">
                <h3>Arrange</h3>
                <div className="ce-arrange-buttons">
                  <button className="ce-button" disabled={!canForward} onClick={() => reorder(1)}>
                    <ArrowUp size={15} />
                    Forward
                  </button>
                  <button className="ce-button" disabled={!canBack} onClick={() => reorder(-1)}>
                    <ArrowDown size={15} />
                    Backward
                  </button>
                </div>
                {chosen.type === 'qr' && (
                  <p className="ce-hint">
                    QR code stays on top so it can always be scanned. Only one QR code is allowed
                    per card.
                  </p>
                )}
              </div>
              <details className="ce-advanced">
                <summary>Advanced</summary>
                <div className="ce-control-row">
                  <NumberField
                    label="X position"
                    unit="mm"
                    value={chosen.x}
                    max={WIDTH - chosen.w}
                    onChange={(x) => update({ x })}
                  />
                  <NumberField
                    label="Y position"
                    unit="mm"
                    value={chosen.y}
                    max={HEIGHT - chosen.h}
                    onChange={(y) => update({ y })}
                  />
                </div>
                {chosen.type !== 'qr' && (
                  <>
                    <NumberField
                      label="Rotation"
                      unit="°"
                      value={chosen.rotation}
                      min={-360}
                      max={360}
                      step={1}
                      onChange={(rotation) => update({ rotation })}
                    />
                    <label className="ce-field">
                      <span>
                        Opacity <small>{Math.round(chosen.opacity * 100)}%</small>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={chosen.opacity}
                        onChange={(event) => update({ opacity: Number(event.target.value) })}
                      />
                    </label>
                  </>
                )}
              </details>
            </fieldset>
          </>
        )}
      </div>
    </aside>
  );
}
