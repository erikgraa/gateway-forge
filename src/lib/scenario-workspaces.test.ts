import { describe, expect, it, vi } from 'vitest';
import { createWorkspace, emptyRegistry, removeDrafts, savedRegistry, workspaceDisplayName, REGISTRY_KEY, type Registry } from './scenario-workspaces';

function fixtures(): Registry {
  return { ...emptyRegistry(), drafts: [createWorkspace('single', 'one'), createWorkspace('horizon', 'two'), createWorkspace('web', 'three')] };
}

describe('Display-only saved-draft hostnames', () => {
  it.each(['single', 'web'] as const)('suffixes %s names with the configured appliance hostname, not VM or vCenter names', scenario => {
    const workspace = createWorkspace(scenario, scenario); workspace.name = 'Office gateway';
    Object.assign(workspace.config.values, { uagName: 'uag01.example.com', name: 'Different-VM-name', target: 'vi://user@vc.example.com/DC/host/Compute' });
    const before = JSON.stringify(workspace);
    expect(workspaceDisplayName(workspace)).toBe('Office gateway · uag01.example.com');
    expect(JSON.stringify(workspace)).toBe(before);
    const saved = savedRegistry({ ...emptyRegistry(), drafts: [workspace] });
    expect(saved.drafts[0].name).toBe('Office gateway');
    expect(workspaceDisplayName(JSON.parse(JSON.stringify(saved)).drafts[0])).toBe('Office gateway · uag01.example.com');
    workspace.config.values.uagName = 'uag02.example.com';
    expect(workspaceDisplayName(workspace)).toBe('Office gateway · uag02.example.com');
  });
  it.each(['', ' \t ', undefined])('omits absent/blank hostname %s without supplying a default', uagName => {
    const workspace = createWorkspace('single', 'blank'); workspace.config.values.uagName = uagName;
    expect(workspaceDisplayName(workspace)).toBe(workspace.name);
    expect(workspace.config.values.uagName).toBe(uagName);
  });
  it('leaves Horizon titles unchanged even when the snapshot contains a hostname', () => {
    const workspace = createWorkspace('horizon', 'horizon'); workspace.config.values.uagName = 'uag01.example.com';
    expect(workspaceDisplayName(workspace)).toBe(workspace.name);
  });
});

describe('Removing saved drafts', () => {
  it('clears all scenario types with a single registry write and no mutation of the original', () => {
    const registry = fixtures();
    registry.drafts[1].retainedImports.push({ filename: 'unknown.json', raw: 'private import' });
    const before = structuredClone(registry);
    const storage = { setItem: vi.fn() };
    const next = removeDrafts(registry, registry.drafts.map(d => d.id), storage);
    expect(next).toEqual(emptyRegistry());
    expect(registry).toEqual(before);
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(REGISTRY_KEY, JSON.stringify(emptyRegistry()));
  });

  it('preserves survivors when removing a single draft and saves a secret-safe snapshot', () => {
    const registry = fixtures();
    const storage = { setItem: vi.fn() };
    const next = removeDrafts(registry, ['two'], storage);
    expect(next.drafts.map(d => d.id)).toEqual(['one', 'three']);
    expect(registry.drafts).toHaveLength(3);
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(REGISTRY_KEY, JSON.stringify(savedRegistry(next)));
  });

  it('propagates failed writes without deleting any in-memory drafts', () => {
    const registry = fixtures();
    const before = structuredClone(registry);
    const storage = { setItem: vi.fn(() => { throw Error('Storage blocked'); }) };
    expect(() => removeDrafts(registry, registry.drafts.map(d => d.id), storage)).toThrow('Storage blocked');
    expect(registry).toEqual(before);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('can clear session-only drafts without touching unsupported browser storage', () => {
    const registry = fixtures();
    const next = removeDrafts(registry, registry.drafts.map(d => d.id));
    expect(next).toEqual(emptyRegistry());
    expect(registry.drafts).toHaveLength(3);
  });

  it('refuses deletion while an editor has an active draft', () => {
    const registry = fixtures();
    registry.current = 'one';
    const storage = { setItem: vi.fn() };
    expect(() => removeDrafts(registry, ['one', 'two', 'three'], storage)).toThrow('scenario chooser');
    expect(registry.drafts).toHaveLength(3);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
