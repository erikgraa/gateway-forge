import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import FieldInput from '../components/FieldInput.svelte';
import { defaultConfig, fieldAvailable, newListItem, stripSecrets } from './model';
import { generateIni, generateJson } from './generate';
import { importIni, importJson } from './importer';
import { LISTS } from './schema';
import { TEMPLATES } from './templates';
import { validateConfig } from './validate';
import { setSyslogServer, syslogDestination, syslogUrl } from './syslog';
import type { Values } from './schema';

const caId = 'syslogServerCACertPemV2';
const caField = LISTS.find((list) => list.id === 'syslog')!.fields.find((field) => field.id === caId)!;
const caIssues = (c: ReturnType<typeof defaultConfig>) => validateConfig(c).filter((issue) => issue.fieldId === caId);
const destination = (transport = 'TLS', ca: string | undefined = undefined) => ({
  ...newListItem('syslog'), sysLogType: transport, hostname: 'syslog.example.test', port: 6514,
  ...(ca === undefined ? {} : { [caId]: ca })
});
const caPath = 'C:\\certs\\synthetic-test-ca.pem';

describe('editable syslog destination ports', () => {
  const fields = LISTS.find((list) => list.id === 'syslog')!.fields;
  const portField = fields.find((field) => field.id === 'syslogPort')!;
  const serverField = fields.find((field) => field.id === 'syslogUrl')!;

  it.each([['UDP', 514], ['TCP', 6514], ['MQTT', 1883]] as const)('uses the %s default in the editor and both export formats', (protocol, port) => {
    const c = defaultConfig();
    const values: Values = { ...newListItem('syslog'), sysLogType: protocol, syslogUrl: 'logs.example.test' };
    c.syslog = [values];
    expect(syslogDestination(values)).toEqual({ server: 'logs.example.test', port });
    const { body } = render(FieldInput, { props: { field: portField, values, platform: c.platform, uid: 'syslog0_syslogPort' } });
    expect(body).toContain(`value="${port}"`);
    expect(body).toContain('id="f-syslog0_syslogPort"');
    expect(generateIni(c)).toContain(`syslogUrl=logs.example.test:${port}`);
    const json = JSON.parse(generateJson(c)).syslogSettings.syslogServerSettingsList[0];
    expect(json.syslogUrl).toBe(`logs.example.test:${port}`);
    expect(json).not.toHaveProperty('syslogPort');
    expect(json).not.toHaveProperty('port');
    expect(validateConfig(c).filter((issue) => issue.list?.id === 'syslog' && issue.level === 'error')).toEqual([]);
  });

  it('follows protocol defaults until a port is explicitly entered, including an explicit default', () => {
    const values: Values = { sysLogType: 'UDP', syslogUrl: 'logs.example.test' };
    values.sysLogType = 'TCP';
    expect(syslogDestination(values).port).toBe(6514);
    values.sysLogType = 'MQTT';
    expect(syslogDestination(values).port).toBe(1883);
    values.syslogPort = 1883;
    values.sysLogType = 'UDP';
    expect(syslogUrl(values)).toBe('logs.example.test:1883');
    values.sysLogType = 'TLS';
    values.port = 7514;
    values.sysLogType = 'TCP';
    expect(syslogDestination(values).port).toBe(1883);
    expect(values.port).toBe(7514);
  });

  it.each(['logs.example.test:00514', '[2001:db8::1]:7514'])('preserves imported spelling/custom ports and round-trips %s', (url) => {
    for (const c of [
      importIni(`[SyslogServerSettings1]\nsysLogType=UDP\nsyslogUrl=${url}`).config,
      importJson(JSON.stringify({ syslogSettings: { syslogServerSettingsList: [{ sysLogType: 'UDP', syslogUrl: url }] } })).config
    ]) {
      c.syslog[0].sysLogType = 'TCP';
      expect(syslogUrl(c.syslog[0])).toBe(url);
      expect(importIni(generateIni(c)).config.syslog[0].syslogUrl).toBe(url);
      expect(importJson(generateJson(c)).config.syslog[0].syslogUrl).toBe(url);
      const { body } = render(FieldInput, { props: { field: serverField, values: c.syslog[0], platform: c.platform } });
      expect(body).toContain(`value="${syslogDestination(c.syslog[0]).server}"`);
      expect(body).not.toContain('Server URL');
      c.syslog[0].syslogPort = 9514;
      expect(syslogUrl(c.syslog[0])).toBe(`${syslogDestination(c.syslog[0]).server}:9514`);
      expect(syslogDestination(stripSecrets(c).syslog[0]).port).toBe(9514);
    }
  });

  it('retains a port when editing/clearing the server and accepts an explicitly pasted new port', () => {
    const values: Values = { sysLogType: 'UDP', syslogUrl: 'old.example.test:7514' };
    setSyslogServer(values, '');
    expect(syslogUrl(values)).toBe('');
    setSyslogServer(values, 'new.example.test');
    expect(syslogUrl(values)).toBe('new.example.test:7514');
    setSyslogServer(values, '[2001:db8::2]:8514');
    expect(syslogUrl(values)).toBe('[2001:db8::2]:8514');
    expect(values.syslogPort).toBeUndefined();
    setSyslogServer(values, '2001:db8::3');
    expect(syslogUrl(values)).toBe('[2001:db8::3]:8514');
  });

  it.each(['', 0, 65536, 1.5, 'abc'])('reports an accessible port error for %s rather than silently substituting a default', (port) => {
    const c = defaultConfig();
    c.syslog = [{ sysLogType: 'UDP', syslogUrl: 'logs.example.test', syslogPort: port }];
    const error = validateConfig(c).find((issue) => issue.fieldId === 'syslogPort')!;
    expect(error.level).toBe('error');
    const { body } = render(FieldInput, { props: { field: portField, values: c.syslog[0], platform: c.platform, error: error.message } });
    expect(body).toContain('aria-invalid="true"');
    expect(body).toContain('aria-describedby="f-syslogPort-error"');
  });

  it.each(['', 'abc', '65536'])('reports an invalid imported port %s without rewriting the destination', (port) => {
    const url = `logs.example.test:${port}`;
    const c = importIni(`[SyslogServerSettings1]\nsysLogType=UDP\nsyslogUrl=${url}`).config;
    const before = JSON.stringify(c);
    expect(validateConfig(c)).toContainEqual(expect.objectContaining({ fieldId: 'syslogPort', level: 'error' }));
    expect(syslogUrl(c.syslog[0])).toBe(url);
    expect(JSON.stringify(c)).toBe(before);
  });

  it('keeps TLS hostname/port serialization and hides the non-TLS virtual port', () => {
    const c = defaultConfig();
    c.syslog = [destination('TLS', caPath)];
    c.syslog[0].port = 9514;
    expect(fieldAvailable(portField, c.version, c.platform, c.syslog[0])).toBe(false);
    const ini = generateIni(c);
    expect(ini).toContain('hostname=syslog.example.test');
    expect(ini).toContain('port=9514');
    expect(ini).not.toContain('syslogUrl=');
    expect(ini).not.toContain('syslogPort=');
    expect(JSON.parse(generateJson(c)).syslogSettings.syslogServerSettingsList[0]).toMatchObject({ hostname: 'syslog.example.test', port: 9514 });
  });
});

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
