import { describe, expect, it } from 'vitest';
import { applyPatch, defaultConfig } from './model';
import { generateIni, generateJson } from './generate';
import { importIni, importJson } from './importer';
import { TEMPLATES } from './templates';
import { validateConfig } from './validate';

const serverIssues = (config: ReturnType<typeof defaultConfig>) => validateConfig(config)
  .filter((issue) => /Duplicate server|Already configured as NTP server/.test(issue.message));

describe('DNS and NTP redundancy advisories', () => {
  it.each<{ name: string; dns: string; ntpServers: string; fallBackNtpServers?: string; fields: string[] }>([
    { name: 'empty lists', dns: '', ntpServers: '', fields: [] },
    { name: 'whitespace-only lists', dns: '\n\t ', ntpServers: '\t ', fields: [] },
    { name: 'one DNS server', dns: '192.0.2.53', ntpServers: '', fields: ['dns'] },
    { name: 'one NTP server', dns: '', ntpServers: 'NTP1.example.com:123', fields: ['ntpServers'] },
    { name: 'one server for each service', dns: '192.0.2.53', ntpServers: '192.0.2.53', fields: ['dns', 'ntpServers'] },
    { name: 'multiple distinct servers', dns: '192.0.2.53\n192.0.2.54', ntpServers: 'ntp1.example.com\tntp2.example.com', fields: [] },
    { name: 'duplicate DNS spellings', dns: '10.0.0.1 10.00.0.01', ntpServers: '', fields: ['dns'] },
    { name: 'duplicate NTP case and ports', dns: '', ntpServers: 'NTP1.example.com ntp1.EXAMPLE.com:123 ntp1.example.com:124', fields: ['ntpServers'] },
    { name: 'distinct fallback', dns: '', ntpServers: 'ntp1.example.com', fallBackNtpServers: 'ntp2.example.com', fields: [] },
    { name: 'overlapping fallback', dns: '', ntpServers: 'ntp1.example.com', fallBackNtpServers: 'NTP1.example.com:123', fields: ['ntpServers'] },
    { name: 'single fallback only', dns: '', ntpServers: '', fallBackNtpServers: 'ntp1.example.com', fields: ['fallBackNtpServers'] },
    { name: 'multiple fallback only', dns: '', ntpServers: '', fallBackNtpServers: 'ntp1.example.com ntp2.example.com', fields: [] },
    { name: 'invalid-only lists', dns: '999.0.0.1', ntpServers: 'bad!host', fields: [] },
    { name: 'invalid rows alongside valid single endpoints', dns: '192.0.2.53 bad!ip', ntpServers: 'ntp1.example.com bad!host', fields: ['dns', 'ntpServers'] }
  ])('counts $name without changing the configuration', ({ name: _name, fields, ...values }) => {
    const config = applyPatch(defaultConfig(), { values });
    const before = JSON.stringify(config);
    const warnings = validateConfig(config).filter((issue) => /Only one distinct (DNS|NTP) server/.test(issue.message));
    expect(warnings.map((issue) => issue.fieldId)).toEqual(fields);
    expect(warnings.every((issue) => issue.level === 'warn' && issue.section === 'network')).toBe(true);
    for (const warning of warnings) {
      expect(warning.message).toContain('can be a single point of failure');
      expect(warning.message).toContain('multiple addresses alone do not guarantee redundancy');
    }
    expect(JSON.stringify(config)).toBe(before);
  });

  it('retains missing, syntax and duplicate findings independently of advisories', () => {
    const missing = validateConfig(defaultConfig());
    expect(missing).toContainEqual(expect.objectContaining({ fieldId: 'dns', level: 'error' }));
    expect(missing).toContainEqual(expect.objectContaining({ fieldId: 'ntpServers', level: 'warn', message: expect.stringContaining('No NTP server configured') }));
    const config = applyPatch(defaultConfig(), { values: { dns: '192.0.2.53 192.0.2.53 bad!ip', ntpServers: 'ntp1.example.com bad!host' } });
    const issues = validateConfig(config);
    expect(issues).toContainEqual(expect.objectContaining({ fieldId: 'dns', level: 'error', rowIndex: 1, message: expect.stringContaining('Duplicate server') }));
    expect(issues.filter((issue) => issue.level === 'error' && issue.rowIndex === 2 && issue.fieldId === 'dns')).toHaveLength(1);
    expect(issues.filter((issue) => issue.level === 'error' && issue.rowIndex === 1 && issue.fieldId === 'ntpServers')).toHaveLength(1);
    expect(issues.filter((issue) => /Only one distinct (DNS|NTP) server/.test(issue.message))).toHaveLength(2);
  });
});

describe('DNS and NTP server uniqueness', () => {
  it.each(['dns', 'ntpServers', 'fallBackNtpServers'])('flags repeated %s rows without changing values', (fieldId) => {
    const config = applyPatch(defaultConfig(), { values: { [fieldId]: '192.0.2.10\n 192.0.2.11\t192.0.2.10 192.0.2.10' } });
    const before = JSON.stringify(config);
    expect(serverIssues(config)).toEqual([
      expect.objectContaining({ level: 'error', section: 'network', fieldId, rowIndex: 2, message: expect.stringContaining('server 1') }),
      expect.objectContaining({ level: 'error', fieldId, rowIndex: 3, message: expect.stringContaining('server 1') })
    ]);
    expect(JSON.stringify(config)).toBe(before);
  });

  it('compares hostname case and host:port spellings by server, not endpoint', () => {
    const config = applyPatch(defaultConfig(), { values: {
      ntpServers: 'NTP1.corp.local ntp1.CORP.local:123 ntp1.corp.local:0123',
      fallBackNtpServers: 'ntp2.corp.local:123 NTP2.corp.local:124'
    } });
    expect(serverIssues(config).map(({ fieldId, rowIndex }) => ({ fieldId, rowIndex }))).toEqual([
      { fieldId: 'ntpServers', rowIndex: 1 },
      { fieldId: 'ntpServers', rowIndex: 2 },
      { fieldId: 'fallBackNtpServers', rowIndex: 1 }
    ]);
  });

  it('compares accepted zero-padded IPv4 octets numerically', () => {
    const config = applyPatch(defaultConfig(), { values: {
      dns: '10.00.0.01 10.0.0.1',
      ntpServers: '10.0.0.1:123 010.000.000.001:123',
      fallBackNtpServers: '010.00.00.01:124'
    } });
    expect(serverIssues(config)).toEqual([
      expect.objectContaining({ fieldId: 'dns', rowIndex: 1 }),
      expect.objectContaining({ fieldId: 'ntpServers', rowIndex: 1 }),
      expect.objectContaining({ fieldId: 'fallBackNtpServers', rowIndex: 0, message: expect.stringContaining('Already configured as NTP server 1') })
    ]);
  });

  it('flags overlap on fallback rows with the matching regular row number', () => {
    const config = applyPatch(defaultConfig(), { values: {
      ntpServers: 'ntp1.corp.local ntp2.corp.local',
      fallBackNtpServers: 'ntp3.corp.local NTP2.corp.local:123 ntp1.corp.local'
    } });
    expect(serverIssues(config)).toEqual([
      expect.objectContaining({ fieldId: 'fallBackNtpServers', rowIndex: 1, message: expect.stringContaining('NTP server 2') }),
      expect.objectContaining({ fieldId: 'fallBackNtpServers', rowIndex: 2, message: expect.stringContaining('NTP server 1') })
    ]);
    config.values.fallBackNtpServers = 'ntp3.corp.local ntp4.corp.local';
    expect(serverIssues(config)).toEqual([]);
  });

  it('allows one host to serve both DNS and NTP and ignores empty lists', () => {
    expect(serverIssues(applyPatch(defaultConfig(), { values: {
      dns: '192.0.2.10 192.0.2.11',
      ntpServers: '192.0.2.10 ntp1.corp.local',
      fallBackNtpServers: 'ntp2.corp.local'
    } }))).toEqual([]);
    expect(serverIssues(defaultConfig())).toEqual([]);
  });

  it('retains syntax errors instead of treating malformed entries as valid duplicates', () => {
    const config = applyPatch(defaultConfig(), { values: {
      dns: '999.0.0.1 999.0.0.1',
      ntpServers: 'bad!host bad!host',
      fallBackNtpServers: 'bad!host'
    } });
    expect(serverIssues(config)).toEqual([]);
    expect(validateConfig(config).filter((issue) => issue.rowIndex !== undefined)).toHaveLength(5);
  });

  it('preserves imported duplicate spelling, order and counts through supported exports', () => {
    const source = '[General]\ndns=10.0.0.1 10.00.0.01\nntpServers=NTP1.corp.local ntp1.corp.local\nfallBackNtpServers=ntp1.corp.local NTP2.corp.local ntp2.corp.local';
    const config = importIni(source).config;
    const before = JSON.stringify(config);
    expect(serverIssues(config)).toHaveLength(4);
    const iniRoundTrip = importIni(generateIni(config)).config;
    for (const fieldId of ['dns', 'ntpServers', 'fallBackNtpServers']) {
      expect(iniRoundTrip.values[fieldId]).toBe(config.values[fieldId]);
    }
    const jsonRoundTrip = importJson(generateJson(config)).config;
    for (const fieldId of ['ntpServers', 'fallBackNtpServers']) {
      expect(jsonRoundTrip.values[fieldId]).toBe(config.values[fieldId]);
    }
    expect(serverIssues(iniRoundTrip)).toHaveLength(4);
    expect(serverIssues(jsonRoundTrip)).toHaveLength(3);
    expect(JSON.stringify(config)).toBe(before);
  });

  it.each(TEMPLATES)('keeps $id example servers unique', (template) => {
    expect(serverIssues(template.build(defaultConfig()))).toEqual([]);
  });
});
