<script lang="ts">
  let { unlocked, blocked }: { unlocked: boolean; blocked: boolean } = $props();
</script>

<aside id="topology-next-help" class="topology-prerequisite" class:warning={blocked && !unlocked} role="status">
  {#if blocked && !unlocked}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 4.5 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.5a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4 M12 17h.01" /></svg>
    <div><strong>Complete a valid Horizon baseline before planning the topology.</strong><p>Resolve the configuration errors and keep Horizon enabled, then continue to fleet topology. The first UAG becomes the shared starting point; nothing is deployed.</p></div>
  {:else if unlocked}
    <p>Save this appliance’s changes and return to the fleet plan.</p>
  {:else}
    <p>Your Horizon baseline is valid. Continue to fleet topology to use its settings as the shared starting point for more appliances. This opens a plan; it does not deploy anything.</p>
  {/if}
</aside>

<style>
  .topology-prerequisite { color: var(--mut); font-size: 13px; line-height: 1.5; }
  p { margin: 0; max-width: 850px; }
  .warning { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--line)); border-left: 4px solid var(--warn); border-radius: 8px; background: color-mix(in srgb, var(--warn) 9%, var(--panel)); color: var(--tx); }
  .warning div { flex: 1; min-width: 0; }
  .warning p { max-width: none; }
  .warning svg { width: 22px; height: 22px; flex: 0 0 auto; color: var(--warn); }
  strong { display: block; margin-bottom: 4px; color: var(--warn); font-size: 15px; line-height: 1.4; }
  @media (max-width: 420px) { .warning { padding: 12px; gap: 9px; } }
</style>
