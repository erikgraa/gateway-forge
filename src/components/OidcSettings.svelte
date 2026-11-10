<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { fieldAvailable, groupAvailable, listDef } from '../lib/model';
  import { GROUPS, type Field, type Values } from '../lib/schema';
  import type { Issue } from '../lib/validate';
  import FieldInput from './FieldInput.svelte';
  import ListEditor from './ListEditor.svelte';

  let { issues }: { issues: Issue[] } = $props();
  const group = GROUPS.find((group) => group.id === 'oidc')!;
  const list = listDef('oidc');
  const enabledField: Field = {
    id: group.enabledBy!, label: 'Enable OpenID Connect', type: 'bool',
    key: group.enabledBy!, ini: false, json: false, help: group.help
  };
  const c = $derived(app.config);
  const available = $derived(groupAvailable(group, c.version, c.platform));
  const fields = $derived(group.fields.filter((field) => fieldAvailable(field, c.version, c.platform, c.values)));

  function error(fieldId: string): string | undefined {
    return issues.find((issue) => issue.fieldId === fieldId && !issue.list && issue.level === 'error')?.message;
  }
</script>

{#snippet beforeItems()}
  <details class="list-item collapsible-item" open>
    <summary class="card-head">
      <strong>OIDC provider 1</strong>
      <span class="card-summary-actions"><span class="collapse-indicator" aria-hidden="true"></span></span>
    </summary>
    <div class="grid">
      {#each fields as field (field.id)}
        <FieldInput {field} platform={c.platform} bind:values={app.config.values as Values} error={error(field.id)} />
      {/each}
    </div>
  </details>
{/snippet}

{#if available}
  <ListEditor {list} {issues} {enabledField} {beforeItems} itemOffset={1} />
{/if}
