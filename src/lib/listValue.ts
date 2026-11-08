export function parseListValue(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.flatMap((value) => parseListValue(value));
  return String(raw ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function serializeListValue(values: readonly unknown[]): string {
  return values.flatMap((value) => parseListValue(value)).join(' ');
}
