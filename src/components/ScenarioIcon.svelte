<script lang="ts">
  import type { Scenario } from '../lib/scenario-workspaces';
  let { scenario }: { scenario: Scenario } = $props();
</script>

<span class="scenario-icon" data-scenario-icon={scenario} aria-hidden="true">
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" focusable="false">
    {#if scenario === 'single'}
      <rect x="5" y="3" width="10" height="14" rx="2" /><path d="M8 7h4 M8 11h4" />
    {:else if scenario === 'horizon'}
      <rect x="2" y="7" width="6" height="10" rx="1.5" /><rect x="12" y="7" width="6" height="10" rx="1.5" /><path d="M5 7V3h10v4" />
    {:else}
      <path d="M3 6h14m-4-3 4 3-4 3 M17 14H3m4-3-4 3 4 3" />
    {/if}
  </svg>
</span>

<style>
  .scenario-icon { display: inline-flex; align-items: center; justify-content: center; width: var(--scenario-icon-size, 22px); height: var(--scenario-icon-size, 22px); flex: 0 0 auto; color: var(--scenario-tone, currentColor); }
  svg { width: 100%; height: 100%; }
</style>
