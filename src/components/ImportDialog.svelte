<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { importText, type ImportResult } from '../lib/importer';

  let text = $state('');
  let result = $state<ImportResult | null>(null);
  let fileName = $state('');

  function parse() {
    const r = importText(text);
    if (!r.versionDetected) r.config.version = app.config.version;
    if (r.config.platform === 'vsphere' && !r.versionDetected) r.config.platform = app.config.platform;
    result = r;
  }

  async function onFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!f) return;
    fileName = f.name;
    text = await f.text();
    parse();
  }

  function apply() {
    if (!result) return;
    app.config = result.config;
    app.showImport = false;
    app.say(`Imported ${result.mapped} setting${result.mapped === 1 ? '' : 's'}`);
  }

  function close() {
    app.showImport = false;
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && close()}>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Import configuration">
    <h2>Import existing INI or settings JSON</h2>
    <p class="help">Paste content or choose a file. Parsing happens in your browser; nothing is uploaded. Masked secrets (<code>*****</code>, <code>&lt;REDACTED&gt;</code>) are ignored.</p>
    <div class="row" style="margin-bottom:8px">
      <input type="file" accept=".ini,.json,.txt,text/plain,application/json" onchange={onFile} aria-label="Choose INI or JSON file" />
      {#if fileName}<span class="chip">{fileName}</span>{/if}
    </div>
    <textarea rows="10" class="mono" bind:value={text} placeholder="Paste uagdeploy INI or settings JSON here" aria-label="Configuration text"></textarea>
    <div class="row" style="margin:10px 0">
      <button class="primary" onclick={parse} disabled={!text.trim()}>Parse</button>
      <button onclick={close}>Cancel</button>
    </div>
    {#if result}
      <div class="card" style="margin:0">
        <div class="card-head">
          <h3>Preview ({result.format.toUpperCase()})</h3>
          <button class="primary small" onclick={apply} disabled={result.mapped === 0}>Replace current config</button>
        </div>
        <p>
          {result.mapped} setting{result.mapped === 1 ? '' : 's'} recognised · UAG {result.config.version}{result.versionDetected ? ' (detected)' : ' (kept)'} · {result.config.platform}
        </p>
        {#if result.warnings.length}
          <p class="help"><strong>Warnings</strong></p>
          <ul>{#each result.warnings as w (w)}<li>{w}</li>{/each}</ul>
        {/if}
        {#if result.unmapped.length}
          <p class="help"><strong>{result.unmapped.length} unrecognised entr{result.unmapped.length === 1 ? 'y' : 'ies'}</strong> (kept out of the output - unsupported keys are never guessed or emitted)</p>
          <ul class="mono" style="font-size:12px;max-height:140px;overflow:auto">
            {#each result.unmapped as u, i (i)}<li>{u.where} {u.key}{u.value !== undefined ? `=${u.value}` : ''}</li>{/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
</div>
