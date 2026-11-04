import { useEffect, useState } from 'react';
import { Focus, Upload, ZoomIn, ZoomOut } from 'lucide-react';
import { clamp } from './design.js';

export function IconButton({ icon: Icon, label, active, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`ce-icon-button ${active ? 'is-active' : ''} ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon size={17} aria-hidden="true" />
    </button>
  );
}

export function ZoomControls({ zoom, setZoom, className = '' }) {
  return (
    <div className={`ce-zoom-controls ${className}`}>
      <IconButton
        icon={ZoomOut}
        label="Zoom out"
        disabled={zoom <= 0.5}
        onClick={() => setZoom((current) => clamp(current - 0.25, 0.5, 2))}
      />
      <span aria-live="polite">{Math.round(zoom * 100)}%</span>
      <IconButton
        icon={ZoomIn}
        label="Zoom in"
        disabled={zoom >= 2}
        onClick={() => setZoom((current) => clamp(current + 0.25, 0.5, 2))}
      />
      <IconButton icon={Focus} label="Fit to screen" onClick={() => setZoom(1)} />
    </div>
  );
}

export function NumberField({ label, value, onChange, min = 0, max = 360, step = 0.1, unit }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  return (
    <label className="ce-field">
      <span>{label}</span>
      <span className="ce-number-wrap">
        <input
          type="number"
          aria-label={label}
          value={draft}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            if (
              text !== '' &&
              Number.isFinite(Number(text)) &&
              Number(text) >= min &&
              Number(text) <= max
            )
              onChange(Number(text));
          }}
          onBlur={() => {
            const next = draft === '' ? value : clamp(Number(draft), min, max);
            setDraft(String(next));
            if (next !== value) onChange(next);
          }}
        />
        {unit && <span>{unit}</span>}
      </span>
    </label>
  );
}

export function ColorField({ label, value, onChange }) {
  return (
    <label className="ce-field">
      <span>{label}</span>
      <span className="ce-color-wrap">
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <span aria-hidden="true">{value.toUpperCase()}</span>
      </span>
    </label>
  );
}

export function UploadButton({ label = 'Upload image', onUpload, busy, secondary = false }) {
  return (
    <label className={`ce-upload ${secondary ? 'is-secondary' : ''} ${busy ? 'is-disabled' : ''}`}>
      <Upload size={18} aria-hidden="true" />
      <span>{busy ? 'Uploading…' : label}</span>
      <input
        type="file"
        aria-label={label}
        accept="image/png,image/jpeg"
        disabled={busy}
        onChange={(event) => {
          onUpload(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </label>
  );
}

export function PanelHeading({ title, description, children }) {
  return (
    <div className="ce-panel-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
