import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import VCenterTargetEditor from './VCenterTargetEditor.svelte';
import { parseVCenterTarget, buildVCenterTarget, vCenterTargetFeedback } from '../lib/vcenterTarget';
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

  it('links advanced target input to credential persistence guidance without changing the stored value', () => {
    const target = 'vi://' + 'uagdeploy@vsphere.local' + ':SYNTHETIC@vc.example.com/DC1/host/Cluster1';
    const values = { target };
    const { body } = render(VCenterTargetEditor, { props: { field, values, error: 'Check target' } });
    expect(body).toContain('aria-describedby="f-target-credentials-help f-target-error"');
    expect(body).toContain('id="f-target-credentials-help"');
    expect(body).toContain('vi://uagdeploy@vsphere.local:PASSWORD@vcenter.example.com/DC1/host/Cluster1');
    expect(body).toContain('saved in the browser draft');
    expect(body).toContain('without password redaction, regardless of secret mode');
    expect(body).toContain('outside Gateway Forge');
    expect(body).not.toContain('type="password"');
    expect(body).not.toContain('Assembled target');
    expect(values.target).toBe(target);
    expect(importIni(generateIni(applyPatch(defaultConfig(), { values }))).config.values.target).toBe(target);
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

  it('groups all three guided fields compactly without changing imported values or help associations', () => {
    const target = 'vi://user@corp.local@vc.corp.local/DC%20One/host/Compute%20Folder/Cluster';
    const values = { target };
    const { body } = render(VCenterTargetEditor, { props: { field, values } });
    expect(body).toContain('target-fields wide');
    expect(body).toContain('inventory-field');
    expect(body).toContain('aria-describedby="f-target-username-help f-target-username-feedback"');
    expect(body).toContain('aria-describedby="f-target-inventory-help f-target-inventory-feedback"');
    expect(body).toContain('id="f-target-username-help"');
    expect(body).toContain('id="f-target-inventory-help"');
    expect(values.target).toBe(target);
  });

  it('flags missing parts and incomplete UPNs without rejecting other supported account formats', () => {
    expect(Object.keys(vCenterTargetFeedback({ username: '', server: '', inventoryPath: '' }))).toEqual(['username', 'server', 'inventoryPath']);
    const valid = { username: 'user@corp.local', server: 'vc.corp.local', inventoryPath: 'DC/host/Cluster' };
    expect(vCenterTargetFeedback(valid)).toEqual({});
    expect(vCenterTargetFeedback({ ...valid, username: 'user@' }).username?.warning).toBe(true);
    expect(vCenterTargetFeedback({ ...valid, username: '@corp.local' }).username?.warning).toBe(true);
    expect(vCenterTargetFeedback({ ...valid, username: 'CORP\\user' }).username?.warning).toBe(false);
    expect(vCenterTargetFeedback({ ...valid, username: 'user' }).username?.warning).toBe(false);
    expect(vCenterTargetFeedback({ ...valid, inventoryPath: '///' }).inventoryPath?.warning).toBe(true);
  });

  it.each(['vi://vc.corp.local', 'https://vc.corp.local', 'HTTP://vc.corp.local', 'vc.corp.local/DC/host/Cluster'])('explains pasted server protocols or paths without rewriting %s', (server) => {
    const parts = { username: 'user@corp.local', server, inventoryPath: 'DC/host/Cluster' };
    expect(vCenterTargetFeedback(parts).server?.warning).toBe(true);
    expect(parts.server).toBe(server);
  });

  it('connects feedback to fields and previews the exact stored locator', () => {
    const target = 'vi://user@@vc.corp.local/';
    const { body } = render(VCenterTargetEditor, { props: { field, values: { target } } });
    expect(body).toContain('aria-describedby="f-target-username-help f-target-username-feedback"');
    expect(body).toContain('aria-invalid="true"');
    expect(body).toContain('This UPN looks incomplete');
    expect(body).toContain('Enter the compute inventory path');
    expect(body).toContain('Assembled target (current value)');
    expect(body).toContain(`${target}</code>`);
  });

  it('does not duplicate a password-bearing advanced locator in a target preview', () => {
    const { body } = render(VCenterTargetEditor, { props: { field, values: { target: 'vi://user:password@vc/DC/host/Cluster' } } });
    expect(body).toContain('Full OVF Tool locator');
    expect(body).not.toContain('Assembled target');
    expect(body).toContain('disabled');
  });

  it.each(['vi://user@vc/DC%20One/host/Compute%20Folder/Cluster', 'vi://user:password@vc/DC/host/Cluster', 'legacy-target'])('preserves advanced and imported spelling through INI: %s', (target) => {
    const config = applyPatch(defaultConfig(), { values: { target } });
    expect(importIni(generateIni(config)).config.values.target).toBe(target);
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
