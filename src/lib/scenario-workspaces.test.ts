import { describe, expect, it, vi } from 'vitest';
import { createWorkspace, emptyRegistry, removeDrafts, savedRegistry, REGISTRY_KEY, type Registry } from './scenario-workspaces';

function fixtures(): Registry {
  return { ...emptyRegistry(), drafts: [createWorkspace('single', 'one'), createWorkspace('horizon', 'two'), createWorkspace('web', 'three')] };
}

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
