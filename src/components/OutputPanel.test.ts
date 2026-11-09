import { render } from 'svelte/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('OutputPanel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('explains native deployment password prompts when parameters are omitted', async () => {
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

    expect(body).toContain('When root and Admin UI password parameters are omitted, uagdeploy and its platform variants prompt for them interactively.');
    expect(body).not.toContain('not accessible through the console');
  });
});
