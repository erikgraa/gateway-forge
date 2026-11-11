export function revealValidation(panel: HTMLDetailsElement, heading: HTMLElement): void {
  panel.open = true;
  heading.focus({ preventScroll: true });
  const root = document.scrollingElement as HTMLElement;
  let scroller = panel.parentElement;
  while (scroller && scroller !== root) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight) break;
    scroller = scroller.parentElement;
  }
  scroller ??= root;
  const page = scroller === root;
  const inset = page ? [...document.querySelectorAll<HTMLElement>('header.top, nav.side')].reduce((height, element) =>
    height + (/^(sticky|fixed)$/.test(getComputedStyle(element).position) ? element.getBoundingClientRect().height : 0), 0) : 0;
  const margin = parseFloat(getComputedStyle(panel).scrollMarginTop) || 0;
  const top = panel.getBoundingClientRect().top + scroller.scrollTop -
    (page ? 0 : scroller.getBoundingClientRect().top + scroller.clientTop) - margin - inset;
  scroller.scrollTo({
    top: Math.max(0, Math.min(top, scroller.scrollHeight - scroller.clientHeight)),
    ...(page ? { left: 0 } : {}),
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
  });
}
