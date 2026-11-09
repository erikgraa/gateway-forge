<script lang="ts">
  import { displayFieldLabel, fieldHelp, type Field, type Values } from '../lib/schema';
  import type { Platform } from '../lib/versions';
  import { certificateMode, selectCertificateMode } from '../lib/certificate-input';
  import FieldDetails from './FieldDetails.svelte';

  interface Props {
    field: Field;
    values: Values;
    platform: Platform;
    error?: string;
    /** DOM id suffix when the same field id appears more than once (list items). */
    uid?: string;
  }
  let { field, values = $bindable(), platform, error, uid }: Props = $props();

  let reveal = $state(false);
  const id = $derived(`f-${uid ?? field.id}`);
  const help = $derived(fieldHelp(field, platform));
  const required = $derived(typeof field.required === 'function' ? field.required(values) : field.required === true);
  const label = $derived(displayFieldLabel(field, values));

  function setNumber(e: Event) {
    const raw = (e.currentTarget as HTMLInputElement).value;
    values[field.id] = raw === '' ? '' : Number(raw);
  }
</script>

{#if field.type === 'bool'}
  <label class="field bool" class:wide={field.wide}>
    <input {id} type="checkbox" checked={values[field.id] === true} onchange={(e) => (values[field.id] = e.currentTarget.checked)} />
    <span>
      {label}
      <FieldDetails {field} {platform} {uid} />
      {#if field.since}<span class="chip">UAG ≥ {field.since}</span>{/if}
      {#if help}<span class="hint"> - {help}</span>{/if}
    </span>
  </label>
{:else}
  <label class="field" class:wide={field.wide} for={id}>
    <span class="lbl">
      {label}
      <FieldDetails {field} {platform} {uid} />
      {#if required}<span class="req" title="Required">*</span>{/if}
      {#if field.since}<span class="chip">UAG ≥ {field.since}</span>{/if}
      {#if field.inferred}<span class="chip" title="Key or semantics require verification against the official source">verify</span>{/if}
    </span>
    {#if field.certificateInput}
      <select {id} class:bad={!!error} {required}
        value={certificateMode(values, field.id, field.certificateInput)}
        onchange={(e) => selectCertificateMode(values, field.id, field.certificateInput!, e.currentTarget.value)}>
        {#each field.options ?? [] as o (o.value)}
          <option value={o.value}>{o.label ?? o.value}</option>
        {/each}
      </select>
    {:else if field.type === 'select'}
      {#if field.buttonOptions}
        <span class="field-button-options" role="group" aria-label={label} id={id}>
          {#each field.options ?? [] as o (o.value)}
            <button
              type="button"
              class="field-choice"
              class:active={String(values[field.id] ?? '') === o.value}
              aria-pressed={String(values[field.id] ?? '') === o.value}
              onclick={() => (values[field.id] = o.value)}
            >{o.label ?? (o.value === '' ? '(none)' : o.value)}</button>
          {/each}
        </span>
      {:else}
        <select {id} class:bad={!!error} {required} bind:value={values[field.id]}>
          {#each field.options ?? [] as o (o.value)}
            <option value={o.value}>{o.label ?? (o.value === '' ? '(none)' : o.value)}</option>
          {/each}
        </select>
      {/if}
    {:else if field.type === 'number'}
      <input {id} type="number" class:bad={!!error} {required} min={field.min} max={field.max} value={values[field.id]} oninput={setNumber} placeholder={field.placeholder} />
    {:else if field.type === 'secret'}
      <span class="secret-wrap">
        <input {id} type={reveal ? 'text' : 'password'} autocomplete="off" spellcheck="false" class:bad={!!error} {required} bind:value={values[field.id]} placeholder={field.placeholder ?? 'not stored'} />
        <button type="button" class="small" onclick={() => (reveal = !reveal)} aria-label={reveal ? 'Hide secret' : 'Show secret'}>{reveal ? 'Hide' : 'Show'}</button>
      </span>
    {:else if field.type === 'textarea'}
      <textarea {id} rows="3" maxlength={field.maxLength} class:bad={!!error} {required} bind:value={values[field.id]} placeholder={field.placeholder}></textarea>
    {:else}
      <input {id} type="text" maxlength={field.maxLength} autocomplete="off" spellcheck="false" class:bad={!!error} {required} bind:value={values[field.id]} placeholder={field.placeholder} />
    {/if}
    {#if error}<span class="err">{error}</span>{:else if help}<span class="hint">{help}</span>{/if}
  </label>
{/if}
