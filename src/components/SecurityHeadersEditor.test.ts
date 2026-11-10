import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import SecurityHeadersEditor from './SecurityHeadersEditor.svelte';
import { GROUPS } from '../lib/schema';
import { applyPatch, defaultConfig } from '../lib/model';
import { generateIni, generateJsonObject } from '../lib/generate';
import { importIni } from '../lib/importer';
import { validateConfig } from '../lib/validate';
import { parseSecurityHeaderRows, parseSecurityHeaders, securityHeaderRowError, serializeSecurityHeaderRows } from '../lib/security-headers';

const field = GROUPS.find((group) => group.target === 'horizon')!.fields.find((entry) => entry.id === 'securityHeaders')!;
const headers = [{ name: 'X-Content-Type-Options', value: 'nosniff' }, { name: 'Content-Security-Policy', value: "frame-ancestors 'self'" }];
const raw = serializeSecurityHeaderRows(headers);
const configWith = (value: string) => applyPatch(defaultConfig(), { values: { horizon_enabled: true, securityHeaders: value } });
const bodyWith = (value: string, error?: string) => render(SecurityHeadersEditor, { props: { field, values: { securityHeaders: value }, platform: 'vsphere', error } }).body;

describe('Horizon header name/value rows', () => {
  it('starts optional and empty, without examples or placeholder attributes', () => {
    const body = bodyWith('');
    expect(body).toContain('No custom headers configured. Appliance defaults apply.');
    expect(body).toContain('+ Add header');
    expect(body).not.toContain('placeholder=');
    expect(body).not.toContain('<input');
    expect(parseSecurityHeaderRows('')).toEqual([]);
    expect(generateIni(configWith(''))).not.toContain('securityHeaders=');
  });

  it('renders both imported fields required with accessible labels and release guidance', () => {
    const body = bodyWith(raw);
    expect(body.match(/ required/g)).toHaveLength(4);
    expect(body).toContain('aria-label="Header 1 name"');
    expect(body).toContain('aria-label="Header 1 value"');
    expect(body).toContain('aria-label="Remove header 2"');
    expect(body).toContain('UAG ≥ 2506');
    expect(body).not.toContain('placeholder=');
    expect(body).toContain('value="nosniff"');
  });

  it.each([
    { name: '', value: '' }, { name: 'Header', value: '' }, { name: '', value: 'value' },
    { name: ' ', value: 'value' }, { name: 'Header', value: ' ' }
  ])('retains incomplete rows in drafts and reports both-field requirements: %j', (row) => {
    const rows = [row];
    const value = serializeSecurityHeaderRows(rows);
    expect(parseSecurityHeaderRows(value)).toEqual(rows);
    expect(parseSecurityHeaderRows(JSON.parse(JSON.stringify(value)))).toEqual(rows);
    expect(parseSecurityHeaders(value)).toBeNull();
    expect(securityHeaderRowError(rows, 0)).toContain('both required');
    const body = bodyWith(value);
    expect(body).toContain('Header name and value are both required');
    expect(body).toContain('aria-describedby="f-securityHeaders-0-error"');
    expect(body).toContain('aria-invalid="true"');
    expect(validateConfig(configWith(value)).some((issue) => issue.fieldId === field.id && issue.level === 'error')).toBe(true);
  });

  it.each(['X-Test', 'x-test'])('preserves duplicate names instead of silently overwriting %s', (name) => {
    const rows = [{ name: 'X-Test', value: 'first' }, { name, value: 'second' }];
    const value = serializeSecurityHeaderRows(rows);
    expect(parseSecurityHeaderRows(value)).toEqual(rows);
    expect(parseSecurityHeaders(value)).toBeNull();
    expect(securityHeaderRowError(rows, 0)).toContain('unique');
    expect(bodyWith(value)).toContain('Header names must be unique');
    expect(importIni(`[Horizon]\nsecurityHeaders=${value}\n`).config.values.securityHeaders).toBe(value);
  });

  it('retains header values with equals, commas, quotes, colons, escapes and Unicode', () => {
    const rows = [{ name: 'X-Test', value: 'max-age=10, text="key:value", C:\\headers, æøå' }];
    const value = serializeSecurityHeaderRows(rows);
    expect(parseSecurityHeaderRows(value)).toEqual(rows);
    expect(parseSecurityHeaderRows(JSON.stringify(value))).toEqual(rows);
    expect(parseSecurityHeaders(value)).toEqual({ 'X-Test': rows[0].value });
  });

  it('does not normalize untouched imported JSON or appliance quoting during render', () => {
    const exported = JSON.stringify(JSON.stringify(Object.fromEntries(headers.map(({ name, value }) => [name, value])), null, 2));
    const imported = importIni(`[Horizon]\nsecurityHeaders=${exported}\n`).config;
    const before = generateIni(imported);
    render(SecurityHeadersEditor, { props: { field, values: imported.values, platform: 'vsphere' } });
    expect(imported.values.securityHeaders).toBe(exported);
    expect(generateIni(imported)).toBe(before);
    expect(parseSecurityHeaderRows(exported)).toEqual(headers);
    expect(generateIni(importIni(before).config)).toBe(before);
    expect(JSON.stringify(generateJsonObject(imported))).not.toContain('securityHeaders');
  });

  it('keeps malformed and non-string-map imports in the raw editor', () => {
    for (const value of ['not-json', '{"Header":1}', '{"Header":null}', '{"Header":1,"Header":"value"}', '[]']) {
      const values = { securityHeaders: value };
      const body = render(SecurityHeadersEditor, { props: { field, values, platform: 'vsphere', error: 'Invalid headers' } }).body;
      expect(body).toContain('<textarea');
      expect(body).toContain('This input is kept unchanged');
      expect(body).toContain('id="f-securityHeaders-error"');
      expect(values.securityHeaders).toBe(value);
      expect(parseSecurityHeaderRows(value)).toBeNull();
    }
  });

  it('omits removed rows, while disabling Horizon preserves the retained raw draft', () => {
    expect(serializeSecurityHeaderRows([])).toBe('');
    const config = configWith(raw);
    config.values.horizon_enabled = false;
    expect(generateIni(config)).not.toContain('securityHeaders=');
    expect(config.values.securityHeaders).toBe(raw);
    config.values.horizon_enabled = true;
    expect(parseSecurityHeaderRows(config.values.securityHeaders)).toEqual(headers);
    expect(generateIni(config)).toContain('securityHeaders=');
  });
});
