import { render } from 'svelte/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyPatch, defaultConfig } from '../lib/model';

async function topologyState() {
  vi.stubGlobal('document', { documentElement: { dataset: {} } });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  const { app } = await import('../lib/store.svelte');
  const { default: Topology } = await import('./Topology.svelte');
  return { app, Topology };
}

function clientCard(body: string) {
  return body.match(/<g class="topology-node client"[^>]*>([\s\S]*?)<\/g>/)?.[1] ?? '';
}

function visibleText(card: string) {
  return card.replace(/<title>[\s\S]*?<\/title>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

describe('Service topology external-client labels', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['horizon', 'web'] as const)('shows the complete external-client subtitle for %s', async (scenario) => {
    const { app, Topology } = await topologyState();
    const before = app.config;
    try {
      app.config = applyPatch(defaultConfig(), { values: { horizon_enabled: scenario === 'horizon' } });
      if (scenario === 'web') app.config.wrp.push({ instanceId: 'browser-app', proxyDestinationUrl: 'https://app.example.com' });
      const card = clientCard(render(Topology).body);
      expect(card).toContain('Horizon · browser · applications');
      expect(visibleText(card)).toContain('External clients');
      expect(visibleText(card)).toContain('HTTPS 443');
      expect(visibleText(card)).not.toContain('…');
    } finally { app.config = before; }
  });

  it('shows every enabled Horizon protocol and adds room for the extra lines', async () => {
    const { app, Topology } = await topologyState();
    const before = app.config;
    try {
      app.config = applyPatch(defaultConfig(), { values: { horizon_enabled: true, tunnelEnabled: true, blastEnabled: true, pcoipEnabled: true, seg_enabled: true } });
      const { body } = render(Topology), card = clientCard(body), text = visibleText(card);
      for (const label of ['HTTPS 443', 'Tunnel 443', 'Blast TCP+UDP 8443', 'PCoIP TCP+UDP 4172']) expect(text).toContain(label);
      const lines = [...card.matchAll(/class="node-detail"/g)].length;
      expect(lines).toBeGreaterThan(1);
      expect(card).toContain(`height="${76 + (lines - 1) * 13}"`);
      expect(body).toContain(`translate(24 ${138 + (lines - 1) * 13})`);
    } finally { app.config = before; }
  });
});
