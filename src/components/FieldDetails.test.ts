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
    expect(body).toContain('href="https://docs.omnissa.com/"');
    expect(body).toContain('Official Omnissa documentation');
  });
});
