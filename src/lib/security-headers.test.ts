import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import FieldInput from '../components/FieldInput.svelte';
import { GROUPS } from './schema';
import { applyPatch, defaultConfig } from './model';
import { generateIni, generateJsonObject } from './generate';
import { importIni } from './importer';
import { generatePowerShell } from './powershell';
import { validateConfig } from './validate';
import { formatSecurityHeadersIni, parseSecurityHeaders } from './security-headers';

const field = GROUPS.find((group) => group.target === 'horizon')!.fields.find((entry) => entry.id === 'securityHeaders')!;
const custom = { yes: 'ok', yesss: 'oook' };
const customLine = String.raw`securityHeaders="{\"yes\":\"ok\",\"yesss\":\"oook\"}"`;
const exported = String.raw`"{\"X-Frame-Options\":\"SAMEORIGIN\",\"Strict-Transport-Security\":\"max-age=63072000; includeSubdomains; preload\",\"X-Content-Type-Options\":\"nosniff\",\"yes\":\"ok\",\"Content-Security-Policy\":\"default-src 'self';font-src 'self' data:;script-src 'self' ;style-src 'self' 'unsafe-inline';frame-ancestors 'none'; form-action 'self'; base-uri 'self';img-src 'self' blob: data:\",\"yesss\":\"oook\"}"`;
const configWith = (securityHeaders: string, enabled = true) => applyPatch(defaultConfig(), { values: { horizon_enabled: enabled, securityHeaders } });
const headerIssues = (securityHeaders: string, enabled = true) => validateConfig(configWith(securityHeaders, enabled)).filter((issue) => issue.fieldId === 'securityHeaders');

describe('Horizon security headers appliance INI format', () => {
  it('quotes and escapes custom JSON exactly once without adding appliance defaults', () => {
    const config = configWith(JSON.stringify(custom));
    const ini = generateIni(config);
    expect(ini).toContain(customLine);
    expect(ini).not.toContain('X-Frame-Options');
    expect(ini).not.toContain('Content-Security-Policy');
    expect(generatePowerShell(config)).toContain(customLine);
    expect(config.values.securityHeaders).toBe(JSON.stringify(custom));
    expect(headerIssues(JSON.stringify(custom))).toEqual([]);
  });

  it('accepts the supplied appliance export and preserves explicit defaults and both custom entries', () => {
    const imported = importIni(`[Horizon]\nsecurityHeaders=${exported}\n`).config;
    expect(imported.values.securityHeaders).toBe(exported);
    expect(parseSecurityHeaders(exported)).toMatchObject({
      'X-Frame-Options': 'SAMEORIGIN', 'X-Content-Type-Options': 'nosniff', yes: 'ok', yesss: 'oook'
    });
    expect(Object.keys(parseSecurityHeaders(exported)!)).toHaveLength(6);
    expect(generateIni(imported)).toContain(`securityHeaders=${exported}`);
    expect(headerIssues(exported)).toEqual([]);
  });

  it('keeps semantic custom-header values and stable serialization through repeated INI round trips', () => {
    const first = generateIni(configWith(JSON.stringify(custom, null, 2)));
    const imported = importIni(first).config;
    expect(parseSecurityHeaders(imported.values.securityHeaders)).toEqual(custom);
    expect(generateIni(imported)).toBe(first);
    expect(generateIni(importIni(generateIni(imported)).config)).toBe(first);
  });

  it('retains quotes, apostrophes, backslashes and Unicode inside header values', () => {
    const headers = { Quote: 'a "quoted" value', Path: 'C:\\headers', CSP: "default-src 'self'", Unicode: 'æøå' };
    const encoded = formatSecurityHeadersIni(JSON.stringify(headers));
    expect(JSON.parse(JSON.parse(encoded))).toEqual(headers);
    expect(parseSecurityHeaders(encoded)).toEqual(headers);
    expect(formatSecurityHeadersIni(encoded)).toBe(encoded);
  });

  it('omits an unset field and does not materialize the example or defaults', () => {
    const config = configWith('');
    expect(generateIni(config)).not.toContain('securityHeaders=');
    expect(config.values.securityHeaders).toBe('');
    expect(headerIssues('')).toEqual([]);
    const { body } = render(FieldInput, { props: { field, values: config.values, platform: 'vsphere' } });
    expect(body).not.toContain('placeholder=');
    expect(body).toContain('Leave empty to retain appliance defaults');
  });

  it('remains INI-only rather than inferring a settings JSON contract', () => {
    expect(field.json).toBe(false);
    expect(JSON.stringify(generateJsonObject(configWith(JSON.stringify(custom))))).not.toContain('securityHeaders');
  });

  it('retains headers while Horizon is disabled, without exporting or validating hidden values', () => {
    const config = configWith(exported, false);
    expect(generateIni(config)).not.toContain('securityHeaders=');
    expect(config.values.securityHeaders).toBe(exported);
    expect(headerIssues('not-json', false)).toEqual([]);
    config.values.horizon_enabled = true;
    expect(generateIni(config)).toContain(`securityHeaders=${exported}`);
  });

  it.each(['not-json', '[]', 'null', 'true', '1', '{"name":1}', '{"name":null}', '{"name":{}}', '{"": "value"}', '{"yes":"ok"'])('reports malformed or non-string-map input %s without silently deleting it', (raw) => {
    expect(parseSecurityHeaders(raw)).toBeNull();
    expect(headerIssues(raw)[0]?.level).toBe('error');
    const imported = importIni(`[Horizon]\nsecurityHeaders=${raw}\n`).config;
    expect(imported.values.securityHeaders).toBe(raw);
    expect(formatSecurityHeadersIni(raw)).toBe(raw);
  });

  it('associates the syntax error with the textarea accessibly', () => {
    const { body } = render(FieldInput, { props: { field, values: { securityHeaders: 'not-json' }, platform: 'vsphere', error: 'Enter a JSON object of header names and string values' } });
    expect(body).toContain('aria-invalid="true"');
    expect(body).toContain('aria-describedby="f-securityHeaders-error"');
    expect(body).toContain('id="f-securityHeaders-error"');
  });
});
