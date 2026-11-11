<script lang="ts">
  let { id, issues }: { id: string; issues: { id: string; message: string }[] } = $props();
</script>

{#if issues.length}
  <ul {id} class="fleet-field-issues">
    {#each issues as issue (issue.id)}<li>{issue.message}</li>{/each}
  </ul>
{/if}

<style>
  .fleet-field-issues { margin: 0 0 6px; padding: 0; list-style: none; font-size: 12px; color: var(--bad); overflow-wrap: anywhere; }
  li + li { margin-top: 4px; }
</style>
