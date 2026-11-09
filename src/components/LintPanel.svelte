<script lang="ts">
  import { app } from '../lib/store.svelte';
  import type { Issue } from '../lib/validate';

  interface Props {
    issues: Issue[];
  }
  let { issues }: Props = $props();

  const order = { error: 0, warn: 1, info: 2 } as const;
  const sorted = $derived([...issues].sort((a, b) => order[a.level] - order[b.level]));
  const icon = { error: '✖', warn: '⚠', info: 'ℹ' } as const;
</script>

<details class="card collapsible-card" open aria-label="Validation and best-practice lint">
  <summary class="card-head">
    <h3>Validation &amp; lint</h3>
    <span class="card-summary-actions">
      <span class="row">
        {#if issues.filter((i) => i.level === 'error').length}<span class="badge error">{issues.filter((i) => i.level === 'error').length} errors</span>{/if}
        {#if issues.filter((i) => i.level === 'warn').length}<span class="badge warn">{issues.filter((i) => i.level === 'warn').length} warnings</span>{/if}
      </span>
      <span class="collapse-indicator" aria-hidden="true"></span>
    </span>
  </summary>
  <div class="lint">
    {#each sorted as i (i.id)}
      <button class={`item ${i.level}`} onclick={() => app.goTo(i.section, i.list ? undefined : i.fieldId)}>
        <span aria-hidden="true">{icon[i.level]}</span><span>{i.message}</span>
      </button>
    {:else}
      <div class="okmsg">✓ No findings. Configuration looks good.</div>
    {/each}
  </div>
</details>
