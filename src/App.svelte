<script lang="ts">
  import { onMount } from 'svelte';
  import packageInfo from '../package.json';
  import { app } from './lib/store.svelte';
  import { sectionSelected } from './lib/model';
  import { GROUPS, LISTS, SECTIONS, type SectionId } from './lib/schema';
  import { VERSIONS, PLATFORMS, LIFECYCLE_SNAPSHOT, platformAvailable } from './lib/versions';
  import { validateConfig, countBySection } from './lib/validate';
  import { render, download } from './lib/render';
  import Topology from './components/Topology.svelte';
  import LintPanel from './components/LintPanel.svelte';
  import GroupCard from './components/GroupCard.svelte';
  import ListEditor from './components/ListEditor.svelte';
  import JwtSettings from './components/JwtSettings.svelte';
  import OidcSettings from './components/OidcSettings.svelte';
  import OutputPanel from './components/OutputPanel.svelte';
  import OutputSplitter from './components/OutputSplitter.svelte';
  import ImportDialog from './components/ImportDialog.svelte';
  import CommandPalette from './components/CommandPalette.svelte';
  import Templates from './components/Templates.svelte';
  import NoticeStack from './components/NoticeStack.svelte';
  import DeploymentRisk from './components/DeploymentRisk.svelte';
  import { platformDef } from './lib/versions';
  import EdgeServicePicker from './components/EdgeServicePicker.svelte';

  const descriptions: Record<SectionId, { eyebrow: string; description: string }> = {
    general: { eyebrow: 'Appliance profile', description: 'Define the appliance identity and administrative hardening baseline.' },
    adminUsers: { eyebrow: 'Administrative access', description: 'Create additional monitoring-role Admin UI and API users without storing their passwords.' },
    network: { eyebrow: 'Platform & connectivity', description: 'Set deployment targets, addressing, DNS, and time synchronization.' },
    ha: { eyebrow: 'Shared virtual IP', description: 'Configure the native high-availability Group ID and IPv4 VIP for this UAG; deploy and verify the other nodes separately.' },
    services: { eyebrow: 'Publishing model', description: 'Choose which edge services this UAG should publish; unselected services remain optional and disabled.' },
    horizon: { eyebrow: 'Edge service', description: 'Publish Horizon securely through the UAG with client protocol endpoints.' },
    tunnel: { eyebrow: 'Workspace ONE edge service', description: 'Connect the UAG-hosted Tunnel gateway to Workspace ONE UEM for per-app VPN access.' },
    contentGateway: { eyebrow: 'Workspace ONE edge service', description: 'Configure standalone or shared Content Gateway access to managed content through Workspace ONE UEM.' },
    seg: { eyebrow: 'Workspace ONE edge service', description: 'Configure a standalone Secure Email Gateway using your UEM Mobile Email Management configuration.' },
    wrp: { eyebrow: 'Application publishing', description: 'Add web reverse proxy instances for internal applications and portals.' },
    auth: { eyebrow: 'Identity & MFA', description: 'Configure the authentication providers selected by your published services.' },
    tls: { eyebrow: 'Transport security', description: 'Control appliance certificates and permitted TLS protocols.' },
    monitoring: { eyebrow: 'Operations', description: 'Send appliance and edge-service events to your operations tooling.' },
    templates: { eyebrow: 'Starting points', description: 'Load a validated design, then tailor it to your environment.' }
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
  let outputCollapsed = $state(false);
  let layout = $state<HTMLElement>();
  let headerHeight = $state(64);
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let lintPanel: { reveal: () => void };

  function reviewValidation() {
    lintPanel.reveal();
  }

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

  const optionalSections: SectionId[] = ['ha', 'horizon', 'tunnel', 'contentGateway', 'seg', 'wrp', 'auth', 'monitoring', 'adminUsers'];

  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
</script>

<svelte:window onkeydown={onKey} onclick={() => (exportOpen = false)} />

<div class="app" style:--workspace-header-height={`${headerHeight}px`}>
  <header class="top" bind:offsetHeight={headerHeight}>
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
      <button class="templates-button" class:templates-active={app.section === 'templates'} aria-current={app.section === 'templates' ? 'page' : undefined} onclick={() => app.goTo('templates')}>
        <span aria-hidden="true">▦</span> Templates
      </button>
      <button class="secondary-button" onclick={() => (app.showImport = true)}>
        <span aria-hidden="true">↓</span> Import
      </button>
      <div class="menu">
        <button class="primary" aria-haspopup="menu" aria-expanded={exportOpen} onclick={(e) => { e.stopPropagation(); exportOpen = !exportOpen; }}>
          Export <span aria-hidden="true">⌄</span>
        </button>
        {#if exportOpen}
          <div class="pop">
            <DeploymentRisk platform={app.config.platform} version={app.config.version} latestVersionId={latestVersion.id} compact />
            <div role="menu" aria-label="Export format">
            <button role="menuitem" onclick={() => exportAs('ini')}><strong>Deployment INI</strong><small>uagdeploy.ps1 input</small></button>
            <button role="menuitem" onclick={() => exportAs('json')}><strong>Settings JSON</strong><small>Admin UI / REST import</small></button>
            <button role="menuitem" onclick={() => exportAs('ps')}><strong>PowerShell script</strong><small>Deploy-ready workflow</small></button>
            {#if app.config.platform === 'openshift'}<button role="menuitem" onclick={() => exportAs('manifest')}><strong>{app.config.values.ocp_volumeSourceMode === 'console' ? 'Bootable-volume runbook' : 'Bootable-volume YAML'}</strong><small>OpenShift CDI DataVolume / DataSource preparation</small></button>{/if}
            <button role="menuitem" onclick={() => exportAs('docs')}><strong>Markdown runbook</strong><small>Handoff documentation</small></button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <main class="layout" class:output-collapsed={outputCollapsed} bind:this={layout}>
    <nav class="side" aria-label="Configuration sections">
      <div class="nav-heading"><span>Setup</span><small>{SECTIONS.filter((s) => s.id !== 'templates' && !counts[s.id].error).length}/{SECTIONS.length - 1} sections clear</small></div>
      <div class="nav-list">
        {#each SECTIONS.filter((s) => s.id !== 'templates') as s, index (s.id)}
          {@const n = counts[s.id]}
          {@const optionalSection = optionalSections.includes(s.id) && !sectionSelected(app.config, s.id)}
          <div class="nav-entry" class:has-findings={!optionalSection && !!(n.error || n.warn)}>
            <button class:on={app.section === s.id} class:optional-service={optionalSection} aria-current={app.section === s.id ? 'page' : undefined} onclick={() => app.goTo(s.id)}>
              <span class="nav-glyph" aria-hidden="true">{s.icon}</span>
              <span class="nav-label"><strong>{s.title}</strong><small>{optionalSection ? 'Optional · not configured' : `Step ${index + 1}`}</small></span>
              {#if optionalSection}<span class="nav-optional" aria-label="Optional, not configured">⊖</span>
              {:else if !n.error && !n.warn}<span class="nav-check" aria-label="No findings">✓</span>{/if}
            </button>
            {#if !optionalSection && (n.error || n.warn)}
              <button type="button" class="validation-count nav-count" class:blocked={!!n.error} class:warn={!n.error}
                aria-controls="validation-lint" aria-label={`${n.error || n.warn} ${n.error ? 'error' : 'warning'}${(n.error || n.warn) === 1 ? '' : 's'} in ${s.title}; review validation and lint`}
                onclick={reviewValidation}>{n.error || n.warn}</button>
            {/if}
          </div>
        {/each}
      </div>
      <div class="nav-assurance">
        <span class="lock-mark" aria-hidden="true"></span>
        <div><strong>Browser-only workspace</strong><p>No telemetry. Drafts are saved locally with secrets stripped.</p></div>
      </div>
    </nav>

    <div class="center">
      <details class="target-profile" aria-label="Target environment">
        <summary>
          <span class="profile-label">Target</span>
          <strong>UAG {app.config.version}</strong>
          <span class="profile-platform" data-platform={app.config.platform}>{platformDef(app.config.platform).label}</span>
          {#if app.config.version !== latestVersion.id}<span class="profile-caution">Older release</span>{/if}
          {#if app.config.platform === 'openshift'}<span class="profile-caution">Limited Availability</span>{/if}
          {#if app.config.platform === 'nutanix'}<span class="profile-caution">QCOW2 preparation</span>{/if}
          <span class="profile-edit">Change / details</span>
        </summary>
        <section class="environment-bar" aria-label="Target controls">
        <div class="environment-item environment-release">
          <span class="environment-label">Release</span>
          <div class="environment-picker release-picker" role="group" aria-label="Target UAG release" title={`Release lifecycle snapshot from the Omnissa Lifecycle Matrix (${LIFECYCLE_SNAPSHOT})`}>
            <button
              type="button"
              class="environment-choice release-choice"
              class:active={app.config.version === latestVersion.id}
              aria-pressed={app.config.version === latestVersion.id}
              onclick={useLatestVersion}
            >
              <span>UAG {latestVersion.id}</span><small>Recommended</small>
            </button>
            <label class="sr-only" for="uag-version">Other UAG release</label>
            <select
              id="uag-version"
              value={app.config.version === latestVersion.id ? '' : app.config.version}
              onchange={(event) => (app.config.version = event.currentTarget.value)}
              aria-label="Other UAG release"
            >
              <option value="" disabled>Other releases</option>
              {#each [...VERSIONS].reverse().filter((v) => !v.latest) as v (v.id)}
                <option value={v.id}>UAG {v.id}</option>
              {/each}
            </select>
          </div>
        </div>
        <div class="environment-item environment-platform">
          <span class="environment-label">Platform</span>
          <div class="environment-picker platform-picker" role="group" aria-label="Deployment platform">
            {#each PLATFORMS as p (p.id)}
              <button
                type="button"
                class="environment-choice"
                data-platform={p.id}
                class:active={app.config.platform === p.id}
                aria-pressed={app.config.platform === p.id}
                disabled={!platformAvailable(p.id, app.config.version)}
                onclick={() => (app.config.platform = p.id)}
              >{p.label}</button>
            {/each}
          </div>
        </div>
        </section>
        <NoticeStack
          platform={app.config.platform}
          version={app.config.version}
          latestVersionId={latestVersion.id}
          onUseLatest={useLatestVersion}
        />
      </details>

      <header class="workspace-head quiet-heading">
        <div>
          <h1>{current.title}</h1>
          <details class="section-help"><summary>About this section</summary><p>{currentMeta.description}</p></details>
        </div>
        <div class="validation-summary" role="status" aria-live="polite">
          <button type="button" class="validation-count readiness" class:ready class:blocked={!ready} class:warn={ready && totalWarnings > 0}
            aria-controls="validation-lint" title="Review validation and lint" onclick={reviewValidation}>
            <span class="status-dot" aria-hidden="true"></span>
            <strong>{ready ? `Ready · ${totalWarnings} advisories` : `${totalErrors} blocking error${totalErrors === 1 ? '' : 's'}`}</strong>
            <span aria-hidden="true">↓</span>
          </button>
          {#if !ready && totalWarnings > 0}
            <button type="button" class="validation-count warn" aria-controls="validation-lint" title="Review validation and lint" onclick={reviewValidation}>
              {totalWarnings} warning{totalWarnings === 1 ? '' : 's'}
            </button>
          {/if}
        </div>
      </header>

      {#if (app.section === 'horizon' && app.config.values.horizon_enabled === true) ||
        (app.section === 'tunnel' && app.config.values.airwatch_enabled === true) ||
        (app.section === 'contentGateway' && app.config.values.contentGateway_enabled === true) ||
        (app.section === 'seg' && app.config.values.seg_enabled === true) ||
        (app.section === 'wrp' && sectionSelected(app.config, 'wrp'))}
        <Topology />
      {/if}

      {#if app.section === 'templates'}
        <Templates />
      {:else if app.section === 'services'}
        <EdgeServicePicker />
      {:else}
        {#if currentIssues.length}
          <div class="section-context"><button type="button" class="validation-count" class:blocked={currentIssues.some((issue) => issue.level === 'error')}
            class:warn={!currentIssues.some((issue) => issue.level === 'error') && currentIssues.some((issue) => issue.level === 'warn')}
            aria-controls="validation-lint" onclick={reviewValidation}><strong>{currentIssues.length} section finding{currentIssues.length === 1 ? '' : 's'} to review</strong><span aria-hidden="true">↓</span></button></div>
        {/if}
        {#if app.section === 'ha' && app.config.platform === 'azure'}
          <div class="notice">Native high availability is not supported on Azure. Existing HA values are retained but not emitted.</div>
        {/if}
        {#each groups as g (g.id)}
          {#if g.id === 'oidc'}
            <OidcSettings {issues} />
          {:else}
            <GroupCard group={g} {issues} />
          {/if}
        {/each}
        {#each lists.filter((list) => list.id !== 'jwt' && list.id !== 'jwtIssuers' && list.id !== 'oidc') as l (l.id)}<ListEditor list={l} {issues} />{/each}
        {#if app.section === 'auth'}<JwtSettings {issues} />{/if}
      {/if}
      <LintPanel bind:this={lintPanel} {issues} />
    </div>

    <OutputSplitter {layout} collapsed={outputCollapsed} />
    <OutputPanel bind:collapsed={outputCollapsed} />
  </main>

  <footer class="site-footer">
    <strong>Gateway Forge is a community-driven, unofficial tool.</strong>
    It is <strong>not affiliated with, endorsed by, or supported by Omnissa</strong>. Omnissa, Unified Access Gateway, UAG and Horizon are trademarks of their respective owners. Always review generated configuration before deploying it, and refer to the <a href="https://docs.omnissa.com/" target="_blank" rel="noopener noreferrer">official Omnissa documentation</a>.
    <a href="https://github.com/erikgraa/gateway-forge" target="_blank" rel="noopener noreferrer">Source on GitHub</a> · MIT license
        <span>· Gateway Forge v{packageInfo.version}</span>  </footer>
</div>

{#if app.showImport}<ImportDialog />{/if}
{#if app.showPalette}<CommandPalette />{/if}
{#if app.toast}<div class="toast" role="status">{app.toast}</div>{/if}
