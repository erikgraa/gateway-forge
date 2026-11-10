<script lang="ts">
  import { LISTS } from '../lib/schema';
  import type { Issue } from '../lib/validate';
  import ListEditor from './ListEditor.svelte';
  let { issues }: { issues: Issue[] } = $props();
  const profiles = LISTS.filter((list) => list.id === 'jwt' || list.id === 'jwtIssuers');
</script>

<details class="card collapsible-card jwt-settings-card" open>
  <summary class="card-head"><h3>JWT settings</h3><span class="collapse-indicator" aria-hidden="true"></span></summary>
  <p class="help">Configure consumer trust and producer signing profiles here. They remain separate vendor configurations; adding a profile does not enable JWT for an edge service.</p>
  {#each profiles as list (list.id)}<ListEditor {list} {issues} />{/each}
</details>

<style>
  .jwt-settings-card :global(> details.card) { margin: 0; border: 0; border-radius: 0; box-shadow: none; }
  .jwt-settings-card :global(> details.card + details.card) { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); }
</style>
