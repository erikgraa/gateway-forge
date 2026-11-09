<script lang="ts">
  import { fieldHelp, type Field } from '../lib/schema';
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
  <button type="button" class="field-details-trigger" aria-label={`More information about ${field.label}`} aria-describedby={tooltipId} onpointerenter={positionTooltip} onfocus={positionTooltip} onclick={positionTooltip}>ⓘ</button>
  <span
    class="field-details-tooltip"
    id={tooltipId}
    role="tooltip"
  >
    <strong>{field.label}</strong>
    <p>{help ?? 'Review this setting before deployment; unsupported or unverified values are not inferred.'}</p>
    <dl>
      <div><dt>INI key</dt><dd><code>{field.ini === false ? 'Not exported' : field.key}</code></dd></div>
      <div><dt>JSON key</dt><dd><code>{jsonKey}</code></dd></div>
      {#if field.since}<div><dt>Available</dt><dd>UAG {field.since} and later</dd></div>{/if}
      {#if field.until}<div><dt>Removed</dt><dd>After UAG {field.until}</dd></div>{/if}
      {#if field.platforms}<div><dt>Platforms</dt><dd>{field.platforms.join(', ')}</dd></div>{/if}
      {#if field.inferred}<div><dt>Status</dt><dd>Verify against appliance export or vendor documentation before use.</dd></div>{/if}
    </dl>
  </span>
</span>
