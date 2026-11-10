<script lang="ts">
  import { app, type OutputTab } from '../lib/store.svelte';
  import { render, copy, highlight } from '../lib/render';
  import { VERSIONS } from '../lib/versions';
  import { ADMIN_PASSWORD_GUIDANCE, adminSamlEnabled, MISSING_PASSWORD_WARNING, VSPHERE_HEADLESS_GUIDANCE } from '../lib/powershell';
  import { VCENTER_CREDENTIAL_TARGET_EXAMPLE, VCENTER_INLINE_PASSWORD_WARNING, OVF_TOOL_VERSION_GUIDANCE } from '../lib/vcenterTarget';

  let { collapsed = $bindable(false) }: { collapsed?: boolean } = $props();
  const contentId = $props.id();

  const tabs = $derived.by((): { id: OutputTab; label: string }[] => [
    { id: 'ini', label: 'INI' },
    { id: 'json', label: 'JSON' },
    { id: 'ps', label: 'PowerShell' },
    ...(app.config.platform === 'openshift' ? [{ id: 'manifest' as const, label: app.config.values.ocp_volumeSourceMode === 'console' ? 'Prep' : 'YAML' }] : []),
    { id: 'docs', label: 'Docs' }
  ]);
  const icons: Record<OutputTab, string> = {
    ini: 'M4 5h16M4 12h16M4 19h16M8 3v4M16 10v4M10 17v4',
    json: 'M8 3H6a2 2 0 0 0-2 2v4c0 2-2 3-2 3s2 1 2 3v4a2 2 0 0 0 2 2h2M16 3h2a2 2 0 0 1 2 2v4c0 2 2 3 2 3s-2 1-2 3v4a2 2 0 0 1-2 2h-2',
    ps: 'M3 5h18v14H3zM7 9l3 3-3 3M13 15h4',
    docs: 'M12 5v16M12 5C9 3 6 3 3 4v15c3-1 6-1 9 2 3-3 6-3 9-2V4c-3-1-6-1-9 1Z',
    manifest: 'M5 3v12a4 4 0 0 0 4 4h6M5 7h10M15 4v6M15 16v6M2 3h6'
  };
  function navigateTab(event: KeyboardEvent, index: number) {
    const key = event.key;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
    event.preventDefault();
    const next = key === 'Home' ? 0 : key === 'End' ? tabs.length - 1 : (index + (key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    app.tab = tabs[next].id;
    const button = event.currentTarget as HTMLButtonElement;
    button.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }
  const hints: Record<OutputTab, string> = {
    ini: 'Platform-specific uagdeploy input',
    json: 'Admin UI import / PUT /rest/v1/config/settings',
    ps: 'Writes the platform artifacts and runs the documented workflow',
    docs: 'Markdown summary for runbooks',
    manifest: 'CDI DataVolume + DataSource; apply before deployment'
  };

  $effect(() => {
    if (app.tab === 'manifest' && app.config.platform !== 'openshift') app.tab = 'ini';
    if (app.deploymentMode === 'headless' && app.config.platform === 'nutanix') app.deploymentMode = 'interactive';
  });

  const rendered = $derived(render(app.config, app.tab, app.secretMode, app.deploymentMode));
  const html = $derived(highlight(rendered.text, app.tab));
  const numbered = $derived(app.tab === 'ini' || app.tab === 'json' || app.tab === 'ps');
  const lineNumbers = $derived(numbered ? rendered.text.split('\n').map((_, index) => index + 1) : []);
  const hasSecrets = $derived(app.secretMode === 'include');
  const latestVersion = VERSIONS.find((v) => v.latest)!;
  const olderVersion = $derived(app.config.version !== latestVersion.id);

  async function doCopy() {
    app.say((await copy(rendered.text)) ? 'Copied to clipboard' : 'Copy failed - select the text manually');
  }
</script>

<aside id="generated-output" class="out" class:collapsed aria-label="Generated output">
  <div class="output-head">
    <div hidden={collapsed}><span class="live-indicator"><i></i> Live artifact</span><h2>Configuration preview</h2></div>
    <div class="output-pane-controls">
      <span class="artifact-status" hidden={collapsed}>Auto-generated</span>
      <button
        type="button"
        class="output-collapse"
        aria-label={collapsed ? 'Expand output pane' : 'Collapse output pane'}
        aria-expanded={!collapsed}
        aria-controls={contentId}
        title={collapsed ? 'Expand output pane' : 'Collapse output pane'}
        onclick={() => (collapsed = !collapsed)}
      ><span aria-hidden="true">{collapsed ? '‹' : '›'}</span><span class="output-toggle-label">{collapsed ? 'Output' : 'Collapse'}</span></button>
    </div>
  </div>
  <div class="output-content" id={contentId} hidden={collapsed}>
  <div class="output-toolbar">
    <div class="tabs" role="tablist" aria-label="Artifact format">
      {#each tabs as t, index (t.id)}
        <button
          type="button" role="tab" id={`${contentId}-${t.id}`}
          aria-selected={app.tab === t.id} aria-controls={`${contentId}-preview`}
          tabindex={app.tab === t.id ? 0 : -1} title={hints[t.id]}
          data-format={t.id} class:on={app.tab === t.id}
          onclick={() => (app.tab = t.id)} onkeydown={(event) => navigateTab(event, index)}
        ><svg class="artifact-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d={icons[t.id]} /></svg><span>{t.label}</span></button>
      {/each}
    </div>
    <div class="output-actions">
      <button class="small ghost" onclick={doCopy}>Copy</button>
    </div>
  </div>
  <div class="output-file">
    <span class="file-type">{app.tab === 'ps' ? 'PS1' : app.tab === 'manifest' ? (rendered.mime === 'text/markdown' ? 'RUNBOOK' : 'YAML') : app.tab.toUpperCase()}</span>
    <span><strong>{rendered.filename}</strong><small>{hints[app.tab]}</small></span>
  </div>
  {#if app.tab === 'ps'}
    <details class="runtime-options" open>
      <summary id={`${contentId}-runtime-title`}>Run-time options (uagdeploy.ps1)</summary>
      <fieldset class="runtime-controls" aria-labelledby={`${contentId}-runtime-title`}>
      <div class="deployment-mode">
        <span class="runtime-label" id="deployment-mode-label">Root / Admin UI passwords</span>
        <div class="mode-selector" role="radiogroup" aria-labelledby="deployment-mode-label">
          <label class:active={app.deploymentMode === 'interactive'}>
            <input type="radio" name="deployment-mode" value="interactive" bind:group={app.deploymentMode} />
            <span><strong>Interactive</strong><small>Prompt for passwords</small></span>
          </label>
          <label class:active={app.deploymentMode === 'headless'} class:disabled={app.config.platform === 'nutanix'}>
            <input type="radio" name="deployment-mode" value="headless" bind:group={app.deploymentMode} disabled={app.config.platform === 'nutanix'} />
            <span><strong>Environment passwords</strong><small>Other prompts may remain</small></span>
          </label>
        </div>
      </div>
      <p class="notice">{MISSING_PASSWORD_WARNING}</p>
      {#if app.config.platform === 'vsphere'}
        <p class="runtime-note"><strong>Fully unattended vSphere:</strong> {VSPHERE_HEADLESS_GUIDANCE}</p>
        <p class="runtime-note"><strong>vCenter target example (synthetic):</strong> <code>{VCENTER_CREDENTIAL_TARGET_EXAMPLE}</code>. The UPN domain belongs before the colon; check special-character handling against the installed OVF Tool release. {VCENTER_INLINE_PASSWORD_WARNING}</p>
        <p class="runtime-note">{OVF_TOOL_VERSION_GUIDANCE}</p>
      {/if}
      <p class="runtime-note"><strong>Admin UI password policy:</strong> {ADMIN_PASSWORD_GUIDANCE} Do not skip the admin password prompt if password-based access is required. <a href="https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PasswordRequirementsforUAG" target="_blank" rel="noreferrer">UAG 2609 password requirements</a>; check your deployed release.</p>
      {#if adminSamlEnabled(app.config)}
        <p class="notice">Administrator SAML is enabled: default <code>admin</code> password authentication is disabled. Use the configured identity provider for Admin UI access.</p>
      {/if}
      <p class="runtime-note">CEIP is passed explicitly from your configuration as <code>-ceipEnabled 'yes'</code> or <code>-ceipEnabled 'no'</code>, removing the CEIP prompt only.</p>
      <p class="runtime-note">Password-protected PFX files prompt interactively in uagdeploy, including when root/admin passwords are supplied. PFX passwords are never collected or exported here.</p>
      {#if app.deploymentMode === 'headless'}
        <p class="runtime-note">Set <code>UAG_ROOT_PASSWORD</code> and <code>UAG_ADMIN_PASSWORD</code> in the deployment process environment. The generated script fails before invoking uagdeploy if either is absent.</p>
      {/if}
      <div class="runtime-switches">
        {#if app.config.platform !== 'openshift'}
          <label>
            <input
              id="f-run_noSSLVerify"
              type="checkbox"
              checked={app.config.values.run_noSSLVerify === true}
              onchange={(e) => (app.config.values.run_noSSLVerify = e.currentTarget.checked)}
            />
            <span><strong>Skip SSL/TLS verification</strong><small>Adds <code>-noSSLVerify</code></small></span>
          </label>
        {/if}
        {#if app.config.platform === 'vsphere'}
          <label>
            <input
              id="f-run_disableVerification"
              type="checkbox"
              checked={app.config.values.run_disableVerification === true}
              onchange={(e) => (app.config.values.run_disableVerification = e.currentTarget.checked)}
            />
            <span><strong>Skip OVA/OVF signature verification</strong><small>Adds <code>-disableVerification</code> (VMware)</small></span>
          </label>
        {/if}
      </div>
      <p class="runtime-note">These switches affect only PowerShell runtime commands. They are never written to deployment INI or settings JSON.</p>
      </fieldset>
    </details>
  {/if}
  {#if app.tab === 'json'}
    <p class="notice">Certificate and metadata file paths are deployment INI inputs, not settings JSON certificate content. IdP URL trust and PEM signing/encryption paths are omitted here; deploy the INI so uagdeploy can read the files and metadata XML.</p>
  {/if}
  {#if olderVersion}
    <div class="artifact-version-warning">
      <strong>Older release selected: UAG {app.config.version}</strong>
      <span>This artifact may not include fixes available in the recommended UAG {latestVersion.id} baseline.</span>
    </div>
  {/if}
  {#if hasSecrets}<div class="warnbox">Secrets are included in plain text. Do not commit or share this output.</div>{/if}
  <div class="artifact-preview" role="tabpanel" id={`${contentId}-preview`} aria-labelledby={`${contentId}-${app.tab}`}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <pre class="code" class:numbered tabindex="0">{#if numbered}<span class="line-numbers" aria-hidden="true" style:--line-digits={String(lineNumbers.length).length}>{#each lineNumbers as line}<span data-line={line}></span>{/each}</span>{/if}<code>{@html html}</code></pre>
    </div>
    <div class="out-foot">
    <label class="row" for="secret-mode">Secrets:
      <select id="secret-mode" class="t" bind:value={app.secretMode}>
        <option value="placeholder">Placeholders (&lt;REDACTED&gt;)</option>
        <option value="omit">Omit entirely</option>
        <option value="include">Include (plain text)</option>
      </select>
    </label>
  </div>
  </div>
</aside>
