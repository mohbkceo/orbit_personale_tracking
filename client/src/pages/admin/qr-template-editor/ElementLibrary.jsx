import {
  Circle,
  Image,
  Layers,
  LayoutTemplate,
  LockKeyhole,
  Minus,
  QrCode,
  Shapes,
  Square,
  TextCursorInput,
  Type,
  X,
} from 'lucide-react';
import { ColorField, IconButton, PanelHeading, UploadButton } from './EditorControls.jsx';
import { elementLabel, FIELDS, SHAPES } from './design.js';

const CATEGORIES = [
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'images', label: 'Images', icon: Image },
  { id: 'shapes', label: 'Shapes', icon: Shapes },
  { id: 'qr', label: 'QR Code', icon: QrCode },
  { id: 'fields', label: 'Dynamic Fields', icon: TextCursorInput },
  { id: 'layers', label: 'Layers', icon: Layers },
];

export function ElementRail({ category, open, onSelect }) {
  return (
    <nav className="ce-element-rail" aria-label="Add elements">
      {CATEGORIES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-label={label}
          aria-expanded={open && category === id}
          aria-controls="ce-library"
          className={open && category === id ? 'is-active' : ''}
          onClick={() => onSelect(id)}
        >
          <Icon size={21} strokeWidth={1.65} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export function ElementLibrary({
  category,
  onClose,
  template,
  addText,
  addShape,
  addQr,
  upload,
  uploading,
  uploadError,
  applyPreset,
  selected,
  select,
  backgroundColor,
  limitReached,
}) {
  const heading = CATEGORIES.find((item) => item.id === category)?.label;
  const hasQr = template.elements.some((e) => e.type === 'qr');
  return (
    <aside id="ce-library" className="ce-library" aria-label={`${heading} library`}>
      <PanelHeading
        title={heading}
        description={category === 'templates' ? 'A starting point. Make it yours.' : undefined}
      >
        <IconButton icon={X} label="Close element library" onClick={onClose} />
      </PanelHeading>
      <div className="ce-panel-body">
        {limitReached && (
          <p className="ce-validation" role="alert">
            This card has 80 elements. Delete one to add another.
          </p>
        )}
        {category === 'templates' && (
          <div className="ce-preset-list">
            {[
              ['essential', 'The essential', 'Clean and confident'],
              ['accent', 'A little Orbit', 'A touch of signature orange'],
              ['quiet', 'Quietly classic', 'Warm paper, timeless type'],
            ].map(([style, name, description]) => (
              <button
                key={style}
                aria-label={`Use ${name} layout`}
                className="ce-preset"
                onClick={() => applyPreset(style)}
              >
                <span className={`ce-preset-preview ce-preset-${style}`} aria-hidden="true">
                  <span>
                    <b>ORBIT</b>
                    <small>
                      Your next chapter
                      <br />
                      starts here.
                    </small>
                    <i>ORB-SAMPLE-001</i>
                  </span>
                  <QrCode size={43} strokeWidth={1.3} />
                </span>
                <strong>{name}</strong>
                <small>{description}</small>
              </button>
            ))}
            <p className="ce-hint">
              Applying a layout replaces the card artwork. You can always undo.
            </p>
          </div>
        )}
        {category === 'text' && (
          <>
            <p className="ce-hint">Click to add. Double-click text on the card to write.</p>
            <div className="ce-text-options">
              <button
                disabled={limitReached}
                onClick={() =>
                  addText(null, {
                    text: 'Add a heading',
                    fontSize: 18,
                    fontWeight: 'bold',
                    w: 65,
                    h: 12,
                  })
                }
              >
                <b>Add a heading</b>
              </button>
              <button
                disabled={limitReached}
                onClick={() =>
                  addText(null, { text: 'Add a subheading', fontSize: 12, w: 60, h: 9 })
                }
              >
                Add a subheading
              </button>
              <button
                disabled={limitReached}
                onClick={() =>
                  addText(null, { text: 'Add a little body text', fontSize: 8, w: 55, h: 8 })
                }
              >
                <small>Add a little body text</small>
              </button>
            </div>
          </>
        )}
        {category === 'images' && (
          <>
            <div className="ce-upload-placeholder">
              <Image size={34} strokeWidth={1} />
              <h3>Make it your own</h3>
              <p>Add your logo or artwork to the card.</p>
            </div>
            <UploadButton onUpload={(file) => upload(false, file)} busy={uploading} />
            <p className="ce-hint">PNG or JPG · up to 2 MB</p>
            {uploadError && (
              <p role="alert" className="ce-validation">
                {uploadError}
              </p>
            )}
            <div className="ce-section">
              <h3>Card background</h3>
              <ColorField
                label="Background color"
                value={template.background.color || '#ffffff'}
                onChange={backgroundColor}
              />
              <UploadButton
                label="Upload background"
                secondary
                onUpload={(file) => upload(true, file)}
                busy={uploading}
              />
            </div>
          </>
        )}
        {category === 'shapes' && (
          <>
            <p className="ce-hint">Simple shapes. Endless possibilities.</p>
            <div className="ce-shape-grid">
              {Object.entries(SHAPES).map(([shape, label]) => (
                <button
                  key={shape}
                  disabled={limitReached}
                  onClick={() => addShape(shape)}
                  aria-label={`Add ${label.toLowerCase()}`}
                >
                  {shape === 'line' ? (
                    <Minus size={42} strokeWidth={2} />
                  ) : shape === 'circle' || shape === 'ellipse' ? (
                    <Circle
                      size={37}
                      className={shape === 'ellipse' ? 'ce-oval' : ''}
                      fill="currentColor"
                      strokeWidth={0}
                    />
                  ) : (
                    <Square
                      size={37}
                      fill="currentColor"
                      strokeWidth={0}
                      rx={shape === 'rect' ? 0 : 7}
                    />
                  )}
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {category === 'qr' && (
          <>
            <div className="ce-qr-preview">
              <QrCode size={92} strokeWidth={1.3} />
            </div>
            <h3>One card. One unique link.</h3>
            <p className="ce-hint">
              Each printed card gets its own activation QR code automatically.
            </p>
            <button
              className="ce-button ce-button-primary ce-full"
              disabled={!hasQr && limitReached}
              onClick={
                hasQr ? () => select(template.elements.find((e) => e.type === 'qr').id) : addQr
              }
            >
              {hasQr ? 'Select QR code' : 'Add QR code'}
            </button>
            <p className="ce-note">
              {hasQr
                ? 'Your card already has its QR code. Select it to change the size or colors.'
                : 'A QR code is required to save and print this card.'}
            </p>
          </>
        )}
        {category === 'fields' && (
          <>
            <p className="ce-hint">
              Add a field once. We fill in the details for every printed card.
            </p>
            <div className="ce-field-options">
              {Object.entries(FIELDS).map(([key, field]) => (
                <button
                  key={key}
                  aria-label={`Add ${field.label}`}
                  disabled={limitReached}
                  onClick={() => addText(key)}
                >
                  <span className="ce-field-symbol" aria-hidden="true">
                    {'{ }'}
                  </span>
                  <span>
                    <strong>{field.label}</strong>
                    <small>{field.description}</small>
                  </span>
                  <span aria-hidden="true">+</span>
                </button>
              ))}
            </div>
          </>
        )}
        {category === 'layers' && (
          <>
            <p className="ce-hint">Front to back. Select a layer to edit or arrange it.</p>
            <div className="ce-layer-list">
              {[...template.elements]
                .sort((a, b) => Number(a.type === 'qr') - Number(b.type === 'qr'))
                .reverse()
                .map((element) => {
                  const Icon =
                    element.type === 'qr'
                      ? QrCode
                      : element.type === 'image'
                        ? Image
                        : element.type === 'shape'
                          ? Shapes
                          : Type;
                  return (
                    <button
                      key={element.id}
                      className={selected === element.id ? 'is-active' : ''}
                      onClick={() => select(element.id)}
                    >
                      <span className="ce-layer-symbol">
                        <Icon size={18} />
                      </span>
                      <span>
                        <strong>{elementLabel(element)}</strong>
                        {element.type === 'qr' && <small>Always on top for scanning</small>}
                      </span>
                      {element.locked && <LockKeyhole size={13} aria-label="Locked" />}
                    </button>
                  );
                })}
            </div>
            {!template.elements.length && (
              <p className="ce-note">
                Your card is a blank canvas. Add some text or a QR code to begin.
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
