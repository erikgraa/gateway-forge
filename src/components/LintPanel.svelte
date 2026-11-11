<script lang="ts">
  import { app } from '../lib/store.svelte';
  import type { Issue } from '../lib/validate';
  import { revealValidation } from './validationNavigation';

  interface Props {
    issues: Issue[];
  }
  let { issues }: Props = $props();

  const order = { error: 0, warn: 1, info: 2 } as const;
  const sorted = $derived([...issues].sort((a, b) => order[a.level] - order[b.level]));
  const icon = { error: '✖', warn: '⚠', info: 'ℹ' } as const;
  let panel: HTMLDetailsElement;
  let heading: HTMLHeadingElement;

  export function reveal() {
    revealValidation(panel, heading);
  }
</script>

<details id="validation-lint" bind:this={panel} class="card collapsible-card" open={issues.some((issue) => issue.level === 'error')} aria-label="Validation and best-practice lint">
  <summary class="card-head">
    <h3 id="validation-lint-heading" bind:this={heading} tabindex="-1">Validation &amp; lint</h3>
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
