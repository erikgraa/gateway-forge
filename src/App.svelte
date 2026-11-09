<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from './lib/store.svelte';
  import { GROUPS, LISTS, SECTIONS, type SectionId } from './lib/schema';
  import { VERSIONS, PLATFORMS, LIFECYCLE_SNAPSHOT, platformAvailable } from './lib/versions';
  import { validateConfig, countBySection } from './lib/validate';
  import { render, download } from './lib/render';
  import Topology from './components/Topology.svelte';
  import LintPanel from './components/LintPanel.svelte';
  import GroupCard from './components/GroupCard.svelte';
  import ListEditor from './components/ListEditor.svelte';
  import OutputPanel from './components/OutputPanel.svelte';
  import ImportDialog from './components/ImportDialog.svelte';
  import CommandPalette from './components/CommandPalette.svelte';
  import Templates from './components/Templates.svelte';
  import NoticeStack from './components/NoticeStack.svelte';

  const descriptions: Record<SectionId, { eyebrow: string; description: string }> = {
    general: { eyebrow: 'Appliance profile', description: 'Define the appliance identity and administrative hardening baseline.' },
    adminUsers: { eyebrow: 'Administrative access', description: 'Create additional monitoring-role Admin UI and API users without storing their passwords.' },
    network: { eyebrow: 'Platform & connectivity', description: 'Set deployment targets, addressing, DNS, and time synchronization.' },
    horizon: { eyebrow: 'Edge service', description: 'Publish Horizon securely through the UAG with client protocol endpoints.' },
    tunnel: { eyebrow: 'Workspace ONE edge service', description: 'Connect the UAG-hosted Tunnel gateway to Workspace ONE UEM for per-app VPN access.' },
    contentGateway: { eyebrow: 'Workspace ONE edge service', description: 'Configure standalone or shared Content Gateway access to managed content through Workspace ONE UEM.' },
    wrp: { eyebrow: 'Application publishing', description: 'Add web reverse proxy instances for internal applications and portals.' },
    auth: { eyebrow: 'Identity & MFA', description: 'Configure the authentication providers selected by your published services.' },
    tls: { eyebrow: 'Transport security', description: 'Control appliance certificates and permitted TLS protocols.' },
    monitoring: { eyebrow: 'Operations', description: 'Send appliance and edge-service events to your operations tooling.' },
    templates: { eyebrow: 'Starting points', description: 'Load a validated design, then tailor it to your environment.' }
  };

  const glyphs: Record<SectionId, string> = {
    general: 'AG', adminUsers: 'AU', network: 'NW', horizon: 'HZ', tunnel: 'TN', contentGateway: 'CG', wrp: 'WP', auth: 'ID', tls: 'TS', monitoring: 'OP', templates: 'TP'
  };
  const issues = $derived(validateConfig(app.config));
  const counts = $derived(countBySection(issues));
  const groups = $derived(GROUPS.filter((g) => g.section === app.section));
  const lists = $derived(LISTS.filter((l) => l.section === app.section));
  const current = $derived(SECTIONS.find((s) => s.id === app.section)!);
  const currentMeta = $derived(descriptions[app.section]);
  const currentIssues = $derived(issues.filter((i) => i.section === app.section));
  const totalErrors = $derived(issues.filter((i) => i.level === 'error').length);
  const totalWarnings = $derived(issues.filter((i) => i.level === 'warn').length);
  const ready = $derived(totalErrors === 0);
  const latestVersion = VERSIONS.find((v) => v.latest)!;

  let exportOpen = $state(false);
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
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

  function exportAs(tab: 'ini' | 'json' | 'ps' | 'docs' | 'manifest') {
    exportOpen = false;
    download(render(app.config, tab, app.secretMode, app.deploymentMode));
  }

  function useLatestVersion() {
    app.config.version = latestVersion.id;
    app.say(`Switched to the recommended UAG ${latestVersion.id} baseline`);
  }

  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
</script>

<svelte:window onkeydown={onKey} onclick={() => (exportOpen = false)} />

<div class="app">
  <header class="top">
    <a class="brand" href="." aria-label="Gateway Forge home">
      <img src="./logo.png" alt="" width="32" height="32" />
      <span class="brand-name">Gateway Forge<small>UAG configuration workspace</small></span>
    </a>
    <button class="cmdk" onclick={(e) => { e.stopPropagation(); app.showPalette = true; }} aria-label="Search settings or jump to a section">
      <span class="search-icon" aria-hidden="true"></span><span>Search settings…</span><kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
    </button>
    <div class="top-actions">
      <button class="icon-button" onclick={() => app.toggleTheme()} aria-label="Toggle color theme" title="Toggle color theme">
        <span aria-hidden="true">{app.theme === 'dark' ? '☀' : '◐'}</span>
      </button>
      <button class="reset-button" onclick={resetAll} title="Reset all settings to a blank configuration">
        <span aria-hidden="true">↺</span> Reset configuration
      </button>
      <button class="secondary-button" onclick={() => (app.showImport = true)}>
        <span aria-hidden="true">↓</span> Import
      </button>
      <div class="menu">
        <button class="primary" aria-haspopup="menu" aria-expanded={exportOpen} onclick={(e) => { e.stopPropagation(); exportOpen = !exportOpen; }}>
          Export <span aria-hidden="true">⌄</span>
        </button>
        {#if exportOpen}
          <div class="pop" role="menu" aria-label="Export format">
            <button role="menuitem" onclick={() => exportAs('ini')}><strong>Deployment INI</strong><small>uagdeploy.ps1 input</small></button>
            <button role="menuitem" onclick={() => exportAs('json')}><strong>Settings JSON</strong><small>Admin UI / REST import</small></button>
            <button role="menuitem" onclick={() => exportAs('ps')}><strong>PowerShell script</strong><small>Deploy-ready workflow</small></button>
            {#if app.config.platform === 'openshift'}<button role="menuitem" onclick={() => exportAs('manifest')}><strong>{app.config.values.ocp_volumeSourceMode === 'console' ? 'Bootable-volume runbook' : 'Bootable-volume YAML'}</strong><small>OpenShift CDI DataVolume / DataSource preparation</small></button>{/if}
            <button role="menuitem" onclick={() => exportAs('docs')}><strong>Markdown runbook</strong><small>Handoff documentation</small></button>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <main class="layout">
    <nav class="side" aria-label="Configuration sections">
      <div class="nav-heading"><span>Setup</span><small>{SECTIONS.filter((s) => s.id !== 'templates' && !counts[s.id].error).length}/{SECTIONS.length - 1} sections clear</small></div>
      <div class="nav-list">
        {#each SECTIONS as s, index (s.id)}
          {@const n = counts[s.id]}
          <button class:on={app.section === s.id} aria-current={app.section === s.id ? 'page' : undefined} onclick={() => app.goTo(s.id)}>
            <span class="nav-glyph" aria-hidden="true">{glyphs[s.id]}</span>
            <span class="nav-label"><strong>{s.title}</strong><small>{s.id === 'templates' ? 'Common configurations' : `Step ${index + 1}`}</small></span>
            {#if n.error}<i class="badge error" aria-label={`${n.error} errors`}>{n.error}</i>
            {:else if n.warn}<i class="badge warn" aria-label={`${n.warn} warnings`}>{n.warn}</i>
            {:else if s.id !== 'templates'}<span class="nav-check" aria-label="No findings">✓</span>{/if}
          </button>
        {/each}
      </div>
      <div class="nav-assurance">
        <span class="lock-mark" aria-hidden="true"></span>
        <div><strong>Browser-only workspace</strong><p>No telemetry. Drafts are saved locally with secrets stripped.</p></div>
      </div>
    </nav>

    <div class="center">
      <header class="workspace-head">
        <div>
          <p class="eyebrow">{currentMeta.eyebrow}</p>
          <h1>{current.title}</h1>
          <p class="section-description">{currentMeta.description}</p>
        </div>
        <div class:ready class:blocked={!ready} class="readiness" role="status" aria-live="polite">
          <span class="status-dot"></span>
          <div><strong>{ready ? 'Ready to review' : 'Needs attention'}</strong><small>{ready ? `${totalWarnings} advisory finding${totalWarnings === 1 ? '' : 's'}` : `${totalErrors} blocking error${totalErrors === 1 ? '' : 's'}`}</small></div>
        </div>
      </header>

      <section class="environment-bar" aria-label="Target environment">
        <div class="environment-item">
          <span class="environment-label">Release</span>
          <label class="sr-only" for="uag-version">Target UAG release</label>
          <select id="uag-version" bind:value={app.config.version} title={`Supported releases per the Omnissa Lifecycle Matrix (${LIFECYCLE_SNAPSHOT})`}>
            {#each [...VERSIONS].reverse() as v (v.id)}
              <option value={v.id}>UAG {v.id}{v.latest ? ' · recommended security baseline' : ' · older supported release'}</option>
            {/each}
          </select>
        </div>
        <div class="environment-divider"></div>
        <div class="environment-item">
          <span class="environment-label">Platform</span>
          <label class="sr-only" for="platform">Deployment platform</label>
          <select id="platform" bind:value={app.config.platform}>
            {#each PLATFORMS as p (p.id)}<option value={p.id} disabled={!platformAvailable(p.id, app.config.version)}>{p.label}{p.limitedAvailability ? ' · Limited Availability' : ''}</option>{/each}
          </select>
        </div>
        <div class="environment-summary">
          <span>Artifact</span><strong>{app.config.values.uagName || 'Unnamed appliance'}</strong>
        </div>
      </section>

      <NoticeStack
        platform={app.config.platform}
        version={app.config.version}
        latestVersionId={latestVersion.id}
        onUseLatest={useLatestVersion}
      />

      {#if (app.section === 'horizon' && app.config.values.horizon_enabled === true) ||
        (app.section === 'tunnel' && app.config.values.airwatch_enabled === true) ||
        (app.section === 'contentGateway' && app.config.values.contentGateway_enabled === true) ||
        (app.section === 'wrp' && app.config.wrp.some((item) => item.enabled !== false))}
        <Topology />
      {/if}

      {#if app.section === 'templates'}
        <Templates />
      {:else}
        <div class="section-context">
          <span>Current section</span>
          <strong>{currentIssues.length ? `${currentIssues.length} finding${currentIssues.length === 1 ? '' : 's'} to review` : 'No findings in this section'}</strong>
        </div>
        {#each groups as g (g.id)}<GroupCard group={g} {issues} />{/each}
        {#each lists as l (l.id)}<ListEditor list={l} {issues} />{/each}
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
