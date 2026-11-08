<script lang="ts">
  import { fieldHelp, type Field, type Values } from '../lib/schema';
  import type { Platform } from '../lib/versions';
  import type { Issue } from '../lib/validate';
  import { parseListValue, serializeListValue } from '../lib/listValue';

  interface Props {
    field: Field;
    values: Values;
    platform: Platform;
    issues: Issue[];
  }
  let { field, values = $bindable(), platform, issues }: Props = $props();

  const definition = $derived(field.rows!);
  const help = $derived(fieldHelp(field, platform));
  let rows = $state<string[]>([]);
  let emitted = $state('');

  $effect(() => {
    const external = String(values[field.id] ?? '');
    if (external !== emitted) {
      rows = parseListValue(external);
      emitted = external;
    }
  });

  function commit() {
    emitted = serializeListValue(rows);
    values[field.id] = emitted;
  }

  function update(index: number, event: Event) {
    const pasted = parseListValue((event.currentTarget as HTMLInputElement).value);
    if (pasted.length > 1) rows.splice(index, 1, ...pasted);
    else rows[index] = pasted[0] ?? '';
    commit();
  }

  function add() {
    rows.push('');
  }

  function remove(index: number) {
    rows.splice(index, 1);
    commit();
  }

  function rowError(index: number): string | undefined {
    return issues.find((issue) =>
      issue.fieldId === field.id &&
      issue.rowIndex === index &&
      !issue.list &&
      issue.level === 'error'
    )?.message.replace(/^[^:]+ \d+: /, '');
  }

  const fieldError = $derived(issues.find((issue) =>
    issue.fieldId === field.id &&
    issue.rowIndex === undefined &&
    !issue.list &&
    issue.level === 'error'
  )?.message);
</script>

<fieldset class="field row-list-field" class:wide={field.wide}>
  <legend class="lbl">
    {field.label}
    {#if field.required === true}<span class="req" title="Required">*</span>{/if}
    <button type="button" class="small primary" onclick={add} aria-label={`Add ${definition.itemLabel.toLowerCase()}`}>
      + Add {definition.itemLabel.toLowerCase()}
    </button>
  </legend>
  <div class="row-list" id={`f-${field.id}`} tabindex="-1">
    {#each rows as row, index (index)}
      <div class="row-list-item">
        <label class="row-list-input">
          <span class="sr-only">{definition.itemLabel} {index + 1}</span>
          <input
            id={`f-${field.id}-${index}`}
            type="text"
            autocomplete="off"
            spellcheck="false"
            value={row}
            class:bad={!!rowError(index)}
            placeholder={field.placeholder}
            aria-label={`${definition.itemLabel} ${index + 1}`}
            aria-invalid={rowError(index) ? 'true' : undefined}
            aria-describedby={rowError(index) ? `f-${field.id}-${index}-error` : undefined}
            oninput={(event) => update(index, event)}
          />
          {#if rowError(index)}
            <span class="err" id={`f-${field.id}-${index}-error`}>{rowError(index)}</span>
          {/if}
        </label>
        <button
          type="button"
          class="small danger"
          onclick={() => remove(index)}
          aria-label={`Remove ${definition.itemLabel.toLowerCase()} ${index + 1}`}
        >Remove</button>
      </div>
    {:else}
      <p class="help">No {definition.itemLabel.toLowerCase()}s configured.</p>
    {/each}
  </div>
  {#if fieldError}<span class="err">{fieldError}</span>{:else if help}<span class="hint">{help}</span>{/if}
</fieldset>
