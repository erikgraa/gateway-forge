import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import FieldDetails from './FieldDetails.svelte';
import { GROUPS } from '../lib/schema';

describe('FieldDetails', () => {
  it('shows field-specific mapping metadata and the official documentation URL', () => {
    const field = GROUPS.find((group) => group.id === 'appliance')!.fields.find((item) => item.id === 'uagName')!;
    const body = render(FieldDetails, { props: { field, platform: 'vsphere' } }).body;

    expect(body).toContain('More information about UAG name');
    expect(body).toContain('<code>uagName</code>');
    expect(body).not.toContain('href=');
  });

  it('keeps INI and JSON metadata in separate side-by-side mapping cells', () => {
    const field = GROUPS.find(group => group.id === 'appliance')!.fields.find(item => item.id === 'uagName')!;
    const body = render(FieldDetails, { props: { field, platform: 'vsphere' } }).body;
    expect(body.match(/class="field-key-mapping/g)).toHaveLength(2);
    expect(body).toMatch(/<dt[^>]*>INI key<\/dt>/);
    expect(body).toMatch(/<dt[^>]*>JSON key<\/dt>/);
    expect(body).toContain('aria-describedby="field-details-uagName"');
    expect(body).toContain('role="tooltip"');
  });

  it('retains explicit not-exported metadata', () => {
    const field = { ...GROUPS[0].fields[0], ini: false as const, json: false as const };
    const body = render(FieldDetails, { props: { field, platform: 'vsphere' } }).body;
    expect(body.match(/Not exported/g)).toHaveLength(2);
  });
});
