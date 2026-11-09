<script lang="ts">
  import type { Field, Values } from '../lib/schema';
  import type { Issue } from '../lib/validate';
  import { HOST_ENTRY_MAX, hostEntryValues, removeHostEntry } from '../lib/host-entries';

  interface Props { fields: Field[]; values: Values; issues: Issue[]; }
  let { fields, values = $bindable(), issues }: Props = $props();
  let requested = $state(1);
  const count = $derived(Math.min(HOST_ENTRY_MAX, Math.max(requested,
    fields.reduce((n, f, i) => values[f.id] ? i + 1 : n, 0), 1)));

  function remove(index: number) {
    removeHostEntry(values, fields, index);
    requested = Math.max(1, count - 1);
  }
</script>

<fieldset class="field wide row-list-field">
  <legend class="lbl">
    Host entries ({hostEntryValues(values, fields).length} of {HOST_ENTRY_MAX})
    <button type="button" class="small primary" disabled={count >= HOST_ENTRY_MAX}
      onclick={() => requested = count + 1} aria-label="Add host entry">+ Add host entry</button>
  </legend>
  <div class="row-list">
    {#each fields.slice(0, count) as field, index (field.id)}
      {@const error = issues.find((i) => i.fieldId === field.id && i.level === 'error' && !i.list)?.message}
      <div class="row-list-item">
        <label class="row-list-input" for={`f-${field.id}`}>
          <span class="lbl">Host entry {index + 1}</span>
          <input id={`f-${field.id}`} type="text" bind:value={values[field.id]}
            placeholder={field.placeholder} spellcheck="false" autocomplete="off"
            class:bad={!!error} aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? `f-${field.id}-error` : undefined} />
          {#if error}<span class="err" id={`f-${field.id}-error`}>{error}</span>{/if}
        </label>
        <button type="button" class="small danger" onclick={() => remove(index)}
          aria-label={`Remove host entry ${index + 1}`}>Remove</button>
      </div>
    {/each}
  </div>
  <span class="hint">One IP address, hostname and optional aliases per row. Maximum six entries.</span>
</fieldset>
