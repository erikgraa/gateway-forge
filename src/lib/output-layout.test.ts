import { describe, expect, it } from 'vitest';
import { clampOutputWidth, defaultOutputWidth, outputWidthBounds, savedOutputWidth } from './output-layout';

describe('output pane width', () => {
  it.each([null, '', '  ', 'NaN', 'Infinity', '-1', '0', '440px'])('ignores invalid saved width %s', (raw) => {
    expect(savedOutputWidth(raw)).toBeUndefined();
  });
  it('restores finite positive pixel preferences', () => {
    expect(savedOutputWidth('620')).toBe(620);
  });
  it('reserves navigation and the existing form minimum', () => {
    expect(outputWidthBounds(1440, 226, 460)).toEqual({ min: 280, max: 746 });
    expect(outputWidthBounds(981, 200, 430)).toEqual({ min: 280, max: 343 });
  });
  it('bounds saved widths without enlarging the layout', () => {
    const bounds = outputWidthBounds(1024, 200, 430);
    expect(clampOutputWidth(2000, bounds)).toBe(386);
    expect(clampOutputWidth(1, bounds)).toBe(280);
    expect(clampOutputWidth(330.4, bounds)).toBe(330);
  });
  it('does not create impossible bounds for constrained layouts', () => {
    expect(outputWidthBounds(900, 226, 460)).toEqual({ min: 206, max: 206 });
    expect(outputWidthBounds(100, 226, 460)).toEqual({ min: 0, max: 0 });
  });
  it('retains the prior responsive default before clamping', () => {
    expect(defaultOutputWidth(1440)).toBeCloseTo(547.2);
    expect(defaultOutputWidth(1024)).toBeCloseTo(378.88);
  });
});
