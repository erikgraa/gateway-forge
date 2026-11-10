import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig } from './model';
import { copy, download, render } from './render';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('raw artifact actions', () => {
  it.each(['ini', 'json', 'ps'] as const)('copies %s without preview decorations', async (tab) => {
    const artifact = render(defaultConfig(), tab, 'placeholder');
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copy(artifact.text)).toBe(true);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(artifact.text);
  });

  it.each(['ini', 'json', 'ps'] as const)('downloads unchanged %s content, filename and MIME type', async (tab) => {
    vi.useFakeTimers();
    const artifact = render(defaultConfig(), tab, 'placeholder');
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('document', { createElement: () => anchor, body: { appendChild: vi.fn() } });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    download(artifact);
    const blob = create.mock.calls[0][0] as Blob;
    expect(await blob.text()).toBe(artifact.text);
    expect(blob.type).toBe(`${artifact.mime};charset=utf-8`);
    expect(anchor.download).toBe(artifact.filename);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:test');
  });
});
