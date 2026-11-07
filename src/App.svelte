<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from './lib/store.svelte';
  import { GROUPS, LISTS, SECTIONS } from './lib/schema';
  import { VERSIONS, PLATFORMS, LIFECYCLE_SNAPSHOT } from './lib/versions';
  import { validateConfig, countBySection } from './lib/validate';
  import { render, download } from './lib/render';
  import Topology from './components/Topology.svelte';
  import LintPanel from './components/LintPanel.svelte';
  import GroupCard from './components/GroupCard.svelte';
  import ListEditor from './components/ListEditor.svelte';
  import OutputPanel from './components/OutputPanel.svelte';
  import ImportDialog from './components/ImportDialog.svelte';
  import CommandPalette from './components/CommandPalette.svelte';
  import ThumbprintTool from './components/ThumbprintTool.svelte';
  import Templates from './components/Templates.svelte';

  const issues = $derived(validateConfig(app.config));
  const counts = $derived(countBySection(issues));
  const groups = $derived(GROUPS.filter((g) => g.section === app.section));
  const lists = $derived(LISTS.filter((l) => l.section === app.section));

  let exportOpen = $state(false);
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    // Track the whole config so any edit schedules a (secret-free) draft save.
    JSON.stringify(app.config);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => app.saveDraft(), 400);
  });

  onMount(() => {
    const mq = matchMedia('(prefers-color-scheme: light)');
    const onScheme = () => {
      if (!localStorage.getItem('gateway-forge.theme')) app.setTheme(mq.matches ? 'light' : 'dark', false);
    };
    mq.addEventListener('change', onScheme);
    return () => mq.removeEventListener('change', onScheme);
  });

  function onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      app.showPalette = !app.showPalette;
    }
  }

  function resetAll() {
    if (confirm('Reset all settings to a blank configuration? This cannot be undone.')) {
      app.clearDraft();
      app.say('Configuration reset');
    }
  }

  function exportAs(tab: 'ini' | 'json' | 'ps' | 'docs') {
    exportOpen = false;
    download(render(app.config, tab, app.secretMode));
  }

  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
</script>

<svelte:window onkeydown={onKey} onclick={() => (exportOpen = false)} />

<div class="app">
  <header class="top">
    <div class="brand"><img src="./logo.png" alt="" width="30" height="30" /><span>Gateway Forge</span><small class="tag">for Omnissa UAG</small></div>
    <button class="cmdk" onclick={(e) => { e.stopPropagation(); app.showPalette = true; }} aria-label="Open command palette">
      <span>Search settings, jump to section…</span><kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
    </button>
    <span class="spacer"></span>
    <label class="sel-group">UAG
      <select class="t" bind:value={app.config.version} aria-label="UAG version" title={`Supported releases per the Omnissa Lifecycle Matrix (${LIFECYCLE_SNAPSHOT})`}>
        {#each [...VERSIONS].reverse() as v (v.id)}
          <option value={v.id}>{v.id}{v.latest ? ' (latest)' : ''}</option>
        {/each}
      </select>
    </label>
    <label class="sel-group">Platform
      <select class="t" bind:value={app.config.platform} aria-label="Deployment platform">
        {#each PLATFORMS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
      </select>
    </label>
    <button onclick={() => app.toggleTheme()} aria-label="Toggle light/dark theme" title="Toggle theme">{app.theme === 'dark' ? '☀ Light' : '🌙 Dark'}</button>
    <button class="reset" onclick={resetAll} title="Clear the whole configuration and start over">↺ Reset</button>
    <button onclick={() => (app.showImport = true)}>Import</button>
    <div class="menu">
      <button class="primary" aria-haspopup="menu" aria-expanded={exportOpen} onclick={(e) => { e.stopPropagation(); exportOpen = !exportOpen; }}>Export ▾</button>
      {#if exportOpen}
        <div class="pop" role="menu">
          <button role="menuitem" onclick={() => exportAs('ini')}>INI (uagdeploy)</button>
          <button role="menuitem" onclick={() => exportAs('json')}>Settings JSON</button>
          <button role="menuitem" onclick={() => exportAs('ps')}>PowerShell script</button>
          <button role="menuitem" onclick={() => exportAs('docs')}>Docs (Markdown)</button>
        </div>
      {/if}
    </div>
  </header>

  <main class="layout">
    <nav class="side" aria-label="Sections">
      {#each SECTIONS as s (s.id)}
        {@const n = counts[s.id]}
        <button class:on={app.section === s.id} aria-current={app.section === s.id ? 'page' : undefined} onclick={() => app.goTo(s.id)}>
          <span>{s.icon} {s.title}</span>
          {#if n.error}<i class="badge error">{n.error}</i>
          {:else if n.warn}<i class="badge warn">{n.warn}</i>
          {:else if s.id !== 'templates'}<i class="badge ok">✓</i>{/if}
        </button>
      {/each}
      <p class="footer">
        <strong>Private by design.</strong> Everything runs in your browser. No telemetry. Secrets are never saved and are masked in exports unless you opt in.
      </p>
    </nav>

    <div class="center">
      <Topology />
      {#if app.section === 'templates'}
        <Templates />
      {:else}
        {#each groups as g (g.id)}<GroupCard group={g} {issues} />{/each}
        {#each lists as l (l.id)}<ListEditor list={l} {issues} />{/each}
        {#if app.section === 'horizon'}<ThumbprintTool />{/if}
      {/if}
      <LintPanel {issues} />
    </div>

    <OutputPanel />
  </main>

  <footer class="site-footer">
    <strong>Gateway Forge is a community-driven, unofficial tool.</strong>
    It is <strong>not affiliated with, endorsed by, or supported by Omnissa</strong>. Omnissa, Unified Access Gateway, UAG and Horizon are trademarks of their respective owners. Always review generated configuration before deploying it, and refer to the official Omnissa documentation.
    <a href="https://github.com/erikgraa/gateway-forge" target="_blank" rel="noopener noreferrer">Source on GitHub</a> · MIT license
  </footer>
</div>

{#if app.showImport}<ImportDialog />{/if}
{#if app.showPalette}<CommandPalette />{/if}
{#if app.toast}<div class="toast" role="status">{app.toast}</div>{/if}
