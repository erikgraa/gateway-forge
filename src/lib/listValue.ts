export type ListSeparator = 'space' | 'comma';

export function parseListValue(raw: unknown, separator: ListSeparator = 'space'): string[] {
  if (Array.isArray(raw)) return raw.flatMap((value) => parseListValue(value, separator));
  return String(raw ?? '')
    .trim()
    .split(separator === 'comma' ? /\s*,\s*/ : /\s+/)
    .filter(Boolean);
}

export function serializeListValue(values: readonly unknown[], separator: ListSeparator = 'space'): string {
  return values.flatMap((value) => parseListValue(value, separator)).join(separator === 'comma' ? ',' : ' ');
}
