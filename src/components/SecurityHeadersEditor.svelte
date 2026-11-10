<script lang="ts">
  import { untrack } from 'svelte';
  import { fieldHelp, type Field, type Values } from '../lib/schema';
  import type { Platform } from '../lib/versions';
  import { parseSecurityHeaderRows, securityHeaderRowError, serializeSecurityHeaderRows, type SecurityHeaderRow } from '../lib/security-headers';
  import FieldDetails from './FieldDetails.svelte';
  import FieldInput from './FieldInput.svelte';

  interface Props {
    field: Field;
    values: Values;
    platform: Platform;
    error?: string;
  }
  let { field, values = $bindable(), platform, error }: Props = $props();
  let emitted = $state(untrack(() => String(values[field.id] ?? '')));
  let rows = $state<SecurityHeaderRow[] | null>(untrack(() => parseSecurityHeaderRows(emitted)));
  let advanced = $state(false);
  const id = $derived(`f-${field.id}`);
  const help = $derived(fieldHelp(field, platform));

  $effect(() => {
    const external = String(values[field.id] ?? '');
    if (external !== emitted) {
      rows = parseSecurityHeaderRows(external);
      emitted = external;
    }
  });

  function commit() {
    emitted = serializeSecurityHeaderRows(rows ?? []);
    values[field.id] = emitted;
  }

  function update(index: number, part: keyof SecurityHeaderRow, value: string) {
    rows![index][part] = value;
    commit();
  }

  function add() {
    rows!.push({ name: '', value: '' });
    commit();
  }

  function remove(index: number) {
    rows!.splice(index, 1);
    commit();
  }
</script>

{#if advanced || rows === null}
  <div class="field wide">
    <FieldInput {field} {platform} bind:values {error} />
    {#if rows === null}
      <p class="hint">This input is kept unchanged. Correct the JSON object to use header rows.</p>
    {/if}
    <button type="button" class="small" disabled={rows === null} onclick={() => (advanced = false)}>Use header rows</button>
  </div>
{:else}
  <fieldset class="field row-list-field wide" aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}>
    <legend class="lbl">
      {field.label}
      <FieldDetails {field} {platform} />
      {#if field.since}<span class="chip">UAG ≥ {field.since}</span>{/if}
      <button type="button" class="small primary" onclick={add}>+ Add header</button>
    </legend>
    <div class="row-list" {id} tabindex="-1">
      {#each rows as row, index (index)}
        {@const rowError = securityHeaderRowError(rows, index)}
        <div class="row-list-item header-row">
          <div class="header-fields">
            <label class="row-list-input">
              <span class="lbl">Header name <span class="req" title="Required">*</span></span>
              <input id={`${id}-${index}-name`} type="text" autocomplete="off" spellcheck="false" required
                value={row.name} aria-label={`Header ${index + 1} name`} class:bad={!!rowError}
                aria-invalid={rowError ? 'true' : undefined}
                aria-describedby={rowError ? `${id}-${index}-error` : `${id}-help`}
                oninput={(event) => update(index, 'name', event.currentTarget.value)} />
            </label>
            <span class="equals" aria-hidden="true">=</span>
            <label class="row-list-input">
              <span class="lbl">Value <span class="req" title="Required">*</span></span>
              <input id={`${id}-${index}-value`} type="text" autocomplete="off" spellcheck="false" required
                value={row.value} aria-label={`Header ${index + 1} value`} class:bad={!!rowError}
                aria-invalid={rowError ? 'true' : undefined}
                aria-describedby={rowError ? `${id}-${index}-error` : `${id}-help`}
                oninput={(event) => update(index, 'value', event.currentTarget.value)} />
            </label>
            {#if rowError}<span class="err" id={`${id}-${index}-error`}>{rowError}</span>{/if}
          </div>
          <button type="button" class="small danger" aria-label={`Remove header ${index + 1}`} onclick={() => remove(index)}>Remove</button>
        </div>
      {:else}
        <p class="help">No custom headers configured. Appliance defaults apply.</p>
      {/each}
    </div>
    {#if error}<span class="err" id={`${id}-error`}>{error}</span>{/if}
    <span class="hint" id={`${id}-help`}>{help}</span>
    <button type="button" class="small" onclick={() => (advanced = true)}>Edit raw JSON / INI value</button>
  </fieldset>
{/if}

<style>
  .header-row { align-items: flex-start; }
  .header-fields { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1.4fr); flex: 1; min-width: 0; gap: 7px; }
  .equals { align-self: center; padding-top: 20px; }
  .header-fields > .err { grid-column: 1 / -1; }
  .header-row > button { margin-top: 24px; }
  @media (max-width: 640px) {
    .header-fields { grid-template-columns: minmax(0, 1fr); }
    .equals { display: none; }
    .header-row { flex-wrap: wrap; }
    .header-row > button { margin-top: 0; }
  }
</style>
