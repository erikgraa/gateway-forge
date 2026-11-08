import { describe, expect, it, vi } from 'vitest';
import { ProviderRegistry, type ExternalProvider } from './provider';

function provider(id: string, dispose = vi.fn()): ExternalProvider {
  return {
    descriptor: { id, label: id, capabilities: ['secret'] },
    resolve: vi.fn(),
    dispose
  };
}

describe('ProviderRegistry', () => {
  it('registers providers without activating or resolving them', () => {
    const registry = new ProviderRegistry();
    const adapter = provider('example');

    registry.register(adapter);

    expect(registry.get('example')).toBe(adapter);
    expect(registry.list()).toEqual([adapter.descriptor]);
    expect(adapter.resolve).not.toHaveBeenCalled();
  });

  it('rejects duplicate ids and empty ids', () => {
    const registry = new ProviderRegistry();
    registry.register(provider('example'));

    expect(() => registry.register(provider('example'))).toThrow('already registered');
    expect(() => registry.register(provider(' '))).toThrow('id is required');
    expect(() => registry.register(provider(' padded '))).toThrow('surrounding whitespace');
  });

  it('disposes registered providers when cleared', async () => {
    const registry = new ProviderRegistry();
    const dispose = vi.fn();
    registry.register(provider('example', dispose));

    await registry.clear();

    expect(dispose).toHaveBeenCalledOnce();
    expect(registry.list()).toEqual([]);
  });
});
