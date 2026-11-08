import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { GROUPS } from '../lib/schema';
import { defaultConfig } from '../lib/model';
import TrustedCertEditor from './TrustedCertEditor.svelte';

const fields = GROUPS.find((group) => group.id === 'horizon')!.fields;

describe('TrustedCertEditor', () => {
  it('renders an accessible add control and certificate path rows', () => {
    const values = { ...defaultConfig().values };
    values.trustedCert1 = 'C:\\certs\\root.pem';
    values.trustedCert2 = '/certs/intermediate.pem';
    const { body } = render(TrustedCertEditor, {
      props: { fields, values, issues: [], uid: 'horizon' }
    });

    expect(body).toContain('aria-label="Add trusted CA certificate path"');
    expect(body).toContain('for="horizon-1"');
    expect(body).toContain('for="horizon-2"');
    expect(body).toContain('aria-label="Remove trusted CA certificate path 1"');
    expect(body).toContain('aria-describedby="horizon-1-help"');
  });

  it('disables adding at the nine-path limit', () => {
    const values = { ...defaultConfig().values };
    for (let index = 1; index <= 9; index++) values[`trustedCert${index}`] = `/certs/${index}.pem`;
    const { body } = render(TrustedCertEditor, {
      props: { fields, values, issues: [], uid: 'horizon' }
    });

    expect(body).toContain('disabled');
    expect(body).toContain('9 of 9 configured');
    expect(body.match(/Certificate path \d/g)).toHaveLength(9);
  });
});
