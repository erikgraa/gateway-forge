import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import FieldInput from '../components/FieldInput.svelte';
import { defaultConfig, fieldAvailable, newListItem, stripSecrets } from './model';
import { generateIni, generateJson } from './generate';
import { importIni } from './importer';
import { LISTS } from './schema';
import { TEMPLATES } from './templates';
import { validateConfig } from './validate';

const caId = 'syslogServerCACertPemV2';
const caField = LISTS.find((list) => list.id === 'syslog')!.fields.find((field) => field.id === caId)!;
const caIssues = (c: ReturnType<typeof defaultConfig>) => validateConfig(c).filter((issue) => issue.fieldId === caId);
const destination = (transport = 'TLS', ca: string | undefined = undefined) => ({
  ...newListItem('syslog'), sysLogType: transport, hostname: 'syslog.example.test', port: 6514,
  ...(ca === undefined ? {} : { [caId]: ca })
});
const caPath = 'C:\\certs\\synthetic-test-ca.pem';

describe('TLS syslog server CA', () => {
  it.each([undefined, '', '   ', '\t\n'])('requires a field-associated CA for a TLS destination with %s', (ca) => {
    const c = defaultConfig();
    c.syslog = [destination('TLS', ca)];
    expect(caIssues(c)).toEqual([expect.objectContaining({
      level: 'error', section: 'monitoring', list: { id: 'syslog', index: 0 },
      message: 'Syslog server 1: Server CA cert (PEM path) is required'
    })]);
  });

  it('accepts a supplied CA path without requiring optional TLS client credentials', () => {
    const c = defaultConfig();
    c.syslog = [destination('TLS', caPath)];
    expect(validateConfig(c).filter((issue) => issue.list?.id === 'syslog')).toEqual([]);
  });

  it.each(['UDP', 'TCP', 'MQTT'])('does not require or show the TLS CA for %s', (transport) => {
    const c = defaultConfig();
    c.syslog = [destination(transport, '   ')];
    expect(caIssues(c)).toEqual([]);
    expect(fieldAvailable(caField, c.version, c.platform, c.syslog[0])).toBe(false);
  });

  it('checks all five destination slots independently, including mixed transports', () => {
    const c = defaultConfig();
    c.syslog = Array.from({ length: 5 }, () => destination());
    expect(caIssues(c).map((issue) => issue.list!.index)).toEqual([0, 1, 2, 3, 4]);
    c.syslog[1][caId] = caPath;
    c.syslog[3].sysLogType = 'UDP';
    expect(caIssues(c).map((issue) => issue.list!.index)).toEqual([0, 2, 4]);
  });

  it('preserves saved CA paths and restores applicable INI export after changing transport', () => {
    const c = defaultConfig();
    c.syslog = [destination('TLS', caPath)];
    expect(generateIni(c)).toContain(`${caId}=${caPath}`);
    c.syslog[0].sysLogType = 'TCP';
    expect(caIssues(c)).toEqual([]);
    expect(generateIni(c)).not.toContain(`${caId}=`);
    const saved = stripSecrets(c);
    expect(saved.syslog[0][caId]).toBe(caPath);
    saved.syslog[0].sysLogType = 'TLS';
    expect(generateIni(saved)).toContain(`${caId}=${caPath}`);
    expect(caIssues(saved)).toEqual([]);
  });

  it('preserves missing and supplied CA values on INI import, with intentional JSON exclusion', () => {
    const c = defaultConfig();
    c.syslog = [destination(), destination('TLS', caPath)];
    const before = JSON.stringify(c);
    const imported = importIni(generateIni(c)).config;
    expect(caIssues(imported).map((issue) => issue.list!.index)).toEqual([0]);
    expect(imported.syslog[1][caId]).toBe(caPath);
    expect(generateJson(c)).not.toContain(caId);
    expect(generateJson(c)).not.toContain(caPath);
    expect(JSON.stringify(c)).toBe(before);
  });

  it('marks the TLS CA input as required with the per-destination error and useful guidance', () => {
    const c = defaultConfig();
    const values = destination();
    c.syslog = [values];
    const error = caIssues(c)[0].message;
    const { body } = render(FieldInput, { props: { field: caField, values, platform: c.platform, uid: `syslog0_${caId}`, error } });
    expect(body).toContain(`id="f-syslog0_${caId}"`);
    expect(body).toContain('required');
    expect(body).toContain('title="Required"');
    expect(body).toContain('Server CA cert (PEM path) is required');
    expect(body).toContain('Provide the real CA certificate PEM file');
  });

  it('leaves template TLS destinations visibly incomplete until the operator supplies real CA material', () => {
    for (const template of TEMPLATES) {
      const c = template.build(defaultConfig());
      const missing = c.syslog.flatMap((item, index) => item.sysLogType === 'TLS' && !String(item[caId] ?? '').trim() ? [index] : []);
      expect(caIssues(c).map((issue) => issue.list!.index), template.id).toEqual(missing);
    }
  });
});
