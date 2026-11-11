<script lang="ts">
  import { fieldHelp, fieldLabel, type Field } from '../lib/schema';
  import type { Platform } from '../lib/versions';

  let {
    field,
    platform,
    uid = field.id
  }: {
    field: Field;
    platform: Platform;
    uid?: string;
  } = $props();

  const help = $derived(fieldHelp(field, platform));
  const label = $derived(fieldLabel(field, platform));
  const tooltipId = $derived(`field-details-${uid.replace(/[^a-zA-Z0-9_-]/g, '-')}`);
  const jsonKey = $derived(field.json === false ? 'Not exported' : field.json ?? field.key);
  function positionTooltip(event: Event) {
    const trigger = event.currentTarget as HTMLButtonElement;
    const tooltip = trigger.nextElementSibling as HTMLElement;
    const bounds = trigger.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    const left = Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12));
    const spaceBelow = window.innerHeight - bounds.bottom - 20;
    const spaceAbove = bounds.top - 20;
    const naturalHeight = tooltip.scrollHeight + 2;
    const above = spaceBelow < Math.min(naturalHeight, 240) && spaceAbove > spaceBelow;
    const available = Math.max(80, above ? spaceAbove : spaceBelow);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = above ? 'auto' : `${bounds.bottom + 8}px`;
    tooltip.style.bottom = above ? `${window.innerHeight - bounds.top + 8}px` : 'auto';
    tooltip.style.maxHeight = `${available}px`;
    tooltip.classList.toggle('above', above);
  }
</script>

<span class="field-details">
  <button type="button" class="field-details-trigger" aria-label={`More information about ${label}`} aria-describedby={tooltipId} onpointerenter={positionTooltip} onfocus={positionTooltip} onclick={positionTooltip}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5" /><path d="M10 9v5" /><circle cx="10" cy="6" r=".8" fill="currentColor" stroke="none" /></svg></button>
  <span
    class="field-details-tooltip"
    id={tooltipId}
    role="tooltip"
  >
    <strong>{label}</strong>
    <p>{help ?? 'Review this setting before deployment; unsupported or unverified values are not inferred.'}</p>
    <dl>
      <div class="field-key-mapping"><dt>INI key</dt><dd><code>{field.ini === false ? 'Not exported' : field.key}</code></dd></div>
      <div class="field-key-mapping"><dt>JSON key</dt><dd><code>{jsonKey}</code></dd></div>
      {#if field.since}<div><dt>Available</dt><dd>UAG {field.since} and later</dd></div>{/if}
      {#if field.until}<div><dt>Removed</dt><dd>After UAG {field.until}</dd></div>{/if}
      {#if field.platforms}<div><dt>Platforms</dt><dd>{field.platforms.join(', ')}</dd></div>{/if}
      {#if field.inferred}<div><dt>Status</dt><dd>Verify against appliance export or vendor documentation before use.</dd></div>{/if}
    </dl>
  </span>
</span>

<style>
  .field-details > .field-details-trigger { display: grid; place-items: center; width: 24px; height: 24px; min-width: 24px; min-height: 24px; flex-shrink: 0; padding: 0; border: 0; border-radius: 50%; background: transparent; box-sizing: border-box; }
  .field-details-trigger svg { width: 20px; height: 20px; }
  .field-details > .field-details-trigger:hover { background: var(--acc-soft); }
  .field-details-tooltip dl { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; }
  .field-details-tooltip dl > .field-key-mapping { display: block; min-width: 0; }
  .field-key-mapping dt { margin-bottom: 4px; }
  .field-details-tooltip dl > div:not(.field-key-mapping) { grid-column: 1 / -1; }
</style>
