<script lang="ts">
  import type { Field, Values } from '../lib/schema';

  interface Props {
    field: Field;
    values: Values;
    error?: string;
    /** DOM id suffix when the same field id appears more than once (list items). */
    uid?: string;
  }
  let { field, values = $bindable(), error, uid }: Props = $props();

  let reveal = $state(false);
  const id = $derived(`f-${uid ?? field.id}`);

  function setNumber(e: Event) {
    const raw = (e.currentTarget as HTMLInputElement).value;
    values[field.id] = raw === '' ? '' : Number(raw);
  }
</script>

{#if field.type === 'bool'}
  <label class="field bool" class:wide={field.wide}>
    <input {id} type="checkbox" checked={values[field.id] === true} onchange={(e) => (values[field.id] = e.currentTarget.checked)} />
    <span>
      {field.label}
      {#if field.since}<span class="chip">UAG ≥ {field.since}</span>{/if}
      {#if field.help}<span class="hint"> - {field.help}</span>{/if}
    </span>
  </label>
{:else}
  <label class="field" class:wide={field.wide} for={id}>
    <span class="lbl">
      {field.label}
      {#if field.required === true}<span class="req" title="Required">*</span>{/if}
      {#if field.since}<span class="chip">UAG ≥ {field.since}</span>{/if}
      {#if field.inferred}<span class="chip" title="Key or semantics require verification against the official source">verify</span>{/if}
    </span>
    {#if field.type === 'select'}
      <select {id} class:bad={!!error} bind:value={values[field.id]}>
        {#each field.options ?? [] as o (o.value)}
          <option value={o.value}>{o.label ?? (o.value === '' ? '(none)' : o.value)}</option>
        {/each}
      </select>
    {:else if field.type === 'number'}
      <input {id} type="number" class:bad={!!error} min={field.min} max={field.max} value={values[field.id]} oninput={setNumber} placeholder={field.placeholder} />
    {:else if field.type === 'secret'}
      <span class="secret-wrap">
        <input {id} type={reveal ? 'text' : 'password'} autocomplete="off" spellcheck="false" class:bad={!!error} bind:value={values[field.id]} placeholder={field.placeholder ?? 'not stored'} />
        <button type="button" class="small" onclick={() => (reveal = !reveal)} aria-label={reveal ? 'Hide secret' : 'Show secret'}>{reveal ? 'Hide' : 'Show'}</button>
      </span>
    {:else if field.type === 'textarea'}
      <textarea {id} rows="3" maxlength={field.maxLength} class:bad={!!error} bind:value={values[field.id]} placeholder={field.placeholder}></textarea>
    {:else}
      <input {id} type="text" maxlength={field.maxLength} autocomplete="off" spellcheck="false" class:bad={!!error} bind:value={values[field.id]} placeholder={field.placeholder} />
    {/if}
    {#if error}<span class="err">{error}</span>{:else if field.help}<span class="hint">{field.help}</span>{/if}
  </label>
{/if}
