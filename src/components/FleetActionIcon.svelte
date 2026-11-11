<script lang="ts">
  let { action }: { action: 'add-group' | 'add-uag' | 'remove' | 'undo' | 'export' | 'edit' } = $props();
</script>

<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  {#if action === 'add-group'}
    <rect x="3" y="3" width="10" height="7" rx="1.5" /><rect x="3" y="14" width="10" height="7" rx="1.5" /><path d="M18 8v8 M14 12h8" />
  {:else if action === 'add-uag'}
    <rect x="2" y="3" width="12" height="18" rx="2" /><path d="M6 7h4 M6 11h4 M18 12v8 M14 16h8" />
  {:else if action === 'remove'}
    <path d="M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7" />
  {:else if action === 'undo'}
    <path d="m9 4-6 6 6 6 M3 10h11a6 6 0 0 1 0 12" />
  {:else if action === 'edit'}
      <path d="M14 3H4v18h16V11 M8 15l1-4L18 2l4 4-9 9-5 1 M16 4l4 4" />
    {:else}
      <path d="M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5" />
  {/if}
</svg>

<style>
  svg { width: 18px; height: 18px; flex: 0 0 auto; }
</style>
