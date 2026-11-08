import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import NoticeStack from './NoticeStack.svelte';

describe('NoticeStack', () => {
  const renderStack = (platform: 'vsphere' | 'nutanix' | 'openshift', version = '2609') =>
    render(NoticeStack, {
      props: {
        platform,
        version,
        latestVersionId: '2609',
        onUseLatest: vi.fn()
      }
    }).body;

  it('keeps the release advisory visible without platform-specific notices on vSphere', () => {
    const body = renderStack('vsphere');

    expect(body).toContain('aria-label="Release and platform advisories"');
    expect(body).toContain('recommended security baseline');
    expect(body).not.toContain('Limited Availability');
    expect(body).not.toContain('Nutanix QCOW2 and VM replacement');
  });

  it('renders the Nutanix advisory as a sibling of the release advisory', () => {
    const body = renderStack('nutanix');

    expect(body).toContain('Nutanix QCOW2 and VM replacement');
    expect(body).toContain('deletes and recreates an existing VM');
    expect(body.indexOf('recommended security baseline')).toBeLessThan(
      body.indexOf('Nutanix QCOW2 and VM replacement')
    );
  });

  it('renders the OpenShift advisory with accessible labeling', () => {
    const body = renderStack('openshift');

    expect(body).toContain('aria-labelledby="openshift-advisory-title"');
    expect(body).toContain('requires Omnissa-granted access');
    expect(body).not.toContain('Nutanix QCOW2 and VM replacement');
  });

  it('offers the recommended release for an older supported version', () => {
    const body = renderStack('vsphere', '2606');

    expect(body).toContain('older than the recommended release');
    expect(body).toContain('Use UAG 2609');
  });
});
