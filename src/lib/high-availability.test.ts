import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import FieldInput from '../components/FieldInput.svelte';
import { GROUPS, SECTIONS } from './schema';
import { applyPatch, defaultConfig, sectionSelected, stripSecrets } from './model';
import { generateIni, generateJson, generateJsonObject } from './generate';
import { importIni, importJson } from './importer';
import { generatePowerShell } from './powershell';
import { generateDocs } from './topology';
import { validateConfig } from './validate';

const group = GROUPS.find((g) => g.id === 'ha')!;
const configured = () => applyPatch(defaultConfig(), { values: { ha_enabled: true, ha_groupId: 42, ha_virtualIPAddress: '192.0.2.100' } });
const haIssues = (c: ReturnType<typeof defaultConfig>) => validateConfig(c).filter((issue) => issue.section === 'ha');

describe('optional native high availability', () => {
  it('places the section immediately before Edge services with no seeded values', () => {
    const c = defaultConfig();
    const index = SECTIONS.findIndex((s) => s.id === 'ha');
    expect(SECTIONS[index + 1].id).toBe('services');
    expect(c.values).toMatchObject({ ha_enabled: false, ha_groupId: '', ha_virtualIPAddress: '' });
    expect(sectionSelected(c, 'ha')).toBe(false);
    expect(haIssues(c)).toEqual([]);
  });

  it('retains hidden values and existing artifacts when disabled or unconfigured', () => {
    const baseline = defaultConfig();
    for (const c of [applyPatch(configured(), { values: { ha_enabled: false } }), applyPatch(baseline, { values: { ha_enabled: true } })]) {
      expect(generateIni(c)).toBe(generateIni(baseline));
      expect(generateJson(c)).toBe(generateJson(baseline));
      expect(generatePowerShell(c)).toBe(generatePowerShell(baseline));
    }
    const hidden = applyPatch(configured(), { values: { ha_enabled: false } });
    const restored = applyPatch(defaultConfig(), stripSecrets(hidden));
    expect(restored.values).toMatchObject({ ha_enabled: false, ha_groupId: 42, ha_virtualIPAddress: '192.0.2.100' });
    expect(generateDocs(hidden, [])).not.toContain('## High availability');
  });

  it('emits the exact INI keys, embeds that INI in PowerShell and uses the verified JSON mapping', () => {
    const c = configured();
    const section = '[HighAvailability]\ngroupId=42\nvirtualIPAddress=192.0.2.100\n';
    expect(generateIni(c)).toContain(section);
    expect(generatePowerShell(c)).toContain(section);
    expect(generateJsonObject(c).loadBalancerSettings).toEqual({ groupID: 42, virtualIPAddress: '192.0.2.100', loadBalancerMode: 'ONEARM' });
    expect(generateJson(c)).not.toContain('"groupId"');
    expect(generateDocs(c, [])).toContain('same groupId');
    expect(generateDocs(c, [])).toContain('same subnet as the eth0 interface');
  });

  it.each([1, 255])('accepts inclusive groupId boundary %s', (ha_groupId) => {
    const c = applyPatch(configured(), { values: { ha_groupId } });
    expect(haIssues(c)).toEqual([]);
    for (const result of [importIni(generateIni(c)), importJson(generateJson(c))]) {
      expect(result.config.values).toMatchObject({ ha_enabled: true, ha_groupId, ha_virtualIPAddress: '192.0.2.100' });
    }
  });

  it.each([0, 256, -1, 1.5, 'not-a-number', ''])('rejects invalid groupId %s without rewriting it', (ha_groupId) => {
    const c = applyPatch(configured(), { values: { ha_groupId } });
    expect(haIssues(c).some((i) => i.fieldId === 'ha_groupId' && i.level === 'error')).toBe(true);
    expect(c.values.ha_groupId).toBe(ha_groupId);
  });

  it.each(['', 'uag.example.com', '256.0.0.1', '192.0.2.100/24', 'https://192.0.2.100', '2001:db8::1'])('rejects non-IPv4 VIP %s', (ha_virtualIPAddress) => {
    const c = applyPatch(configured(), { values: { ha_virtualIPAddress } });
    expect(haIssues(c).some((i) => i.fieldId === 'ha_virtualIPAddress' && i.level === 'error')).toBe(true);
    expect(c.values.ha_virtualIPAddress).toBe(ha_virtualIPAddress);
  });

  it('imports case-insensitive operator INI spelling and preserves invalid values for correction', () => {
    const result = importIni('[highavailability]\nGroupID=256\nVirtualIPAddress=invalid\nother=keep-visible\n');
    expect(result.config.values).toMatchObject({ ha_enabled: true, ha_groupId: 256, ha_virtualIPAddress: 'invalid' });
    expect(result.unmapped).toContainEqual({ where: '[highavailability]', key: 'other', value: 'keep-visible' });
    expect(haIssues(result.config)).toHaveLength(2);
  });

  it('does not fill a partially imported HA section from a populated draft', () => {
    for (const result of [importIni('[HighAvailability]\ngroupId=7\n', configured()), importJson('{"loadBalancerSettings":{"groupID":7,"loadBalancerMode":"ONEARM"}}', configured())]) {
      expect(result.config.values.ha_virtualIPAddress).toBe('');
      expect(haIssues(result.config).some((i) => i.fieldId === 'ha_virtualIPAddress')).toBe(true);
    }
  });

  it('disables absent HA on import without deleting the prior stored values', () => {
    for (const result of [importIni('[General]\nuagName=test\n', configured()), importJson('{"systemSettings":{"uagName":"test"}}', configured())]) {
      expect(result.config.values).toMatchObject({ ha_enabled: false, ha_groupId: 42, ha_virtualIPAddress: '192.0.2.100' });
      expect(generateIni(result.config)).not.toContain('[HighAvailability]');
    }
  });

  it.each(['DISABLED', 'INLINE', undefined])('never converts imported mode %s to enabled ONEARM', (loadBalancerMode) => {
    const result = importJson(JSON.stringify({ loadBalancerSettings: { groupID: 9, virtualIPAddress: '192.0.2.100', loadBalancerMode } }), configured());
    expect(result.config.values).toMatchObject({ ha_enabled: false, ha_groupId: 9, ha_virtualIPAddress: '192.0.2.100' });
    expect(generateJsonObject(result.config)).not.toHaveProperty('loadBalancerSettings');
    expect(result.warnings.length > 0).toBe(loadBalancerMode !== 'DISABLED');
  });

  it.each([null, [], 'invalid'])('reports malformed loadBalancerSettings %s without enabling HA', (loadBalancerSettings) => {
    const result = importJson(JSON.stringify({ loadBalancerSettings }), configured());
    expect(result.config.values.ha_enabled).toBe(false);
    expect(result.warnings).toContain('loadBalancerSettings must be an object; native HA remains disabled.');
  });

  it.each([0, 1, 2])('rejects VIP collisions with configured NIC%s, including retained hidden addresses', (nic) => {
    const c = applyPatch(configured(), { values: { deploymentOption: 'onenic', [`ip${nic}`]: '192.0.2.100' } });
    expect(haIssues(c).some((issue) => issue.level === 'error' && issue.fieldId === 'ha_virtualIPAddress' && issue.message.includes(`NIC${nic}`))).toBe(true);
    expect(c.values[`ip${nic}`]).toBe('192.0.2.100');
  });

  it('compares valid IPv4 addresses semantically after trimming', () => {
    const c = applyPatch(configured(), { values: { ip0: ' 192.0.02.100 ' } });
    expect(haIssues(c).some((issue) => issue.message.includes('NIC0'))).toBe(true);
  });

  it('ignores collisions when HA is disabled and does not guess unknown addresses', () => {
    const c = applyPatch(configured(), { values: { ha_enabled: false, ip0: '192.0.2.100' } });
    expect(haIssues(c)).toEqual([]);
    const unknown = applyPatch(configured(), { values: { ip0: '', ip1: 'DHCP', ip2: '2001:db8::1' } });
    expect(haIssues(unknown)).toEqual([]);
  });

  it('accepts a VIP distinct from all configured NIC addresses', () => {
    const c = applyPatch(configured(), { values: { ip0: '192.0.2.1', ip1: '192.0.2.2', ip2: '192.0.2.3' } });
    expect(haIssues(c)).toEqual([]);
  });

  it('does not infer subnet validity when deployment addressing is absent or dynamic', () => {
    const c = applyPatch(configured(), { values: { ip0: '', netmask0: '', ipmode0: 'DHCPV4' } });
    expect(haIssues(c)).toEqual([]);
  });

  it('excludes documented unsupported Azure HA while retaining settings and reporting the problem', () => {
    const c = applyPatch(configured(), { platform: 'azure' });
    expect(generateIni(c)).not.toContain('[HighAvailability]');
    expect(generateJsonObject(c)).not.toHaveProperty('loadBalancerSettings');
    expect(haIssues(c)[0].message).toContain('not supported on Azure');
    expect(c.values.ha_groupId).toBe(42);
  });

  it.each(group.fields)('associates $id guidance and validation with the input', (field) => {
    const help = render(FieldInput, { props: { field, values: defaultConfig().values, platform: 'vsphere' } }).body;
    expect(help).toContain(`aria-describedby="f-${field.id}-help"`);
    expect(help).toContain(field.id === 'ha_groupId' ? 'same groupId' : 'The Virtual IP Address used for High Availability. This IP should be in the same subnet as the eth0 interface');
    if (field.id === 'ha_groupId') expect(help).toContain('min="1" max="255"');
    const error = render(FieldInput, { props: { field, values: configured().values, platform: 'vsphere', error: 'Invalid HA setting' } }).body;
    expect(error).toContain('aria-invalid="true"');
    expect(error).toContain(`aria-describedby="f-${field.id}-error"`);
    expect(error).toContain(`id="f-${field.id}-error"`);
  });
});
