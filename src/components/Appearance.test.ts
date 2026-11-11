import { describe, expect, it, vi } from 'vitest';
vi.mock('../lib/store.svelte', () => ({ app: { setTheme: vi.fn(), say: vi.fn() } }));
import { render } from 'svelte/server';
import Appearance from './Appearance.svelte';

const output = () => render(Appearance).body;
describe('Appearance choices', () => {
  it('uses labelled native radio groups for palette and theme', () => {
    const body = output();
    expect(body.match(/type="radio"/g)).toHaveLength(6);
    expect(body.match(/name="appearance-palette"/g)).toHaveLength(3);
    expect(body.match(/name="appearance-theme"/g)).toHaveLength(3);
    expect(body).toMatch(/<legend[^>]*>Palette<\/legend>/);
    expect(body).toMatch(/<legend[^>]*>Theme<\/legend>/);
    for (const label of ['Original purple', 'Harbor', 'Warm slate', 'System', 'Light', 'Dark']) expect(body).toContain(label);
    expect(body).not.toContain('<select');
  });
  it('keeps Original and System selected by default', () => {
    const body = output();
    expect(body).toMatch(/<input[^>]*value="original"[^>]*checked/);
    expect(body).toMatch(/<input[^>]*value="system"[^>]*checked/);
    expect(body.match(/\bchecked/g)).toHaveLength(2);
  });
  it('starts collapsed and connects the toggle and theme explanation', () => {
    const body = output();
    expect(body).toContain('aria-expanded="false"');
    expect(body).toContain('aria-controls="appearance-options"');
    expect(body).toMatch(/id="appearance-options"[^>]*hidden/);
    expect(body).toContain('aria-describedby="appearance-theme-help"');
    expect(body).toContain('aria-label="Close appearance settings"');
  });
  it('has no duplicate IDs or nested buttons', () => {
    const body = output(), ids = [...body.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(body).not.toMatch(/<button\b[^>]*>(?:(?!<\/button>).)*<button\b/s);
  });
});
