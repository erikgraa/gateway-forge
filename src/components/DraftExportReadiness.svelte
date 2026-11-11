<script lang="ts">
  import type { workspaceExportReadiness } from '../lib/workspace-readiness';

  let { status }: { status: ReturnType<typeof workspaceExportReadiness> } = $props();
</script>

<span class="draft-readiness" class:blocked={!status.ready} aria-live="polite" title={(status.format === 'Fleet ZIP' ? 'Checked Horizon fleet export readiness only. ' : 'Checked configuration export readiness only. ') + 'Deployment, network connectivity, security and live failover remain unverified.'}>
  <span class="readiness-status">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {#if status.ready}
        <rect x="3" y="3" width="18" height="18" rx="3" /><path d="m7 12 3 3 7-7" />
      {:else}
        <path d="M12 3 2 21h20L12 3Z M12 9v5 M12 18h.01" />
      {/if}
    </svg>
    {status.ready ? 'Ready to export' : 'Needs fixes'}
  </span>
  {#if !status.ready || status.warnings > 0}
    <span class="readiness-counts">{#if !status.ready}{status.blocking} blocker{status.blocking === 1 ? '' : 's'}<span aria-hidden="true">{' · '}</span>{/if}<span class:has-warnings={status.warnings > 0}>{status.warnings} warning{status.warnings === 1 ? '' : 's'}</span></span>
  {/if}
  {#if status.planningRequired}
    <span class="readiness-scope">Topology not planned</span>
  {/if}
</span>

<style>
  .draft-readiness { display: grid; gap: 4px; flex: 0 1 auto; min-width: 0; max-width: 100%; font-size: 12px; color: var(--ok); }
  .blocked { color: var(--bad); }
  .readiness-status { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; }
  svg { width: 16px; height: 16px; flex: 0 0 auto; }
  .readiness-counts, .readiness-scope { color: var(--mut); overflow-wrap: anywhere; }
  .has-warnings { color: var(--warn); }
</style>
