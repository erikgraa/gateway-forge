export type ListSeparator = 'space' | 'comma' | 'newline';

export function parseListValue(raw: unknown, separator: ListSeparator = 'space'): string[] {
  if (Array.isArray(raw)) return raw.flatMap((value) => parseListValue(value, separator));
  return String(raw ?? '')
    .trim()
    .split(separator === 'newline' ? /\r?\n/ : separator === 'comma' ? /\s*,\s*/ : /\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function serializeListValue(values: readonly unknown[], separator: ListSeparator = 'space'): string {
  return values.flatMap((value) => parseListValue(value, separator)).join(separator === 'newline' ? '\n' : separator === 'comma' ? ',' : ' ');
}
