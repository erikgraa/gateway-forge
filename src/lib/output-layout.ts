export const OUTPUT_WIDTH_KEY = 'gateway-forge.output-width';
export const OUTPUT_SPLITTER_WIDTH = 8;

export function savedOutputWidth(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  const width = Number(raw);
  return Number.isFinite(width) && width > 0 ? width : undefined;
}

export function outputWidthBounds(layoutWidth: number, navWidth: number, formMinWidth: number) {
  const max = Math.max(0, Math.floor(layoutWidth - navWidth - formMinWidth - OUTPUT_SPLITTER_WIDTH));
  return { min: Math.min(280, max), max };
}

export function clampOutputWidth(width: number, bounds: { min: number; max: number }): number {
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, width)));
}

export function defaultOutputWidth(viewportWidth: number): number {
  return viewportWidth <= 1180 ? Math.max(335, viewportWidth * .37) : Math.max(440, viewportWidth * .38);
}
