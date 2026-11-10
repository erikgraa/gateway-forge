import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import OutputSplitter from './OutputSplitter.svelte';

describe('OutputSplitter', () => {
  it('exposes a labeled, keyboard-focusable separator with width bounds', () => {
    const { body } = render(OutputSplitter);
    expect(body).toContain('role="separator" tabindex="0" aria-orientation="vertical"');
    expect(body).toContain('aria-label="Resize configuration preview"');
    expect(body).toContain('aria-controls="generated-output"');
    expect(body).toContain('aria-valuemin="280" aria-valuemax="1000" aria-valuenow="440"');
    expect(body).toContain('Double-click to restore the default width.');
  });
  it('hides and removes the separator from keyboard order while collapsed', () => {
    const { body } = render(OutputSplitter, { props: { collapsed: true } });
    expect(body).toContain('hidden');
    expect(body).toContain('tabindex="-1"');
  });
});
