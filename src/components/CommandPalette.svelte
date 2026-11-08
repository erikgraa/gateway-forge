<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { GROUPS, LISTS, RUNTIME_FIELDS, SECTIONS, type SectionId } from '../lib/schema';
  import { VERSIONS, PLATFORMS, platformAvailable } from '../lib/versions';
  import { render, download, copy } from '../lib/render';
  import { fieldAvailable } from '../lib/model';

  interface Item {
    kind: string;
    label: string;
    detail?: string;
    run: () => void;
  }

  let q = $state('');
  let sel = $state(0);
  let input: HTMLInputElement | undefined = $state();

  const items = $derived.by<Item[]>(() => {
    const out: Item[] = [];
    for (const s of SECTIONS) out.push({ kind: 'Go to', label: s.title, run: () => app.goTo(s.id) });
    out.push(
      { kind: 'Action', label: 'Toggle light/dark theme', run: () => app.toggleTheme() },
      { kind: 'Action', label: 'Import INI / JSON…', run: () => (app.showImport = true) },
      { kind: 'Action', label: 'Download INI', run: () => download(render(app.config, 'ini', app.secretMode, app.deploymentMode)) },
      { kind: 'Action', label: 'Download settings JSON', run: () => download(render(app.config, 'json', app.secretMode, app.deploymentMode)) },
      { kind: 'Action', label: 'Download PowerShell', run: () => download(render(app.config, 'ps', app.secretMode, app.deploymentMode)) },
      {
        kind: 'Action',
        label: 'Copy current output',
        run: async () => app.say((await copy(render(app.config, app.tab, app.secretMode, app.deploymentMode).text)) ? 'Copied' : 'Copy failed')
      },
      { kind: 'Action', label: 'Reset to blank configuration', run: () => app.clearDraft() }
    );
    const outputTabs = app.config.platform === 'openshift'
      ? (['ini', 'json', 'ps', 'manifest', 'docs'] as const)
      : (['ini', 'json', 'ps', 'docs'] as const);
    for (const t of outputTabs) out.push({ kind: 'Output', label: `Show ${t.toUpperCase()} tab`, run: () => (app.tab = t) });
    for (const v of VERSIONS) out.push({ kind: 'Version', label: `Target UAG ${v.id}`, run: () => (app.config.version = v.id) });
    for (const p of PLATFORMS.filter((p) => platformAvailable(p.id, app.config.version))) out.push({ kind: 'Platform', label: `Platform: ${p.label}`, run: () => (app.config.platform = p.id) });
    for (const g of GROUPS)
      for (const f of g.fields)
        if (fieldAvailable({ ...f, showIf: undefined }, app.config.version, app.config.platform, app.config.values) && (!g.platforms || g.platforms.includes(app.config.platform)))
          out.push({ kind: 'Setting', label: f.label, detail: `${g.title} · ${f.key}`, run: () => app.goTo(g.section as SectionId, f.id) });
    for (const f of RUNTIME_FIELDS)
      if (fieldAvailable(f, app.config.version, app.config.platform, app.config.values))
        out.push({ kind: 'Setting', label: f.label, detail: 'PowerShell run-time options', run: () => app.goTo('network', f.id) });
    for (const l of LISTS) out.push({ kind: 'Go to', label: l.title, run: () => app.goTo(l.section) });
    return out;
  });

  const results = $derived.by(() => {
    const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = items.filter((i) => toks.every((t) => `${i.label} ${i.detail ?? ''} ${i.kind}`.toLowerCase().includes(t)));
    return hits.slice(0, 30);
  });

  $effect(() => {
    q;
    sel = 0;
  });
  $effect(() => {
    input?.focus();
  });

  function close() {
    app.showPalette = false;
  }
  function choose(i: Item) {
    close();
    i.run();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      sel = Math.min(sel + 1, results.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      sel = Math.max(sel - 1, 0);
    } else if (e.key === 'Enter' && results[sel]) choose(results[sel]);
  }
</script>

<div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && close()}>
  <div class="modal palette" role="dialog" aria-modal="true" aria-label="Command palette">
    <input bind:this={input} bind:value={q} onkeydown={onKey} type="text" placeholder="Search settings, jump to a section, run an action…" aria-label="Command palette search" />
    <ul>
      {#each results as r, i (r.kind + r.label + (r.detail ?? ''))}
        <li class:sel={i === sel}>
          <button onclick={() => choose(r)}>
            <span>{r.label}{#if r.detail}<span class="kind"> · {r.detail}</span>{/if}</span>
            <span class="kind">{r.kind}</span>
          </button>
        </li>
      {:else}
        <li class="help" style="padding:8px">No matches.</li>
      {/each}
    </ul>
  </div>
</div>
