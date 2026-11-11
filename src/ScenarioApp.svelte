<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Editor from './App.svelte';
  import Appearance from './components/Appearance.svelte';
  import FleetTopology from './components/FleetTopology.svelte';
  import { app } from './lib/store.svelte';
  import { modalFocus } from './lib/modal-focus';
  import { cloneConfig } from './lib/model';
  import { normalizeConfig, trailingWhitespace } from './lib/ordinary-whitespace';
  import { validateConfig, type Issue } from './lib/validate';
  import { activeMembers, editMember, fleetIssues, unlockFleet } from './lib/fleet';
  import { createWorkspace, emptyRegistry, legacyConfiguration, registryShape, savedRegistry, upgradedRegistry, removeDrafts, REGISTRY_KEY, LEGACY_DRAFT_KEY, type Registry, type Scenario, type Workspace } from './lib/scenario-workspaces';
  import { importFleet } from './lib/fleet-export';
  import BrandMark from './components/BrandMark.svelte';
  import ScenarioIcon from './components/ScenarioIcon.svelte';
  import FleetActionIcon from './components/FleetActionIcon.svelte';
  import CommunityFooter from './components/CommunityFooter.svelte';
  import TopologyPrerequisite from './components/TopologyPrerequisite.svelte';
  const brandName = 'UAG Foundry';
  let registry = $state<Registry>(emptyRegistry()), ready = $state(false), storageWritable = $state(true), legacy = $state<string | null>(null), message = $state(''), storageNotice = $state('');
  let view = $state<'editor' | 'topology'>('editor'), selected = $state(1), pendingDeletion = $state<string | null>(null), deletionError = $state('');
  let pendingClear = $state(false);
  let heading = $state<HTMLElement>();
  const current = $derived(registry.drafts.find(d => d.id === registry.current));
  const draftToDelete = $derived(registry.drafts.find(d => d.id === pendingDeletion));
  const baselineBlocked = $derived(app.config.values.horizon_enabled !== true || validateConfig(normalizeConfig(app.config)).some(i => i.level === 'error'));
  const selectedIssues = $derived(current?.fleet ? fleetIssues(current.fleet).filter(i => i.memberId === selected && i.id.startsWith('fleet-')) : []);
  const scenarios: { id: Scenario; title: string; subtitle: string }[] = [{ id: 'single', title: 'Single UAG', subtitle: 'One appliance with your chosen edge services.' }, { id: 'horizon', title: 'Horizon UAG topology', subtitle: 'Plan UAG groups, shared settings, and optional high availability.' }, { id: 'web', title: 'Web proxy', subtitle: 'A real reverse-proxy workspace with editable service rows.' }];
  function commitEditor() {
    if (!current || view !== 'editor') return;
    if (current.fleet) editMember(current.fleet, selected, app.config); else current.config = cloneConfig(app.config);
  }
  function persist() {
    commitEditor();
    if (!storageWritable) return;
    try { localStorage.setItem(REGISTRY_KEY, JSON.stringify(savedRegistry(registry))); } catch { storageNotice = 'Draft is in memory only: browser storage is unavailable.'; }
  }
  function checkedExport(): boolean {
    commitEditor(); persist();
    const issues = current?.fleet ? fleetIssues(current.fleet) : validateConfig(normalizeConfig(app.config));
    if (issues.some(i => i.level === 'error')) { message = 'Resolve configuration and fleet errors before checked export.'; return false; }
    message = ''; return true;
  }
  async function openWorkspace(workspace: Workspace, memberId?: number) {
    persist(); message = ''; closeDeletion(); registry.current = workspace.id;
    selected = memberId ?? activeMembers(workspace.fleet ?? { groups: [], members: [], unlocked: false, nextMember: 1, nextGroup: 1, undo: [] })[0]?.id ?? 1;
    const member = workspace.fleet?.members.find(m => m.id === selected); app.config = cloneConfig(member?.config ?? workspace.config);
    view = workspace.fleet?.unlocked ? 'topology' : 'editor'; app.section = workspace.scenario === 'web' ? 'wrp' : 'general';
    persist(); await tick(); heading?.focus();
  }
  async function create(scenario: Scenario) { const workspace = createWorkspace(scenario, crypto.randomUUID()); registry.drafts.push(workspace); await openWorkspace(workspace); }
  async function resumeLegacy() {
    if (!legacy) return;
    try { const workspace = createWorkspace('single', crypto.randomUUID()); workspace.name = 'Previous configuration'; workspace.config = legacyConfiguration(legacy); registry.drafts.push(workspace); await openWorkspace(workspace); }
    catch (e) { message = e instanceof Error ? e.message : String(e); }
  }
  async function returnToChooser() { persist(); message = ''; registry.current = null; closeDeletion(); persist(); await tick(); heading?.focus(); }
  async function deleteDrafts(all = false) {
    if (current || (all ? !pendingClear || !registry.drafts.length : !draftToDelete)) return;
    let next: Registry;
    try { next = removeDrafts(registry, all ? registry.drafts.map(d => d.id) : [draftToDelete!.id], storageWritable ? localStorage : undefined); }
    catch { deletionError = all ? 'Drafts could not be cleared from browser storage. All drafts have been kept.' : 'This draft could not be deleted from browser storage. It has been kept.'; return; }
    registry = next; closeDeletion();
    message = storageWritable ? all ? 'All saved drafts cleared.' : 'Draft deleted.' : all ? 'Session-only drafts cleared. Existing browser storage remains unchanged.' : 'Session-only draft removed. Existing browser storage remains unchanged.';
    await tick(); heading?.focus();
  }
  function closeDeletion() { pendingDeletion = null; pendingClear = false; }
  async function fullEditor(id: number, issue?: Issue) {
    commitEditor(); const member = current?.fleet?.members.find(m => m.id === id); if (!member) return;
    message = ''; selected = id; app.config = cloneConfig(member.config); view = 'editor'; app.section = issue?.section ?? 'general';
    await tick(); app.goTo(issue?.section ?? 'general', issue?.fieldId);
  }
  async function topology() {
    try { commitEditor(); if (current?.fleet && !current.fleet.unlocked) unlockFleet(current.fleet); message = ''; view = 'topology'; persist(); await tick(); heading?.focus(); } catch (e) { message = e instanceof Error ? e.message : String(e); }
  }
  async function loadTopology(event: Event) {
    const input = event.currentTarget as HTMLInputElement, file = input.files?.[0]; if (!file || !current?.fleet) return;
    const text = await file.text();
    try { const incoming = importFleet(text); current.fleet = incoming; selected = activeMembers(incoming)[0]?.id ?? 1; app.config = cloneConfig(incoming.members.find(m => m.id === selected)?.config ?? current.config); view = incoming.unlocked ? 'topology' : 'editor'; persist(); message = 'Topology imported. Validate its operator values before export.'; }
    catch (e) { current.retainedImports.push({ filename: file.name, raw: text }); message = `${String(e)} Original file retained in memory; no active configuration was replaced.`; }
    input.value = '';
  }
  onMount(() => {
    try { const raw = localStorage.getItem(REGISTRY_KEY); if (raw) { const candidate: unknown = JSON.parse(raw); if (registryShape(candidate)) registry = upgradedRegistry(candidate); else { storageWritable = false; storageNotice = 'Existing workspace registry is not supported and remains unchanged. New work stays in memory only.'; } } legacy = localStorage.getItem(LEGACY_DRAFT_KEY); } catch { storageWritable = false; storageNotice = 'Browser drafts could not be read. Existing storage remains unchanged; new work stays in memory only.'; }
    app.draftSaver = persist; app.exportGuard = checkedExport; app.retainImport = value => { current?.retainedImports.push(value); persist(); };
    if (current) { selected = current.fleet ? activeMembers(current.fleet)[0]?.id ?? 1 : 1; app.config = cloneConfig(current.fleet?.members.find(m => m.id === selected)?.config ?? current.config); view = current.fleet?.unlocked ? 'topology' : 'editor'; app.section = current.scenario === 'web' ? 'wrp' : 'general'; }
    ready = true;
    const hide = () => { if (document.visibilityState === 'hidden') persist(); };
    window.addEventListener('beforeunload', persist); window.addEventListener('pagehide', persist); document.addEventListener('visibilitychange', hide);
    return () => { window.removeEventListener('beforeunload', persist); window.removeEventListener('pagehide', persist); document.removeEventListener('visibilitychange', hide); app.draftSaver = null; app.exportGuard = null; app.retainImport = null; };
  });
  $effect(() => { const snapshot = ready && storageWritable ? JSON.stringify(registry) : ''; if (!snapshot) return; const timer = setTimeout(() => { try { localStorage.setItem(REGISTRY_KEY, JSON.stringify(savedRegistry(registry))); } catch { storageNotice = 'Draft is in memory only: browser storage is unavailable.'; } }, 500); return () => clearTimeout(timer); });
</script>
<svelte:window onkeydown={e => { if (e.key === 'Escape') closeDeletion(); }} />
<div class="scenario-shell">
  <header class="scenario-header"><a href="/" onclick={e => { e.preventDefault(); if (current) void returnToChooser(); }} class="scenario-brand"><span class="scenario-brand-mark" aria-hidden="true"><BrandMark /></span><span class="scenario-brand-name">{brandName}<small>Community Unified Access Gateway configuration builder</small></span></a><div class="scenario-header-actions"><Appearance />{#if current}<button id="scenario-save-return" class="save-return" title="Save this draft and return to the scenario chooser" onclick={returnToChooser}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 4-4 4 4 4 M5 8h8a3 3 0 0 1 3 3v1 M10 15l2 2 4-4" /></svg><span>Save & return</span></button>{/if}</div></header>
  {#if storageNotice}<div class="scenario-message" role="status">{storageNotice}<button aria-label="Dismiss storage notice" onclick={() => storageNotice = ''}>×</button></div>{/if}
  {#if message}<div class="scenario-message" role="status">{message}<button aria-label="Dismiss message" onclick={() => message = ''}>×</button></div>{/if}
  {#if ready && current}
    <div class="workspace-bar"><h1 class="workspace-title" data-scenario={current.scenario} tabindex="-1" bind:this={heading}><ScenarioIcon scenario={current.scenario} /><span>{scenarios.find(s => s.id === current.scenario)?.title}</span></h1><label for="workspace-name">Configuration name</label><input id="workspace-name" bind:value={current.name} onblur={() => { if (current) current.name = trailingWhitespace(current.name); }} />{#if current.fleet}<button id="show-topology" class:primary={view === 'editor'} aria-describedby={view === 'editor' ? 'topology-next-help' : undefined} onclick={topology}>{view === 'topology' ? 'Topology' : current.fleet.unlocked ? 'Save & return to topology' : 'Continue to fleet topology'}</button><label class="file-import-label">Import topology<input id="fleet-import" type="file" accept=".json" onchange={loadTopology} /></label>{/if}</div>
    {#if current.fleet && view === 'editor'}<div class="editor-topology-next"><TopologyPrerequisite unlocked={current.fleet.unlocked} blocked={baselineBlocked} /></div>{/if}
    {#if view === 'topology' && current.fleet}<FleetTopology fleet={current.fleet} bind:selected onedit={fullEditor} onsave={persist} />
    {:else}<div class="native-editor">{#if current.fleet?.unlocked && current.fleet.groups.find(g => g.id === current.fleet?.members.find(m => m.id === selected)?.groupId)?.templateId !== selected}<p class="scenario-message">Template follower: shared edits here affect this appliance for now. Later group or template-owner changes reapply shared settings; names, addresses and destination overrides remain individual.</p>{/if}<Editor embedded {brandName} extraIssues={selectedIssues} /></div>{/if}
  {:else if ready}<main class="scenario-entry"><div class="scenario-intro"><span class="eyebrow">Configuration workspace</span><h1 tabindex="-1" bind:this={heading}>What are you building?</h1><p>Start with blank appliance defaults. Your scenario stays fixed; create a new workspace to choose another.</p></div><div class="scenario-cards">{#each scenarios as scenario}<button class="scenario-card" data-scenario={scenario.id} id={'scenario-' + scenario.id} onclick={() => create(scenario.id)}><strong class="scenario-card-title"><ScenarioIcon scenario={scenario.id} /><span>{scenario.title}</span></strong><span>{scenario.subtitle}</span><span class="scenario-card-action">Create workspace →</span></button>{/each}</div><section class="resume-list"><div class="resume-heading"><h2>Resume a browser-local draft</h2>{#if registry.drafts.length}<button id="clear-all-drafts" class="clear-drafts" onclick={() => { deletionError = ''; pendingDeletion = null; pendingClear = true; }}><FleetActionIcon action="remove" /><span>Clear all drafts</span></button>{/if}</div>{#if legacy}<button id="resume-legacy" onclick={resumeLegacy}>Resume previous configuration — original storage stays intact</button>{/if}{#each registry.drafts as draft}<div class="resume-item" data-scenario={draft.scenario} data-draft-id={draft.id}><button class="resume-open" onclick={() => openWorkspace(draft)}><strong>{draft.name}</strong><span class="draft-type"><ScenarioIcon scenario={draft.scenario} />{scenarios.find(s => s.id === draft.scenario)?.title}</span></button><button class="resume-remove" aria-label={'Delete draft “' + draft.name + '”'} title="Delete draft" onclick={() => { deletionError = ''; pendingClear = false; pendingDeletion = draft.id; }}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m5 5 10 10 M15 5 5 15" /></svg></button></div>{/each}{#if !legacy && !registry.drafts.length}<p>No saved workspaces yet.</p>{/if}<p class="storage-caveat">Recognized passwords are omitted from browser storage, not encrypted or backed up. Advanced target locators may contain credentials. Unsupported raw imports remain in memory only; their metadata, not content, is saved. This builder does not deploy appliances.</p></section><CommunityFooter /></main>{/if}
</div>
{#if draftToDelete || pendingClear}<div class="scenario-dialog-backdrop"><div class="scenario-dialog" use:modalFocus={closeDeletion} role="dialog" aria-modal="true" aria-labelledby="delete-draft-title" aria-describedby="delete-draft-help" tabindex="-1"><h2 id="delete-draft-title">{pendingClear ? 'Clear all drafts?' : 'Delete this draft?'}</h2>{#if pendingClear}<p class="delete-draft-name">{registry.drafts.length} saved {registry.drafts.length === 1 ? 'draft' : 'drafts'} will be removed.</p>{:else if draftToDelete}<p class="delete-draft-name">{draftToDelete.name}</p>{/if}<p id="delete-draft-help">{#if pendingClear}This removes every draft listed here, including configuration settings, fleet plans and memory-only imports. Export first if you need copies. This cannot be undone. Your previous configuration and appearance preferences are kept.{:else}This removes this workspace’s saved settings and memory-only imports. Export first if you need a copy. Other drafts, your previous configuration and appearance preferences are kept.{/if}{#if !storageWritable} These are session-only drafts; existing browser storage stays unchanged.{/if}</p>{#if deletionError}<p class="delete-draft-error" role="alert">{deletionError}</p>{/if}<div><button onclick={closeDeletion}>Cancel</button><button id={pendingClear ? 'confirm-clear-drafts' : 'confirm-delete-draft'} class="delete-draft-button" onclick={() => deleteDrafts(pendingClear)}>{#if pendingClear}<FleetActionIcon action="remove" />{/if}<span>{pendingClear ? 'Clear all drafts' : 'Delete draft'}</span></button></div></div></div>{/if}

<style>
  .scenario-brand { display: inline-flex; align-items: center; gap: 10px; }
  .scenario-brand-mark { display: grid; place-items: center; width: 32px; height: 32px; flex-shrink: 0; border-radius: 10px; background: var(--acc-strong); color: var(--panel); }
  .scenario-brand-name { display: flex; flex-direction: column; gap: 2px; line-height: 1.2; }
  .scenario-brand-name small { font-size: 10px; font-weight: 450; color: var(--mut); letter-spacing: 0; }
  .scenario-header .save-return { --save-tone: #11695f; display: inline-flex; align-items: center; gap: 7px; color: var(--save-tone); border-color: color-mix(in srgb, var(--save-tone) 45%, var(--line)); background: color-mix(in srgb, var(--save-tone) 10%, var(--panel)); font-weight: 650; }
  :global(html[data-theme='dark']) .scenario-header .save-return { --save-tone: #8ad7c9; }
  .scenario-header .save-return:hover { background: color-mix(in srgb, var(--save-tone) 18%, var(--panel)); }
  .save-return svg { width: 20px; height: 20px; flex-shrink: 0; }
  .save-return span { white-space: nowrap; }
  [data-scenario='single'] { --scenario-tone: #6b4fb3; }
  [data-scenario='horizon'] { --scenario-tone: #0c6976; }
  [data-scenario='web'] { --scenario-tone: #8c591f; }
  :global(html[data-theme='dark']) [data-scenario='single'] { --scenario-tone: #c9b4ff; }
  :global(html[data-theme='dark']) [data-scenario='horizon'] { --scenario-tone: #8ad7df; }
  :global(html[data-theme='dark']) [data-scenario='web'] { --scenario-tone: #efc184; }
  .scenario-card { border-top: 3px solid var(--scenario-tone); }
  .workspace-bar .workspace-title, .scenario-card .scenario-card-title { display: flex; align-items: center; gap: 9px; min-width: 0; max-width: 100%; line-height: 1.3; }
  .workspace-title > span, .scenario-card-title > span { display: block; min-width: 0; overflow-wrap: anywhere; }
  .scenario-card .scenario-card-action { color: var(--scenario-tone); }
  .scenario-card:hover { border-color: var(--scenario-tone); }
  .resume-item { display: flex; align-items: stretch; margin: 8px 0; border: 1px solid var(--line); border-left: 3px solid var(--scenario-tone); border-radius: 10px; background: var(--panel); }
  .resume-item .resume-open { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex: 1; min-width: 0; padding: 14px 16px; border: 0; border-radius: 10px; background: transparent; text-align: left; }
  .resume-open strong { overflow-wrap: anywhere; }
  .resume-open .draft-type { display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0; max-width: 75%; padding: 5px 8px; border: 1px solid color-mix(in srgb, var(--scenario-tone) 25%, var(--line)); border-radius: 7px; background: color-mix(in srgb, var(--scenario-tone) 8%, var(--panel)); color: var(--scenario-tone); font-size: 12px; font-weight: 650; overflow-wrap: anywhere; }
  .draft-type { --scenario-icon-size: 18px; }
  .resume-item .resume-remove { display: grid; place-items: center; width: 44px; min-height: 44px; flex-shrink: 0; padding: 0; border: 0; border-radius: 10px; background: transparent; color: var(--mut); }
  .resume-remove svg { width: 18px; height: 18px; }
  .resume-item .resume-remove:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 8%, var(--panel)); }
  .editor-topology-next { padding: 12px 24px; background: var(--panel); border-bottom: 1px solid var(--line); }
  .resume-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
  .resume-heading h2 { margin: 0; }
  .resume-heading .clear-drafts, .scenario-dialog .delete-draft-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: 650; color: color-mix(in srgb, var(--bad) 80%, var(--tx)); border-color: color-mix(in srgb, var(--bad) 65%, var(--line)); background: color-mix(in srgb, var(--bad) 14%, var(--panel)); }
  .resume-heading .clear-drafts:hover, .scenario-dialog .delete-draft-button:hover { background: color-mix(in srgb, var(--bad) 22%, var(--panel)); border-color: var(--bad); }
  .delete-draft-name { font-weight: 700; overflow-wrap: anywhere; }
  .delete-draft-error { color: var(--danger); }
  @media (max-width: 768px) { .scenario-brand-name small { display: none; } .resume-item .resume-open { flex-direction: column; align-items: flex-start; gap: 7px; padding: 12px; } .resume-open .draft-type { flex-shrink: 1; max-width: 100%; } }
</style>
