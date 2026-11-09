<script lang="ts">
  import { app, type OutputTab } from '../lib/store.svelte';
  import { render, download, copy, highlight } from '../lib/render';
  import { VERSIONS } from '../lib/versions';
  import { MISSING_PASSWORD_WARNING } from '../lib/powershell';

  const tabs = $derived.by((): { id: OutputTab; label: string }[] => [
    { id: 'ini', label: 'INI' },
    { id: 'json', label: 'JSON' },
    { id: 'ps', label: 'PowerShell' },
    ...(app.config.platform === 'openshift' ? [{ id: 'manifest' as const, label: app.config.values.ocp_volumeSourceMode === 'console' ? 'Prep' : 'YAML' }] : []),
    { id: 'docs', label: 'Docs' }
  ]);
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
  const hasSecrets = $derived(app.secretMode === 'include');
  const latestVersion = VERSIONS.find((v) => v.latest)!;
  const olderVersion = $derived(app.config.version !== latestVersion.id);

  async function doCopy() {
    app.say((await copy(rendered.text)) ? 'Copied to clipboard' : 'Copy failed - select the text manually');
  }
</script>

<aside class="out" aria-label="Generated output">
  <div class="output-head">
    <div><span class="live-indicator"><i></i> Live artifact</span><h2>Configuration preview</h2></div>
    <span class="artifact-status">Auto-generated</span>
  </div>
  <div class="output-toolbar">
    <div class="tabs" role="tablist" aria-label="Artifact format">
      {#each tabs as t (t.id)}
        <button role="tab" aria-selected={app.tab === t.id} class:on={app.tab === t.id} onclick={() => (app.tab = t.id)}>{t.label}</button>
      {/each}
    </div>
    <div class="output-actions">
      <button class="small ghost" onclick={doCopy}>Copy</button>
      <button class="small" onclick={() => download(rendered)} aria-label={`Download ${app.tab.toUpperCase()} artifact`}>Download</button>
    </div>
  </div>
  <div class="output-file">
    <span class="file-type">{app.tab === 'ps' ? 'PS1' : app.tab === 'manifest' ? (rendered.mime === 'text/markdown' ? 'RUNBOOK' : 'YAML') : app.tab.toUpperCase()}</span>
    <span><strong>{rendered.filename}</strong><small>{hints[app.tab]}</small></span>
  </div>
  {#if app.tab === 'ps'}
    <fieldset class="runtime-controls">
      <legend>Run-time options (uagdeploy.ps1)</legend>
      <div class="deployment-mode">
        <span class="runtime-label" id="deployment-mode-label">Deployment mode</span>
        <div class="mode-selector" role="radiogroup" aria-labelledby="deployment-mode-label">
          <label class:active={app.deploymentMode === 'interactive'}>
            <input type="radio" name="deployment-mode" value="interactive" bind:group={app.deploymentMode} />
            <span><strong>Interactive</strong><small>Prompt for passwords</small></span>
          </label>
          <label class:active={app.deploymentMode === 'headless'} class:disabled={app.config.platform === 'nutanix'}>
            <input type="radio" name="deployment-mode" value="headless" bind:group={app.deploymentMode} disabled={app.config.platform === 'nutanix'} />
            <span><strong>Headless</strong><small>Use runtime environment</small></span>
          </label>
        </div>
      </div>
      <p class="notice">{MISSING_PASSWORD_WARNING}</p>
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
            <span><strong>Skip OVA/OVF signature verification</strong><small>Adds <code>-disableVerification</code> (vSphere)</small></span>
          </label>
        {/if}
      </div>
      <p class="runtime-note">These switches affect only PowerShell runtime commands. They are never written to deployment INI or settings JSON.</p>
    </fieldset>
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
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <pre class="code" tabindex="0">{@html html}</pre>
  <div class="out-foot">
    <label class="row" for="secret-mode">Secrets:
      <select id="secret-mode" class="t" bind:value={app.secretMode}>
        <option value="placeholder">Placeholders (&lt;REDACTED&gt;)</option>
        <option value="omit">Omit entirely</option>
        <option value="include">Include (plain text)</option>
      </select>
    </label>
  </div>
</aside>
