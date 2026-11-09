<script lang="ts">
  import type { Config } from '../lib/model';
  import { buildTopology, type TopologyNode } from '../lib/topology';

  let { config, title }: { config: Config; title: string } = $props();
  const topology = $derived(buildTopology(config));
  const left = $derived(topology.nodes.filter((node) => node.kind === 'client' || node.id === 'outer'));
  const right = $derived(topology.nodes.filter((node) => node.id !== 'uag' && !left.includes(node)));
  const height = $derived(Math.max(190, Math.max(left.length, right.length) * 44 + 48));

  function position(id: string) {
    if (id === 'uag') return { x: 134, y: height / 2 - 25, w: 92, h: 50 };
    const leftIndex = left.findIndex((node) => node.id === id);
    const list = leftIndex >= 0 ? left : right;
    const index = leftIndex >= 0 ? leftIndex : right.findIndex((node) => node.id === id);
    return { x: leftIndex >= 0 ? 10 : 258, y: height / 2 - list.length * 22 + index * 44 + 4, w: 92, h: 36 };
  }

  function connection(from: string, to: string) {
    const a = position(from);
    const b = position(to);
    const forward = a.x < b.x;
    const x1 = forward ? a.x + a.w : a.x;
    const x2 = forward ? b.x : b.x + b.w;
    return `M${x1},${a.y + a.h / 2} C${(x1 + x2) / 2},${a.y + a.h / 2} ${(x1 + x2) / 2},${b.y + b.h / 2} ${x2},${b.y + b.h / 2}`;
  }

  function label(node: TopologyNode) {
    if (node.id === 'uag') return 'UAG';
    if (node.id === 'cs') return 'Horizon';
    if (node.kind === 'client') return node.id === 'tunnel-client' ? 'Tunnel clients' : node.id === 'content-gateway-client' ? 'Content clients' : 'Clients';
    if (node.id === 'idp') return 'SAML IdP';
    if (node.id === 'uem' || node.id === 'content-uem') return 'UEM';
    if (node.kind === 'monitoring') return node.id === 'snmp' ? 'SNMPv3' : 'TLS syslog';
    return node.label.length > 14 ? `${node.label.slice(0, 13)}…` : node.label;
  }

  const icons: Record<TopologyNode['kind'], string> = {
    client: 'M2 2h16v10H2z M7 16h6 M10 12v4',
    uag: 'M10 1l8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V4z M6 10l3 3 5-6',
    backend: 'M2 2h16v6H2z M2 12h16v6H2z M5 5h1 M5 15h1',
    identity: 'M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M3 18v-2a7 5 0 0 1 14 0v2',
    monitoring: 'M2 2h16v16H2z M4 11h3l2-5 3 9 2-4h2'
  };
</script>

<div class="template-visual">
  <svg viewBox={`0 0 360 ${height}`} role="img" aria-label={`Architecture preview: ${title}`}>
    <title>{title}</title>
    <desc>{topology.description.replace('Live UAG topology', 'Example UAG topology')}</desc>
    <rect class="gateway-zone" x="122" y="10" width="116" height={height - 20} rx="12" />
    <text class="zone-label" x="180" y="27" text-anchor="middle">ACCESS GATEWAY</text>
    {#each topology.edges as edge, index (`${edge.from}-${edge.to}-${index}`)}
      <path class={`connection ${edge.kind}`} d={connection(edge.from, edge.to)}>
        <title>{edge.label}</title>
      </path>
    {/each}
    {#each topology.nodes as node (node.id)}
      {@const p = position(node.id)}
      <g class={`node ${node.kind}`} transform={`translate(${p.x} ${p.y})`}>
        <title>{`${node.label}. ${node.sub || ''}. ${node.detail || ''}`}</title>
        <rect width={p.w} height={p.h} rx="7" />
        <path class="node-icon" d={icons[node.kind]} transform={`translate(8 ${p.h / 2 - 10}) scale(.8)`} />
        <text x="28" y={p.h / 2 + 3}>{label(node)}</text>
      </g>
    {/each}
  </svg>
  <div class="visual-caption"><span>Example architecture</span><span>{topology.facts[0]} · {String(config.values.deploymentOption).startsWith('two') ? '2 NICs' : '1 NIC'}</span></div>
</div>

<style>
  .template-visual { border-bottom: 1px solid var(--line); background: radial-gradient(ellipse at 50% 45%, var(--tpl-soft, var(--acc-soft)), transparent 75%), var(--canvas); }
  svg { display: block; width: 100%; height: 200px; }
  .gateway-zone { fill: var(--tpl-soft, var(--acc-soft)); stroke: var(--line); stroke-dasharray: 3 4; }
  .zone-label { fill: var(--mut); font: 8px var(--font-sans, sans-serif); letter-spacing: .8px; }
  .connection { fill: none; stroke: var(--tpl-accent, var(--acc)); stroke-width: 1.5; }
  .connection.identity { stroke: var(--teal); stroke-dasharray: 4 3; }
  .connection.monitoring { stroke: var(--mut); stroke-dasharray: 2 3; }
  .connection.cascade { stroke: var(--teal); stroke-width: 2; }
  .node rect { fill: var(--panel); stroke: var(--line-strong); }
  .node.uag rect { fill: var(--tpl-soft, var(--acc-soft)); stroke: var(--tpl-accent, var(--acc)); }
  .node text { fill: var(--tx); font: 8px var(--font-sans, sans-serif); font-weight: 600; }
  .node-icon { fill: none; stroke: var(--tpl-accent, var(--acc)); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
  .identity .node-icon { stroke: var(--teal); }
  .monitoring .node-icon { stroke: var(--mut); }
  .visual-caption { display: flex; flex-direction: column; gap: 4px; padding: 0 14px 12px; color: var(--mut); font-size: 10px; }
  .visual-caption span:first-child { color: var(--tx); font-weight: 600; }
</style>
