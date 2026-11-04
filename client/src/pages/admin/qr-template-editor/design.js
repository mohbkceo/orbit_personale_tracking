export const WIDTH = 97;
export const HEIGHT = 55;
export const FIELDS = {
  ACTIVATION_CODE: {
    label: 'Activation Code',
    sample: 'ORB-SAMPLE-001',
    description: 'Unique code for each card',
  },
  PLAN_NAME: {
    label: 'Plan Name',
    sample: 'Sample Plan',
    description: 'The plan attached to the batch',
  },
  PLAN_DURATION: {
    label: 'Plan Duration',
    sample: '1 MONTH',
    description: 'How long access lasts',
  },
  BATCH_CODE: { label: 'Batch Code', sample: 'SAMPLE', description: 'Identifies the print batch' },
  CARD_NUMBER: { label: 'Card Number', sample: '1', description: 'Position in the print batch' },
};
export const SHAPES = {
  rect: 'Rectangle',
  roundRect: 'Rounded rectangle',
  circle: 'Circle',
  ellipse: 'Oval',
  line: 'Line',
};
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value) => Math.round(value * 1000) / 1000;

export function createElement(type, extra = {}) {
  return {
    id: crypto.randomUUID(),
    type,
    x: 8,
    y: 8,
    w: 25,
    h: 10,
    rotation: 0,
    opacity: 1,
    locked: false,
    ...(type === 'qr'
      ? { variable: 'QR_CODE', w: 28, h: 28, foreground: '#111111', background: '#ffffff' }
      : {}),
    ...(['text', 'variable'].includes(type)
      ? {
          ...(type === 'text' ? { text: 'Your text' } : {}),
          w: 40,
          h: 8,
          color: '#202329',
          fontFamily: 'Noto Sans',
          fontSize: 12,
          fontWeight: 'normal',
          align: 'left',
        }
      : {}),
    ...(type === 'shape'
      ? {
          shape: 'rect',
          w: 25,
          h: 12,
          fill: '#e8e9ec',
          stroke: '#202329',
          strokeWidth: 0,
          radius: 3,
        }
      : {}),
    ...(type === 'image' ? { w: 25, h: 20, cropX: 0, cropY: 0, cropW: 1, cropH: 1 } : {}),
    ...extra,
  };
}

export function createDesign(style = 'essential') {
  const elements = [
    createElement('text', {
      text: 'ORBIT',
      x: 7,
      y: 7,
      w: 45,
      h: 9,
      fontSize: 18,
      fontWeight: 'bold',
    }),
    createElement('text', {
      text: 'Your next chapter starts here.',
      x: 7,
      y: 19,
      w: 46,
      h: 6,
      fontSize: 8,
    }),
    createElement('variable', {
      variable: 'ACTIVATION_CODE',
      x: 7,
      y: 35,
      w: 52,
      h: 6,
      fontSize: 9,
      fontWeight: 'bold',
    }),
    createElement('text', {
      text: 'Scan to activate your plan',
      x: 7,
      y: 44,
      w: 52,
      h: 5,
      fontSize: 7,
      color: '#677180',
    }),
    createElement('qr', { x: 63, y: 13 }),
  ];
  if (style === 'accent') {
    elements.unshift(createElement('shape', { x: 0, y: 0, w: 3, h: HEIGHT, fill: '#EB4300' }));
    elements.find((e) => e.text === 'ORBIT').color = '#EB4300';
  }
  if (style === 'quiet') {
    elements.find((e) => e.text === 'ORBIT').fontFamily = 'Noto Serif';
    elements.find((e) => e.text === 'ORBIT').fontWeight = 'normal';
  }
  return {
    name: 'Untitled card',
    widthMm: WIDTH,
    heightMm: HEIGHT,
    background: { type: 'color', color: style === 'quiet' ? '#f6f3ed' : '#ffffff' },
    elements,
  };
}

export function designBody(template) {
  return {
    name: template.name,
    widthMm: WIDTH,
    heightMm: HEIGHT,
    background: template.background,
    elements: template.elements,
  };
}
export const signature = (template) => JSON.stringify(designBody(template));
export const elementLabel = (element) =>
  element.type === 'variable'
    ? FIELDS[element.variable]?.label || 'Dynamic Field'
    : element.type === 'text'
      ? element.text || 'Empty text'
      : element.type === 'shape'
        ? SHAPES[element.shape]
        : element.type === 'qr'
          ? 'QR Code'
          : 'Image';
export const sampleText = (element) =>
  element.type === 'variable'
    ? FIELDS[element.variable]?.sample || ''
    : (element.text || '').replace(
        /\{\{([A-Z_]+)\}\}/g,
        (match, key) => FIELDS[key]?.sample ?? match,
      );

// Konva and the print renderer rotate about the element's top-left corner.
export function elementBounds(element) {
  const angle = (element.rotation * Math.PI) / 180;
  const points = [
    [0, 0],
    [element.w, 0],
    [0, element.h],
    [element.w, element.h],
  ].map(([x, y]) => [
    x * Math.cos(angle) - y * Math.sin(angle),
    x * Math.sin(angle) + y * Math.cos(angle),
  ]);
  return {
    left: Math.min(...points.map(([x]) => x)),
    right: Math.max(...points.map(([x]) => x)),
    top: Math.min(...points.map(([, y]) => y)),
    bottom: Math.max(...points.map(([, y]) => y)),
  };
}

export function constrainElement(element, patch) {
  const next = { ...element, ...patch };
  next.w = clamp(next.w, next.type === 'qr' ? 20 : 1, WIDTH);
  next.h = clamp(next.h, next.type === 'qr' ? 20 : 1, HEIGHT);
  if (next.type === 'qr') {
    next.w = next.h = clamp(patch.h ?? next.w, 20, HEIGHT);
    next.rotation = 0;
    next.opacity = 1;
  }
  let bounds = elementBounds(next);
  const fit = Math.min(
    1,
    WIDTH / (Math.max(next.w, bounds.right) - Math.min(0, bounds.left)),
    HEIGHT / (Math.max(next.h, bounds.bottom) - Math.min(0, bounds.top)),
  );
  if (fit < 1) {
    next.w *= fit;
    next.h *= fit;
    bounds = elementBounds(next);
  }
  // The API also checks the unrotated dimensions, so respect both bounds.
  next.x = clamp(next.x, Math.max(0, -bounds.left), Math.min(WIDTH - next.w, WIDTH - bounds.right));
  next.y = clamp(
    next.y,
    Math.max(0, -bounds.top),
    Math.min(HEIGHT - next.h, HEIGHT - bounds.bottom),
  );
  for (const key of ['x', 'y', 'w', 'h']) next[key] = round(next[key]);
  return next;
}

export function snapElement(element, x, y, others, tolerance) {
  const bounds = elementBounds(element);
  const vertical = [0, WIDTH / 2, WIDTH];
  const horizontal = [0, HEIGHT / 2, HEIGHT];
  others.forEach((other) => {
    const b = elementBounds(other);
    vertical.push(other.x + b.left, other.x + (b.left + b.right) / 2, other.x + b.right);
    horizontal.push(other.y + b.top, other.y + (b.top + b.bottom) / 2, other.y + b.bottom);
  });
  const closest = (position, offsets, targets) => {
    let best = { distance: tolerance };
    offsets.forEach((offset) =>
      targets.forEach((target) => {
        const delta = target - position - offset;
        if (Math.abs(delta) < best.distance) best = { distance: Math.abs(delta), delta, target };
      }),
    );
    return best;
  };
  const sx = closest(x, [bounds.left, (bounds.left + bounds.right) / 2, bounds.right], vertical);
  const sy = closest(y, [bounds.top, (bounds.top + bounds.bottom) / 2, bounds.bottom], horizontal);
  const result = constrainElement(element, { x: x + (sx.delta || 0), y: y + (sy.delta || 0) });
  return {
    x: result.x,
    y: result.y,
    guides: [
      ...(sx.target !== undefined && Math.abs(result.x - x - sx.delta) < 0.01
        ? [{ direction: 'vertical', at: sx.target }]
        : []),
      ...(sy.target !== undefined && Math.abs(result.y - y - sy.delta) < 0.01
        ? [{ direction: 'horizontal', at: sy.target }]
        : []),
    ],
  };
}

function luminance(hex) {
  return [1, 3, 5]
    .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
}
export function validateDesign(template) {
  const errors = {};
  if (!template.name.trim()) errors.name = 'Give your template a name.';
  if (template.elements.filter((e) => e.type === 'qr').length !== 1)
    errors.qr = 'Add exactly one QR code before saving or previewing.';
  if (template.elements.length > 80) errors.elements = 'Use up to 80 elements per card.';
  const qr = template.elements.find((e) => e.type === 'qr');
  if (qr && (luminance(qr.background) + 0.05) / (luminance(qr.foreground) + 0.05) < 4.5)
    errors[qr.id] = 'Choose a darker QR color and a lighter background for reliable scanning.';
  return errors;
}

export function createHistory(template) {
  return { present: template, past: [], future: [], saved: null };
}
export function historyReducer(state, action) {
  switch (action.type) {
    case 'load':
      return { ...createHistory(action.template), saved: signature(action.template) };
    case 'save':
      return { ...state, saved: signature(action.template) };
    case 'commit': {
      const next =
        typeof action.update === 'function' ? action.update(state.present) : action.update;
      if (signature(next) === signature(state.present)) return state;
      return {
        ...state,
        present: next,
        past: [...state.past.slice(-59), state.present],
        future: [],
      };
    }
    case 'undo':
      return !state.past.length
        ? state
        : {
            ...state,
            present: state.past.at(-1),
            past: state.past.slice(0, -1),
            future: [state.present, ...state.future],
          };
    case 'redo':
      return !state.future.length
        ? state
        : {
            ...state,
            present: state.future[0],
            past: [...state.past, state.present],
            future: state.future.slice(1),
          };
    default:
      return state;
  }
}
