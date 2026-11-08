import { render } from 'svelte/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('OutputPanel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('warns about console and Admin UI/API access when deployment passwords are omitted', async () => {
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined
    });
    const { app } = await import('../lib/store.svelte');
    app.tab = 'ps';
    const { default: OutputPanel } = await import('./OutputPanel.svelte');
    const { body } = render(OutputPanel);

    expect(body).toContain('If root and Admin UI password parameters are not provided during deployment, the UAG is not accessible through the console or Admin UI/API.');
  });
});
