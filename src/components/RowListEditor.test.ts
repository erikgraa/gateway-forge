import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { GROUPS } from '../lib/schema';
import { defaultConfig } from '../lib/model';
import RowListEditor from './RowListEditor.svelte';

const field = GROUPS.find((group) => group.id === 'dns')!.fields.find((item) => item.id === 'dnsSearch')!;
const blastField = GROUPS.find((group) => group.id === 'horizon')!.fields.find((item) => item.id === 'blastAllowedHostHeaderValues')!;

describe('RowListEditor', () => {
  it('renders accessible DNS search domain add and remove rows', () => {
    const values = { ...defaultConfig().values, dnsSearch: 'corp.local example.local' };
    const { body } = render(RowListEditor, { props: { field, values, issues: [] } });

    expect(body).toContain('aria-label="Add dns search domain"');
    expect(body).toContain('aria-label="DNS search domain 1"');
    expect(body).toContain('aria-label="DNS search domain 2"');
    expect(body).toContain('aria-label="Remove dns search domain 1"');
    expect(body).toContain('aria-label="Remove dns search domain 2"');
  });

  it('associates independent validation errors with DNS search domain rows', () => {
    const values = { ...defaultConfig().values, dnsSearch: 'corp.local bad_domain.example' };
    const issues = [{
      id: 'network:dnsSearch:0',
      level: 'error' as const,
      section: 'network' as const,
      fieldId: 'dnsSearch',
      rowIndex: 1,
      message: 'DNS search domain 2: Not a valid DNS search domain'
    }];
    const { body } = render(RowListEditor, { props: { field, values, issues } });

    expect(body).toContain('aria-invalid="true"');
    expect(body).toContain('aria-describedby="f-dnsSearch-1-error"');
    expect(body).toContain('id="f-dnsSearch-1-error"');
    expect(body).toContain('Not a valid DNS search domain');
  });

  it('renders comma-backed Blast host header values as accessible rows', () => {
    const values = {
      ...defaultConfig().values,
      blastAllowedHostHeaderValues: 'uag.example.com:8443,_empty_'
    };
    const { body } = render(RowListEditor, { props: { field: blastField, values, issues: [], platform: 'vsphere' } });

    expect(body).toContain('aria-label="Add allowed host header"');
    expect(body).toContain('value="uag.example.com:8443"');
    expect(body).toContain('value="_empty_"');
    expect(body).toContain('aria-label="Remove allowed host header 2"');
  });
});
