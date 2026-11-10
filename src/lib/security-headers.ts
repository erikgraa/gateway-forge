export interface SecurityHeaderRow {
  name: string;
  value: string;
}

export function parseSecurityHeaderRows(raw: unknown): SecurityHeaderRow[] | null {
  if (typeof raw !== 'string') return null;
  if (!raw.trim()) return [];
  try {
    let source = raw.trim();
    let parsed: unknown = JSON.parse(source);
    if (typeof parsed === 'string') {
      source = parsed;
      parsed = JSON.parse(source);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (!Object.values(parsed).every((value) => typeof value === 'string')) return null;
    // Read pairs from the validated flat object so duplicate names survive editing.
    const pair = /("(?:\\.|[^"\\])*")\s*:\s*("(?:\\.|[^"\\])*")/g;
    if (source.replace(pair, '').replace(/[\s{},]/g, '')) return null;
    return Array.from(source.matchAll(pair), ([, name, value]) => ({
      name: JSON.parse(name) as string,
      value: JSON.parse(value) as string
    }));
  } catch {
    return null;
  }
}

export function securityHeaderRowError(rows: SecurityHeaderRow[], index: number): string | undefined {
  const row = rows[index];
  if (!row.name.trim() || !row.value.trim()) return 'Header name and value are both required';
  if (rows.some((other, otherIndex) => otherIndex !== index && other.name.toLowerCase() === row.name.toLowerCase())) {
    return 'Header names must be unique (case-insensitive)';
  }
}

export function serializeSecurityHeaderRows(rows: SecurityHeaderRow[]): string {
  if (!rows.length) return '';
  return `{${rows.map(({ name, value }) => `${JSON.stringify(name)}:${JSON.stringify(value)}`).join(',')}}`;
}

export function parseSecurityHeaders(raw: unknown): Record<string, string> | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const rows = parseSecurityHeaderRows(raw);
  if (!rows || rows.some((_, index) => securityHeaderRowError(rows, index))) return null;
  return Object.fromEntries(rows.map(({ name, value }) => [name, value]));
}

export function formatSecurityHeadersIni(raw: unknown): string {
  const value = String(raw ?? '');
  const headers = parseSecurityHeaders(value);
  if (!headers) return value;
  // Appliance-exported quoted JSON already has the required escaping.
  if (value.trim().startsWith('"')) return value.trim();
  return JSON.stringify(JSON.stringify(headers));
}
