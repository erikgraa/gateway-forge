<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { fieldAvailable, newListItem } from '../lib/model';
  import type { Snippet } from 'svelte';
  import type { Field, ListDef } from '../lib/schema';
  import FieldDetails from './FieldDetails.svelte';
  import type { Issue } from '../lib/validate';
  import FieldInput from './FieldInput.svelte';
  import TrustedCertEditor from './TrustedCertEditor.svelte';
  import HostEntryEditor from './HostEntryEditor.svelte';

  interface Props {
    list: ListDef;
    issues: Issue[];
    enabledField?: Field;
    beforeItems?: Snippet;
    itemOffset?: number;
  }
  let { list, issues, enabledField, beforeItems, itemOffset = 0 }: Props = $props();

  const c = $derived(app.config);
  const items = $derived(c[list.id]);
  const enabled = $derived(!enabledField || c.values[enabledField.id] === true);

  function err(index: number, fieldId: string): string | undefined {
    const m = issues.find((i) => i.fieldId === fieldId && i.list?.id === list.id && i.list.index === index && i.level === 'error')?.message;
    return m?.replace(/^[^:]+ \d+: /, '');
  }
  function add() {
    app.config[list.id].push(newListItem(list.id));
  }
  function remove(i: number) {
    app.config[list.id].splice(i, 1);
  }
</script>

{#snippet addButton()}
  <button class="small primary" onclick={(event) => { event.stopPropagation(); add(); }} disabled={items.length >= list.max}>+ Add {list.itemLabel.toLowerCase()}</button>
{/snippet}

<details class="card collapsible-card" data-list={enabledField ? list.id : undefined} open>
  <summary class="card-head">
    <h3>{list.title}</h3>
    <span class="card-summary-actions">
      {#if enabledField}
        <label class="toggle">
          <input id={`f-${enabledField.id}`} type="checkbox" checked={enabled} onchange={(event) => (app.config.values[enabledField!.id] = event.currentTarget.checked)} />
          Enabled
          <FieldDetails field={enabledField} platform={c.platform} />
        </label>
      {:else}
        {@render addButton()}
      {/if}
      <span class="collapse-indicator" aria-hidden="true"></span>
    </span>
  </summary>
  {#if list.help}<p class="help">{list.help}</p>{/if}
  {#if enabled}
    {#if enabledField}<div class="list-toolbar">{@render addButton()}</div>{/if}
    {@render beforeItems?.()}
    {#each items as item, i (i)}
      {@const availableFields = list.fields.filter((f) => fieldAvailable(f, c.version, c.platform, item))}
      {@const trustedFields = availableFields.filter((f) => f.trustedCertIndex !== undefined)}
      {@const hostFields = availableFields.filter((f) => f.hostEntryIndex !== undefined)}
      <details class="list-item collapsible-item" open>
        <summary class="card-head">
          <strong>{list.itemLabel} {i + 1 + itemOffset}</strong>
          <span class="card-summary-actions">
            <button class="small danger" onclick={(event) => { event.stopPropagation(); remove(i); }}>Remove</button>
            <span class="collapse-indicator" aria-hidden="true"></span>
          </span>
        </summary>
        <div class="grid">
          {#each availableFields.filter((f) => f.trustedCertIndex === undefined && f.hostEntryIndex === undefined) as f (f.id)}
            <FieldInput field={f} platform={c.platform} uid={`${list.id}${i}_${f.id}`} bind:values={app.config[list.id][i]} error={err(i, f.id)} />
          {/each}
          {#if trustedFields.length}
            <TrustedCertEditor fields={trustedFields} bind:values={app.config[list.id][i]} {issues} uid={`${list.id}${i}`} platform={c.platform} list={{ id: list.id, index: i }} />
          {/if}
          {#if hostFields.length}
            <HostEntryEditor fields={hostFields} bind:values={app.config[list.id][i]} {issues} uid={`${list.id}${i}`} platform={c.platform} list={{ id: list.id, index: i }} />
          {/if}
        </div>
      </details>
    {:else}
      {#if !beforeItems}<p class="help">None configured.</p>{/if}
    {/each}
  {:else}
    <p class="help">Turn on to configure and include in the output. Provider values are retained.</p>
  {/if}
</details>

<style>
  .list-toolbar { display: flex; justify-content: flex-end; margin: 12px 17px; }
</style>
