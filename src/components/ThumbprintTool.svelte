<script lang="ts">
  import { app } from '../lib/store.svelte';
  import {
    thumbprints,
    uagThumbprint,
    powershellThumbprintCommand,
    type HashAlg,
    type ThumbprintSet
  } from '../lib/thumbprint';
  import { copy } from '../lib/render';

  type Mode = 'paste' | 'ps';
  let mode = $state<Mode>('paste');
  let pem = $state('');
  let alg = $state<HashAlg>('SHA-256');
  let set = $state<ThumbprintSet | null>(null);
  let err = $state('');

  const outer = $derived(app.config.values.cascade_role === 'outer');
  const thumbKey = $derived(outer ? 'cascade_innerThumbprints' : 'proxyDestinationUrlThumbprints');
  const hostPort = $derived(String((outer ? app.config.values.cascade_innerUrl : app.config.values.proxyDestinationUrl) || 'cs01.corp.local'));
  const psCmd = $derived(powershellThumbprintCommand(hostPort));

  async function compute(input: string | Uint8Array) {
    err = '';
    try {
      set = await thumbprints(input);
    } catch (e) {
      set = null;
      err = (e as Error).message;
    }
  }

  async function onFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!f) return;
    const buf = new Uint8Array(await f.arrayBuffer());
    await compute(buf);
  }

  function apply(value: string) {
    const existing = String(app.config.values[thumbKey] || '').trim();
    app.config.values[thumbKey] = existing && existing !== value ? `${existing},${value}` : value;
    app.say(outer ? 'Thumbprint added to the inner UAG (cascade)' : 'Thumbprint added to the Horizon edge service');
  }

</script>

<section class="card">
  <div class="card-head"><h3>Thumbprint tools</h3></div>
  <p class="help">
    A static web page cannot read a remote server's TLS certificate. Paste the certificate or run the PowerShell one-liner. Everything stays on your machine.
  </p>
  <div class="tabs2" role="tablist">
    <button role="tab" aria-selected={mode === 'paste'} class:on={mode === 'paste'} onclick={() => (mode = 'paste')}>Paste certificate</button>
    <button role="tab" aria-selected={mode === 'ps'} class:on={mode === 'ps'} onclick={() => (mode = 'ps')}>PowerShell</button>
  </div>

  {#if mode === 'paste'}
    <textarea rows="5" class="mono" bind:value={pem} oninput={() => pem.trim() && compute(pem)} placeholder="-----BEGIN CERTIFICATE-----&#10;…&#10;-----END CERTIFICATE-----" aria-label="Certificate PEM"></textarea>
    <div class="row" style="margin-top:8px">
      <input type="file" accept=".pem,.crt,.cer,.der" onchange={onFile} aria-label="Certificate file (PEM or DER)" />
    </div>
  {:else if mode === 'ps'}
    <p class="help">Run on any Windows/PowerShell host that can reach <code>{hostPort}</code>, then paste the printed value into the Connection Server thumbprint field.</p>
    <div class="result">{psCmd}</div>
    <div class="row" style="margin-top:8px"><button class="small" onclick={async () => app.say((await copy(psCmd)) ? 'Copied' : 'Copy failed')}>Copy one-liner</button></div>
  {/if}

  {#if err}<p class="err" style="color:var(--bad)">{err}</p>{/if}
  {#if set}
    <div style="margin-top:12px">
      {#each ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as a (a)}
        {#if set[a as HashAlg]}
          <div class="srow"><b>{a}</b><div class="result">{set[a as HashAlg]}</div></div>
        {/if}
      {/each}
      <div class="row">
        <label class="row">Use <select class="t" bind:value={alg}>
            <option>SHA-256</option><option>SHA-384</option><option>SHA-512</option><option>SHA-1</option>
          </select></label>
        <button class="small primary" onclick={() => set && apply(uagThumbprint(set, alg))}>{outer ? 'Add to inner UAG thumbprints' : 'Add to Horizon thumbprints'}</button>
      </div>
    </div>
  {/if}
</section>
