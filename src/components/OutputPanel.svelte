<script lang="ts">
  import { app, type OutputTab } from '../lib/store.svelte';
  import { render, download, copy, highlight } from '../lib/render';

  const tabs: { id: OutputTab; label: string }[] = [
    { id: 'ini', label: 'INI' },
    { id: 'json', label: 'JSON' },
    { id: 'ps', label: 'PowerShell' },
    { id: 'docs', label: 'Docs' }
  ];
  const hints: Record<OutputTab, string> = {
    ini: 'uagdeploy.ps1 -iniFile (deploy path)',
    json: 'Admin UI import / PUT /rest/v1/config/settings',
    ps: 'Writes the INI and runs the deploy script',
    docs: 'Markdown summary for runbooks'
  };

  const rendered = $derived(render(app.config, app.tab, app.secretMode));
  const html = $derived(highlight(rendered.text, app.tab));
  const hasSecrets = $derived(app.secretMode === 'include');

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
    <span class="file-type">{app.tab === 'ps' ? 'PS1' : app.tab.toUpperCase()}</span>
    <span><strong>{rendered.filename}</strong><small>{hints[app.tab]}</small></span>
  </div>
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
