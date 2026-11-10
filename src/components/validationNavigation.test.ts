import { afterEach, describe, expect, it, vi } from 'vitest';
import { revealValidation } from './validationNavigation';

afterEach(() => vi.unstubAllGlobals());

describe('validation summary navigation', () => {
  it.each([false, true])('opens before focusing and scrolls only the containing pane with reduced motion=%s', (reduced) => {
    const order: string[] = [];
    const root = { scrollTo: vi.fn() };
    const scroller = { parentElement: root, scrollTop: 100, clientTop: 1, clientHeight: 500, scrollHeight: 2000, overflowY: 'auto', getBoundingClientRect: () => ({ top: 64 }), scrollTo: vi.fn(() => order.push('scroll')) };
    const panel = { open: false, parentElement: scroller, scrollMarginTop: '16px', getBoundingClientRect: () => ({ top: 1300 }) };
    const heading = { focus: vi.fn(() => { expect(panel.open).toBe(true); order.push('focus'); }) };
    const matchMedia = vi.fn(() => ({ matches: reduced }));
    vi.stubGlobal('window', { matchMedia });
    vi.stubGlobal('document', { scrollingElement: root });
    vi.stubGlobal('getComputedStyle', (element: unknown) => element);
    revealValidation(panel as unknown as HTMLDetailsElement, heading as unknown as HTMLElement);
    expect(heading.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 1319, behavior: reduced ? 'instant' : 'smooth' });
    expect(root.scrollTo).not.toHaveBeenCalled();
    expect(order).toEqual(['focus', 'scroll']);
  });
  it.each([-100, 5000])('clamps document scrolling to its bounds for target top %s', (targetTop) => {
    const root = { scrollTop: 0, clientHeight: 800, scrollHeight: 2000, scrollTo: vi.fn() };
    const parent = { parentElement: root, overflowY: 'visible', clientHeight: 3000, scrollHeight: 3000 };
    const panel = { open: false, parentElement: parent, scrollMarginTop: '16px', getBoundingClientRect: () => ({ top: targetTop }) };
    const pinnedHeader = { position: 'sticky', getBoundingClientRect: () => ({ height: 100 }) };
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    vi.stubGlobal('document', { scrollingElement: root, querySelectorAll: () => [pinnedHeader] });
    vi.stubGlobal('getComputedStyle', (element: unknown) => element);
    revealValidation(panel as unknown as HTMLDetailsElement, { focus: vi.fn() } as unknown as HTMLElement);
    expect(root.scrollTo).toHaveBeenCalledWith({ top: targetTop < 0 ? 0 : 1200, left: 0, behavior: 'instant' });
  });
  it('keeps the mobile destination below sticky navigation', () => {
    const root = { scrollTop: 400, clientHeight: 800, scrollHeight: 4000, scrollTo: vi.fn() };
    const panel = { open: false, parentElement: root, scrollMarginTop: '16px', getBoundingClientRect: () => ({ top: 1000 }) };
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    vi.stubGlobal('document', { scrollingElement: root, querySelectorAll: () => [{ position: 'sticky', getBoundingClientRect: () => ({ height: 100 }) }, { position: 'sticky', getBoundingClientRect: () => ({ height: 40 }) }] });
    vi.stubGlobal('getComputedStyle', (element: unknown) => element);
    revealValidation(panel as unknown as HTMLDetailsElement, { focus: vi.fn() } as unknown as HTMLElement);
    expect(root.scrollTo).toHaveBeenCalledWith({ top: 1244, left: 0, behavior: 'instant' });
  });
});
