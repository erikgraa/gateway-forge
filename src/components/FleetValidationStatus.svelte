<script lang="ts">
  let { count, id, empty = false }: { count: number; id?: string; empty?: boolean } = $props();
</script>

<span {id} class="fleet-check-status" class:blocked={count > 0} class:empty title={count === 0 && !empty ? 'No blocking configuration errors. Deployment, certificates and live failover still require verification.' : undefined} aria-live="polite">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {#if count > 0}
      <path d="M12 3 2 21h20L12 3Z M12 9v5 M12 18h.01" />
    {:else if empty}
          <circle cx="12" cy="12" r="9" /><path d="M12 8v8 M8 12h8" />
        {:else}
          <rect x="3" y="3" width="18" height="18" rx="3" /><path d="m7 12 3 3 7-7" />
    {/if}
  </svg>
  {count > 0 ? count + ' blocking configuration error' + (count === 1 ? '' : 's') : empty ? 'Add a UAG to validate' : 'Configuration ready'}
</span>

<style>
  .fleet-check-status { display: inline-flex; align-items: center; gap: 6px; color: var(--ok); font-size: 12px; font-weight: 700; }
  .blocked { color: var(--bad); }
  .empty { color: var(--mut); }
  svg { width: 18px; height: 18px; flex: 0 0 auto; }
</style>
