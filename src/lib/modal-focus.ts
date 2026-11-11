export function modalFocus(node: HTMLElement, dismiss: () => void) {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const controls = () => [...node.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(el => el.getClientRects().length);
  queueMicrotask(() => (controls()[0] || node).focus());
  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    if (event.key !== 'Tab') return;
    const items = controls(), first = items[0] || node, last = items.at(-1) || node;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === node)) { event.preventDefault(); first.focus(); }
  };
  node.addEventListener('keydown', keydown);
  return { update(next: () => void) { dismiss = next; }, destroy() { node.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus(); } };
}
