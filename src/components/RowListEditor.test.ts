import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { GROUPS } from '../lib/schema';
import { defaultConfig } from '../lib/model';
import RowListEditor from './RowListEditor.svelte';

const field = GROUPS.find((group) => group.id === 'dns')!.fields.find((item) => item.id === 'dnsSearch')!;

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
});
