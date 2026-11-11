<script lang="ts">
  import { modalFocus } from '../lib/modal-focus';
  import FleetActionIcon from './FleetActionIcon.svelte';
  let { kind, label, count = 0, oncancel, onconfirm }: {
    kind: 'member' | 'group'; label: string; count?: number; oncancel: () => void; onconfirm: () => void;
  } = $props();
</script>

<div class="scenario-dialog-backdrop">
  <div class="scenario-dialog" use:modalFocus={oncancel} tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="fleet-remove-title" aria-describedby="fleet-remove-description">
    <h2 id="fleet-remove-title">Remove {kind === 'group' ? 'UAG group' : 'UAG'}?</h2>
    <p class="removal-name">{label}</p>
    <p id="fleet-remove-description">
      {#if kind === 'group'}
        This excludes the group and its {count} active UAG{count === 1 ? '' : 's'} from fleet exports. Its template and appliance configurations are kept; Undo removal restores the group and its appliances.
      {:else}
        This excludes the UAG from fleet exports. Its configuration is kept; Undo removal restores it.
      {/if}
      Nothing is removed from your live infrastructure.
    </p>
    <div>
      <button onclick={oncancel}>Cancel</button>
      <button id="confirm-fleet-removal" class="remove-action" onclick={onconfirm}><FleetActionIcon action="remove" />Remove {kind === 'group' ? 'group' : 'UAG'}</button>
    </div>
  </div>
</div>

<style>
  .removal-name { font-weight: 700; overflow-wrap: anywhere; }
  .remove-action { display: inline-flex; align-items: center; gap: 7px; color: var(--bad); border-color: var(--bad); }
</style>
