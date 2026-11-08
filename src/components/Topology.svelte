<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { buildTopology } from '../lib/topology';

  const topo = $derived(buildTopology(app.config));
  const left = $derived(topo.nodes.filter((node) => node.zone === 'untrusted' || node.id === 'outer'));
  const right = $derived(topo.nodes.filter((node) => node.id !== 'uag' && node.zone !== 'untrusted' && node.id !== 'outer'));
  const isCascade = $derived(topo.nodes.some((node) => node.id === 'outer' || node.id === 'inner'));
  const isInner = $derived(topo.nodes.some((node) => node.id === 'outer'));
  const rowH = 94;
  const H = $derived(Math.max(280, right.length * rowH + 66, left.length * rowH + 66));

  type Position = { x: number; y: number; w: number; h: number };

  function pos(id: string): Position {
    if (id === 'uag') return { x: 337, y: H / 2 - 57, w: 226, h: 114 };
    const leftIndex = left.findIndex((node) => node.id === id);
    if (leftIndex >= 0) return { x: 24, y: 44 + leftIndex * rowH, w: 220, h: 76 };
    const rightIndex = right.findIndex((node) => node.id === id);
    return { x: 656, y: 44 + Math.max(0, rightIndex) * rowH, w: 220, h: 76 };
  }

  function path(from: string, to: string): string {
    const a = pos(from);
    const b = pos(to);
    const forward = a.x < b.x;
    const x1 = forward ? a.x + a.w : a.x;
    const x2 = forward ? b.x : b.x + b.w;
    const y1 = a.y + a.h / 2;
    const y2 = b.y + b.h / 2;
    const dx = Math.max(46, Math.abs(x2 - x1) * 0.48);
    const c1 = forward ? x1 + dx : x1 - dx;
    const c2 = forward ? x2 - dx : x2 + dx;
    return `M${x1} ${y1} C${c1} ${y1} ${c2} ${y2} ${x2} ${y2}`;
  }

  function edgeLabel(from: string, to: string) {
    const a = pos(from);
    const b = pos(to);
    return {
      x: (a.x + a.w / 2 + b.x + b.w / 2) / 2,
      y: (a.y + a.h / 2 + b.y + b.h / 2) / 2 - 7
    };
  }

  function detailLines(detail = '') {
    return detail.split('\n').flatMap((line) => {
      if (line.length <= 34) return [line];
      const words = line.split(' ');
      const lines: string[] = [];
      let current = '';
      for (const word of words) {
        if ((`${current} ${word}`).trim().length > 34) {
          lines.push(current);
          current = word;
        } else current = `${current} ${word}`.trim();
      }
      if (current) lines.push(current);
      return lines;
    }).slice(0, 3);
  }

  const trim = (value: string | undefined, length = 29) =>
    value && value.length > length ? `${value.slice(0, length - 1)}…` : value || '';
</script>

<section class="card topo" aria-labelledby="topology-title" aria-describedby="topology-description">
  <div class="card-head topo-head">
    <div>
      <p class="eyebrow">Live architecture</p>
      <h3 id="topology-title">UAG service topology</h3>
    </div>
    <span class="live-state"><i aria-hidden="true"></i> Live configuration</span>
  </div>

  <p id="topology-description" class="sr-only" aria-live="polite">{topo.description}</p>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard users need to focus the overflow region for scrolling) -->
  <div
    class="diagram-scroll"
    tabindex="0"
    role="region"
    aria-label="Scrollable live UAG topology diagram. Use the arrow keys to scroll when zoomed on a narrow screen."
  >
    <svg viewBox={`0 0 900 ${H}`} role="img" aria-labelledby="topology-svg-title topology-svg-desc">
      <title id="topology-svg-title">Live Unified Access Gateway deployment topology</title>
      <desc id="topology-svg-desc">{topo.description}</desc>
      <defs>
        <pattern id="topology-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" class="grid-line" />
        </pattern>
        <filter id="topology-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" flood-opacity=".18" />
        </filter>
        <marker id="topology-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 z" />
        </marker>
      </defs>

      <rect class="diagram-bg" x="0" y="0" width="900" height={H} />
      <rect class="grid-overlay" x="0" y="0" width="900" height={H} />
      <rect class="zone-zone untrusted" x="8" y="8" width="252" height={H - 16} rx="16" />
      <rect class="zone-zone dmz" x="321" y="8" width="258" height={H - 16} rx="16" />
      <rect class="zone-zone internal" x="640" y="8" width="252" height={H - 16} rx="16" />
      <text class="zone-label" x="24" y="29">{isInner ? 'CLIENTS / DMZ 1' : 'UNTRUSTED'}</text>
      <text class="zone-label" x="337" y="29">{isInner ? 'DMZ 2 / EDGE' : 'DMZ 1 / EDGE'}</text>
      <text class="zone-label" x="656" y="29">{isCascade && !isInner ? 'DMZ 2 / INTERNAL' : 'INTERNAL / DEPENDENCIES'}</text>

      {#each topo.edges as edge, index (`${edge.from}-${edge.to}-${index}`)}
        <path class={`edge ${edge.kind}`} d={path(edge.from, edge.to)} marker-end="url(#topology-arrow)" />
        {@const label = edgeLabel(edge.from, edge.to)}
        <g class="edge-caption">
          <rect x={label.x - 72} y={label.y - 12} width="144" height="18" rx="5" />
          <text x={label.x} y={label.y}>{trim(edge.label, 27)}</text>
          <title>{edge.label}</title>
        </g>
      {/each}

      {#each topo.nodes as node (node.id)}
        {@const p = pos(node.id)}
        <g class={`topology-node ${node.kind}`} transform={`translate(${p.x} ${p.y})`}>
          <title>{`${node.label}. ${node.sub || ''}. ${node.detail || ''}`}</title>
          <rect class="node-surface" width={p.w} height={p.h} rx={node.kind === 'uag' && node.id === 'uag' ? 16 : 12} />
          <rect class="node-accent" x="0" y="0" width="5" height={p.h} rx="3" />
          <text class="node-kicker" x="17" y="18">{node.kind === 'uag' ? 'ACCESS GATEWAY' : node.kind === 'identity' ? 'IDENTITY' : node.kind === 'monitoring' ? 'OPERATIONS' : node.kind === 'client' ? 'CLIENT EDGE' : 'DESTINATION'}</text>
          <text class="node-title" x="17" y="38">{trim(node.label, 27)}</text>
          {#if node.sub}<text class="node-subtitle" x="17" y="55">{trim(node.sub, 31)}</text>{/if}
          {#each detailLines(node.detail).slice(0, node.kind === 'uag' && node.id === 'uag' ? 3 : 1) as line, lineIndex}
            <text class="node-detail" x="17" y={node.kind === 'uag' && node.id === 'uag' ? 77 + lineIndex * 14 : 70 + lineIndex * 13}>{trim(line, 37)}</text>
          {/each}
        </g>
      {/each}
    </svg>
  </div>

  <div class="topology-summary" aria-label="Topology configuration summary">
    {#each topo.facts as fact, index (fact)}
      <div class="topology-fact">
        <span>{String(index + 1).padStart(2, '0')}</span>
        <p>{fact}</p>
      </div>
    {/each}
  </div>
</section>
