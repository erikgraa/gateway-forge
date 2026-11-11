export interface TopologyLink { from: string; to: string; route: 'fan-out' | 'fan-in' | 'direct' }
interface Point { x: number; y: number }

export function topologyLinkPath(from: Point, to: Point, width: number, route: TopologyLink['route'], horizontal = false): string {
  if (horizontal) return `M${from.x} ${from.y} H${(from.x + to.x) / 2} V${to.y} H${to.x}`;
  if (route === 'direct') return `M${from.x} ${from.y} L${to.x} ${to.y}`;
  const bus = route === 'fan-out' ? 8 : width - 8;
  return `M${from.x} ${from.y} V${from.y + 12} H${bus} V${to.y - 12} H${to.x} V${to.y}`;
}

export function topologyLinks(node: HTMLElement, initial: TopologyLink[]) {
  let links = initial, frame = 0, destroyed = false;
  const svg = node.querySelector<SVGSVGElement>('svg[data-topology-connections], .group-connections')!;
  const endpoints = () => new Map([...node.querySelectorAll<HTMLElement>('[data-topology-key]')].map(el => [el.dataset.topologyKey!, el]));
  function draw() {
    frame = 0;
    if (destroyed) return;
    const bounds = node.getBoundingClientRect(), elements = endpoints();
    svg.replaceChildren();
    if (!bounds.width || !bounds.height) return;
    svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    for (const link of links) {
      const source = elements.get(link.from)?.getBoundingClientRect(), target = elements.get(link.to)?.getBoundingClientRect();
      if (!source || !target) continue;
      const horizontal = source.right < target.left;
      const from = horizontal ? { x: source.right - bounds.left, y: source.top + source.height / 2 - bounds.top } : { x: source.left + source.width / 2 - bounds.left, y: source.bottom - bounds.top };
      const to = horizontal ? { x: target.left - bounds.left, y: target.top + target.height / 2 - bounds.top } : { x: target.left + target.width / 2 - bounds.left, y: target.top - bounds.top };
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('data-from', link.from); path.setAttribute('data-to', link.to);
      path.setAttribute('d', topologyLinkPath(from, to, bounds.width, link.route, horizontal));
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arrow.setAttribute('d', horizontal ? `M${to.x - 6} ${to.y - 4} L${to.x} ${to.y} L${to.x - 6} ${to.y + 4}` : `M${to.x - 4} ${to.y - 6} L${to.x} ${to.y} L${to.x + 4} ${to.y - 6}`);
      svg.append(path, arrow);
    }
  }
  function schedule() { if (!frame && !destroyed) frame = requestAnimationFrame(draw); }
  const observer = new ResizeObserver(schedule);
  function observe() {
    if (destroyed) return;
    observer.disconnect(); observer.observe(node);
    for (const element of endpoints().values()) observer.observe(element);
    schedule();
  }
  queueMicrotask(observe);
  return {
    update(next: TopologyLink[]) { links = next; queueMicrotask(observe); },
    destroy() { destroyed = true; observer.disconnect(); if (frame) cancelAnimationFrame(frame); }
  };
}
