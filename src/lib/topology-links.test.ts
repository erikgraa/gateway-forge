import { describe, expect, it } from 'vitest';
import { topologyLinkPath } from './topology-links';

describe('Responsive topology routes', () => {
  it('fans a shared entry through the left corridor to each appliance', () => {
    expect(topologyLinkPath({ x: 150, y: 60 }, { x: 80, y: 100 }, 300, 'fan-out')).toBe('M150 60 V72 H8 V88 H80 V100');
    expect(topologyLinkPath({ x: 150, y: 60 }, { x: 220, y: 400 }, 300, 'fan-out')).toBe('M150 60 V72 H8 V388 H220 V400');
  });
  it.each([300, 700])('converges members on the shared server through the right corridor at width %s', width => {
    expect(topologyLinkPath({ x: 80, y: 150 }, { x: width / 2, y: 500 }, width, 'fan-in')).toBe(`M80 150 V162 H${width - 8} V488 H${width / 2} V500`);
  });
  it('routes wide-layout branches only through the gap between the columns', () => {
    expect(topologyLinkPath({ x: 100, y: 300 }, { x: 144, y: 90 }, 800, 'fan-out', true)).toBe('M100 300 H122 V90 H144');
    expect(topologyLinkPath({ x: 500, y: 600 }, { x: 544, y: 300 }, 800, 'fan-in', true)).toBe('M500 600 H522 V300 H544');
  });
  it('keeps explicit individual endpoints directly connected', () => {
    expect(topologyLinkPath({ x: 150, y: 100 }, { x: 150, y: 130 }, 300, 'direct')).toBe('M150 100 L150 130');
  });
});
