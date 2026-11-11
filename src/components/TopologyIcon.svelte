<script lang="ts">
  import BrandMark from './BrandMark.svelte';
  let { kind }: { kind: 'uag' | 'server' | 'client' } = $props();
</script>

<span class={'topology-icon topology-icon-' + kind} aria-hidden="true">
  {#if kind === 'uag'}
    <BrandMark />
  {:else}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      {#if kind === 'server'}
        <rect x="4" y="3" width="16" height="7" rx="2" /><rect x="4" y="14" width="16" height="7" rx="2" /><path d="M8 6.5h.01 M8 17.5h.01 M12 6.5h4 M12 17.5h4" />
      {:else}
        <rect x="3" y="3" width="18" height="13" rx="2" /><path d="M12 16v5 M7 21h10" />
      {/if}
    </svg>
  {/if}
</span>

<style>
  .topology-icon { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex: 0 0 auto; }
  svg { width: 22px; height: 22px; }
  .topology-icon-uag { color: var(--templates); }
  .topology-icon-server { color: var(--info); }
  .topology-icon-client { color: var(--teal); }
</style>
