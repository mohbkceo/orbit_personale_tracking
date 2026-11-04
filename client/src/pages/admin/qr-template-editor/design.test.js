import { describe, expect, it } from 'vitest';
import { templateInput } from '../../../../../server/src/validators/qrPrintTemplate.js';
import {
  constrainElement,
  createDesign,
  createElement,
  createHistory,
  historyReducer,
  signature,
  snapElement,
  validateDesign,
} from './design.js';

describe('card editor print compatibility', () => {
  it.each(['essential', 'accent', 'quiet'])(
    'keeps the %s starter within the existing print contract',
    (style) => {
      const template = createDesign(style);
      expect(templateInput.safeParse(template).success).toBe(true);
    expect(templateInput.parse(template)).toEqual(template);
      expect(validateDesign(template)).toEqual({});
      expect(template.elements.filter((e) => e.type === 'qr')).toHaveLength(1);
    },
  );

  it('keeps resized and rotated artwork inside both API and physical card bounds', () => {
    for (const rotation of [-360, -180, -90, -45, 0, 15, 90, 180, 275, 360]) {
      for (const type of ['shape', 'qr']) {
        const design = createDesign();
        const element = constrainElement(createElement(type), {
          x: 96,
          y: 54,
          w: 97,
          h: 55,
          rotation,
        });
        if (type === 'qr') design.elements = design.elements.filter((e) => e.type !== 'qr');
        design.elements.push(element);
        expect(templateInput.safeParse(design).success, JSON.stringify(element)).toBe(true);
      }
    }
  });

  it('snaps centers and edges instead of comparing only top-left coordinates', () => {
    const element = createElement('shape', { w: 20, h: 10 });
    const snap = snapElement(element, 38.2, 22.3, [], 1);
    expect(snap.x).toBe(38.5);
    expect(snap.y).toBe(22.5);
    expect(snap.guides).toEqual([
      { direction: 'vertical', at: 48.5 },
      { direction: 'horizontal', at: 27.5 },
    ]);
  });

  it('flags missing or low contrast QR codes before export', () => {
    const design = createDesign();
    const qr = design.elements.find((e) => e.type === 'qr');
    qr.foreground = '#eeeeee';
    expect(validateDesign(design)[qr.id]).toContain('darker');
    design.elements = design.elements.filter((e) => e.type !== 'qr');
    expect(validateDesign(design).qr).toContain('exactly one');
  });
});

describe('editor history', () => {
  it('is pure under StrictMode reducer replays and preserves redo and saved status', () => {
    const design = createDesign();
    const initial = createHistory(design);
    const action = { type: 'commit', update: (current) => ({ ...current, name: 'Retail cards' }) };
    const first = historyReducer(initial, action);
    const replay = historyReducer(initial, action);
    expect(first).toEqual(replay);
    expect(initial.past).toHaveLength(0);
    const saved = historyReducer(first, { type: 'save', template: first.present });
    const undone = historyReducer(saved, { type: 'undo' });
    expect(undone.present.name).toBe(design.name);
    expect(undone.saved).not.toBe(signature(undone.present));
    const redone = historyReducer(undone, { type: 'redo' });
    expect(redone.saved).toBe(signature(redone.present));
    expect(historyReducer(redone, { type: 'commit', update: redone.present })).toBe(redone);
  });

  it('does not overwrite newer edits when an earlier save finishes', () => {
    const design = createDesign();
    const state = historyReducer(createHistory(design), {
      type: 'commit',
      update: { ...design, name: 'Still editing' },
    });
    const saved = historyReducer(state, { type: 'save', template: design });
    expect(saved.present.name).toBe('Still editing');
    expect(saved.saved).not.toBe(signature(saved.present));
  });
});
