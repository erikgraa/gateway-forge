<script lang="ts">
  import type { Platform } from '../lib/versions';
  import { olderDeploymentWarning } from '../lib/versions';
  import { vmReplacementWarning } from '../lib/deployment-safety';

  let { platform, version, latestVersionId, compact = false }: {
    platform: Platform; version: string; latestVersionId: string; compact?: boolean;
  } = $props();
  const older = $derived(olderDeploymentWarning(version, latestVersionId));
</script>

<details class="deployment-risk" class:compact aria-label="Destructive deployment risks">
  <summary onclick={(event) => event.stopPropagation()}>
    <span class="risk-symbol" aria-hidden="true">!</span>
    <strong>{platform === 'azure' ? 'Deletion risk: VM, OS disk, NICs' : 'Deletes/recreates same-name VM'}</strong>
    {#if older}<span class="risk-release">Older release</span>{/if}
    <span class="risk-disclosure">Details</span>
  </summary>
  <div class="risk-details">
    <p>{vmReplacementWarning(platform)}</p>
    <p>Check the target and deployment VM name, back up configuration and plan downtime. Gateway Forge generates files only; it does not inspect inventory.</p>
    {#if older}<p>{older}</p>{/if}
  </div>
</details>

<style>
  .deployment-risk { flex: 0 0 auto; border-bottom: 1px solid color-mix(in srgb, var(--warn) 35%, var(--line)); background: color-mix(in srgb, var(--warn) 9%, var(--panel)); }
  summary { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px 13px; cursor: pointer; color: var(--warn); list-style: none; font-size: 11px; }
  summary::-webkit-details-marker { display: none; }
  summary:focus-visible { outline: 2px solid var(--acc-strong); outline-offset: -3px; }
  .risk-symbol { display: grid; place-items: center; width: 19px; height: 19px; border: 1px solid currentColor; border-radius: 50%; font-weight: 800; }
  .risk-disclosure { margin-left: auto; font-size: 10px; text-decoration: underline; }
  .risk-disclosure::after { content: ' ▾'; }
  details[open] .risk-disclosure::after { content: ' ▴'; }
  .risk-release { border: 1px solid currentColor; border-radius: 4px; font-size: 9px; padding: 1px 4px; }
  .risk-details { color: var(--tx); font-size: 12px; padding: 0 13px 10px; }
  p { margin: 7px 0; line-height: 1.55; }
  .compact { border: 1px solid var(--line); border-radius: 5px; max-width: min(350px, 85vw); }
</style>
