import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import VCenterTargetEditor from './VCenterTargetEditor.svelte';
import { parseVCenterTarget, buildVCenterTarget } from '../lib/vcenterTarget';
import { defaultConfig, applyPatch } from '../lib/model';
import { GROUPS } from '../lib/schema';
import { generateIni } from '../lib/generate';
import { importIni } from '../lib/importer';

beforeAll(() => {
  vi.stubGlobal('document', { documentElement: { dataset: {} } });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});

const field = GROUPS.flatMap((group) => group.fields).find((candidate) => candidate.id === 'target')!;

describe('guided vCenter target', () => {
  it('separates UPN from the vCenter address using the final @', () => {
    expect(parseVCenterTarget('vi://administrator@vsphere.local@vcenter.corp.local/DC1/host/Cluster1')).toEqual({
      username: 'administrator@vsphere.local', server: 'vcenter.corp.local', inventoryPath: 'DC1/host/Cluster1'
    });
  });

  it.each([
    'vi://user@domain@vc/DC/host/Cluster/Resources/UAG/Nested',
    'vi://user@vc/DC/host/Compute Folder/Cluster',
    'vi://user@vc/DC%20One/host/Cluster%201',
    'vi://user@[2001:db8::1]/DC/host/Cluster'
  ])('preserves inventory paths and locator spelling: %s', (target) => {
    expect(buildVCenterTarget(parseVCenterTarget(target)!)).toBe(target);
  });

  it('adds vi:// automatically and avoids duplicate path slashes', () => {
    expect(buildVCenterTarget({ username: 'user@corp.local', server: 'vc.corp.local', inventoryPath: '/DC/host/Cluster' }))
      .toBe('vi://user@corp.local@vc.corp.local/DC/host/Cluster');
    expect(buildVCenterTarget(parseVCenterTarget('')!)).toBe('');
  });

  it.each(['legacy-target', 'vi://vc/DC/host/Cluster', 'vi://user:password@vc/DC/host/Cluster'])('keeps unsplittable imports in the full-locator editor: %s', (target) => {
    expect(parseVCenterTarget(target)).toBeNull();
    const { body } = render(VCenterTargetEditor, { props: { field, values: { target } } });
    expect(body).toContain('Full OVF Tool locator');
    expect(body).toContain(`value="${target}"`);
    expect(body).not.toContain('id="f-target-username"');
  });

  it('renders accessible guided inputs and distinguishes compute destination from VM folder', () => {
    const { body } = render(VCenterTargetEditor, { props: { field, values: defaultConfig().values } });
    expect(body).toContain('for="f-target-username"');
    expect(body).toContain('for="f-target-server"');
    expect(body).toContain('for="f-target-inventory"');
    expect(body).toContain('vi:// is added automatically');
    expect(body).toContain('separate VM folder setting');
    expect(body).toContain('Edit full locator');
  });

  it('round-trips the assembled locator and separate VM folder without adding configuration keys', () => {
    const target = buildVCenterTarget({ username: 'user@corp.local', server: 'vc.corp.local', inventoryPath: 'DC/host/Cluster/Resources/UAG' });
    const config = applyPatch(defaultConfig(), { values: { target, folder: 'DMZ/UAG' } });
    const ini = generateIni(config);
    expect(ini).toContain(`target=${target}`);
    expect(ini).toContain('folder=DMZ/UAG');
    expect(importIni(ini).config.values.target).toBe(target);
    expect(importIni(ini).config.values.folder).toBe('DMZ/UAG');
    expect(ini).not.toContain('inventoryPath=');
  });
});
