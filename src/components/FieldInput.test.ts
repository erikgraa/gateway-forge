import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import FieldInput from './FieldInput.svelte';
import { GROUPS, fieldHelp } from '../lib/schema';
import { applyPatch, defaultConfig } from '../lib/model';
import { generateIni } from '../lib/generate';
import { importIni } from '../lib/importer';
import { validateConfig } from '../lib/validate';

const datastore = GROUPS.find((group) => group.id === 'deploy')!.fields.find((field) => field.id === 'ds')!;
const platforms = ['hyperv', 'vsphere'] as const;
const source = GROUPS.find((group) => group.id === 'deploy')!.fields.find((field) => field.id === 'source')!;

describe('source image examples', () => {
  it.each(platforms)('shows the %s image extension without filling or rewriting the value', (platform) => {
    const values = { source: '' };
    const { body } = render(FieldInput, { props: { field: source, values, platform } });
    const extension = platform === 'hyperv' ? 'vhdx' : 'ova';
    expect(body).toContain(`placeholder="C:\\images\\euc-unified-access-gateway-26.09.0.0-[..].${extension}"`);
    expect(body).toContain('Replace [..] with the actual image filename build text.');
    expect(values.source).toBe('');
    expect(source.key).toBe('source');
  });
});

const vlanFields = GROUPS.flatMap((group) => group.fields).filter((field) => field.id.startsWith('hv_vlan'));
describe('Hyper-V VLAN fields', () => {
  it.each(vlanFields)('renders $id bounds and accessible project-only help', (field) => {
    const { body } = render(FieldInput, { props: { field, values: {}, platform: 'hyperv' } });
    expect(body).toContain('min="1" max="4094"');
    expect(body).toContain(`aria-describedby="f-${field.id}-help"`);
    expect(body).toContain('<code>Not exported</code>');
  });

  it('associates a VLAN error with its numeric input', () => {
    const field = vlanFields[0];
    const { body } = render(FieldInput, { props: { field, values: { hv_vlan0: 4095 }, platform: 'hyperv', error: 'NIC0 Internet access VLAN must be ≤ 4094' } });
    expect(body).toContain('aria-invalid="true"');
    expect(body).toContain('aria-describedby="f-hv_vlan0-error"');
    expect(body).toContain('id="f-hv_vlan0-error"');
  });
});

describe('deployment storage field', () => {
  it.each(platforms)('shows platform-specific %s terminology without changing the INI key', (platform) => {
    const values = { ds: '' };
    const { body } = render(FieldInput, { props: { field: datastore, values, platform } });
    const label = platform === 'hyperv' ? 'VM storage path' : 'Datastore';
    const placeholder = platform === 'hyperv' ? 'C:\\ClusterStorage\\Volume1\\uag-name' : 'datastore1';
    expect(body).toContain(label);
    expect(body).toContain(`placeholder="${placeholder}"`);
    expect(body).toContain(`aria-label="More information about ${label}"`);
    expect(body).toContain('<code>ds</code>');
    expect(datastore.key).toBe('ds');
    expect(values).toEqual({ ds: '' });
    if (platform === 'hyperv') {
      expect(body).toContain('Filesystem path on the Hyper-V deployment host');
      expect(body).toContain('not a vSphere datastore name');
    } else {
      expect(body).not.toContain('VM storage path');
      expect(fieldHelp(datastore, platform)).toBeUndefined();
    }
  });

  it.each(platforms)('uses the %s storage label in required-field feedback', (platform) => {
    const config = applyPatch(defaultConfig(), { platform, values: { ds: '' } });
    const label = platform === 'hyperv' ? 'VM storage path' : 'Datastore';
    expect(validateConfig(config).find((issue) => issue.fieldId === 'ds')?.message).toBe(`${label} is required`);
  });

  it.each(platforms.flatMap((platform) => [
    'C:\\ClusterVol\\UAG-name',
    'C:\\ClusterStorage\\Volume1\\uag-name',
    '\\\\fileserver\\VMs\\Custom UAG',
    'legacy-custom-value'
  ].map((ds) => ({ platform, ds }))))('preserves $platform imported/custom storage $ds', ({ platform, ds }) => {
    const config = importIni(`[General]\nds=${ds}\n`, applyPatch(defaultConfig(), { platform })).config;
    const before = structuredClone(config);
    render(FieldInput, { props: { field: datastore, values: config.values, platform } });
    expect(config).toEqual(before);
    expect(config.values.ds).toBe(ds);
    const ini = generateIni(config);
    expect(ini).toContain(`\nds=${ds}\n`);
    expect(importIni(ini, config).config.values.ds).toBe(ds);
    expect(validateConfig(config).filter((issue) => issue.fieldId === 'ds')).toEqual([]);
  });
});
