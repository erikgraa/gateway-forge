import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import NoticeStack from './NoticeStack.svelte';
import { PLATFORMS, type Platform } from '../lib/versions';

describe('NoticeStack', () => {
  const renderStack = (platform: Platform, version = '2609') =>
    render(NoticeStack, {
      props: {
        platform,
        version,
        latestVersionId: '2609',
        onUseLatest: vi.fn()
      }
    }).body;

  it('keeps release advice separate from output deployment warnings', () => {
    const body = renderStack('vsphere');

    expect(body).toContain('aria-label="Release and platform advisories"');
    expect(body).toContain('recommended security baseline');
    expect(body).not.toContain('Newer uagdeploy.ps1 packages');
    expect(body).not.toContain('Limited Availability');
    expect(body).not.toContain('Nutanix QCOW2 and VM replacement');
  });

  it.each(PLATFORMS.map((platform) => platform.id))('does not duplicate the output replacement disclosure for %s', (platform) => {
    for (const version of ['2609', '2212']) {
      const body = renderStack(platform, version);
      expect(body).not.toContain('vm-replacement-advisory-title');
      expect(body).toContain('release-advisory-title');
    }
  });

  it('renders the Nutanix advisory as a sibling of the release advisory', () => {
    const body = renderStack('nutanix');

    expect(body).toContain('Nutanix QCOW2 preparation');
        expect(body).toContain('Upload the UAG QCOW2 image to Prism Central first');
        expect(body).not.toContain('deletes and recreates an existing VM');
        expect(body.indexOf('recommended security baseline')).toBeLessThan(
          body.indexOf('Nutanix QCOW2 preparation')
        );
  });

  it('renders the OpenShift advisory with accessible labeling', () => {
    const body = renderStack('openshift');

    expect(body).toContain('aria-labelledby="openshift-advisory-title"');
    expect(body).toContain('Limited Availability');
    expect(body).toContain('requires Omnissa-granted access');
    expect(body).not.toContain('Nutanix QCOW2 and VM replacement');
  });

  it('offers the recommended release for an older supported version', () => {
    const body = renderStack('vsphere', '2606');

    expect(body).toContain('older than the recommended release');
    expect(body).toContain('Use UAG 2609');
    expect(body).toContain('Newer uagdeploy.ps1 packages and platform variants may not be compatible');
    expect(body).toContain('INI/settings JSON schemas can differ between releases');
    expect(body).toContain('documentation for UAG 2606');
  });
});
