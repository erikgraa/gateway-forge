<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { fieldAvailable, newListItem } from '../lib/model';
  import type { ListDef } from '../lib/schema';
  import type { Issue } from '../lib/validate';
  import FieldInput from './FieldInput.svelte';
  import TrustedCertEditor from './TrustedCertEditor.svelte';

  interface Props {
    list: ListDef;
    issues: Issue[];
  }
  let { list, issues }: Props = $props();

  const c = $derived(app.config);
  const items = $derived(c[list.id]);

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

<section class="card">
  <div class="card-head">
    <h3>{list.title}</h3>
    <button class="small primary" onclick={add} disabled={items.length >= list.max}>+ Add {list.itemLabel.toLowerCase()}</button>
  </div>
  {#if list.help}<p class="help">{list.help}</p>{/if}
  {#each items as item, i (i)}
    {@const availableFields = list.fields.filter((f) => fieldAvailable(f, c.version, c.platform, item))}
    {@const trustedFields = availableFields.filter((f) => f.trustedCertIndex !== undefined)}
    <div class="list-item">
      <div class="card-head">
        <strong>{list.itemLabel} {i + 1}</strong>
        <button class="small danger" onclick={() => remove(i)}>Remove</button>
      </div>
      <div class="grid">
        {#each availableFields.filter((f) => f.trustedCertIndex === undefined) as f (f.id)}
          <FieldInput field={f} uid={`${list.id}${i}_${f.id}`} bind:values={app.config[list.id][i]} error={err(i, f.id)} />
        {/each}
        {#if trustedFields.length}
          <TrustedCertEditor fields={trustedFields} bind:values={app.config[list.id][i]} {issues} uid={`${list.id}${i}`} list={{ id: list.id, index: i }} />
        {/if}
      </div>
    </div>
  {:else}
    <p class="help">None configured.</p>
  {/each}
</section>
