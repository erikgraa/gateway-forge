export function parseSecurityHeaders(raw: unknown): Record<string, string> | null {
  if (typeof raw !== 'string') return null;
  try {
    let parsed: unknown = JSON.parse(raw.trim());
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (!Object.entries(parsed).every(([name, value]) => name.length > 0 && typeof value === 'string')) return null;
    return parsed as Record<string, string>;
  } catch {
    return null;
  }
}

export function formatSecurityHeadersIni(raw: unknown): string {
  const value = String(raw ?? '');
  const headers = parseSecurityHeaders(value);
  if (!headers) return value;
  // Appliance-exported quoted JSON already has the required escaping.
  if (value.trim().startsWith('"')) return value.trim();
  return JSON.stringify(JSON.stringify(headers));
}
