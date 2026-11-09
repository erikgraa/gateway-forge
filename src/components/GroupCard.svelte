<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { fieldAvailable, groupAvailable, groupEnabled } from '../lib/model';
  import type { GroupDef, Values } from '../lib/schema';
  import type { Issue } from '../lib/validate';
  import FieldInput from './FieldInput.svelte';
  import TrustedCertEditor from './TrustedCertEditor.svelte';
  import RowListEditor from './RowListEditor.svelte';
  import HostEntryEditor from './HostEntryEditor.svelte';
  import FieldDetails from './FieldDetails.svelte';

  interface Props {
    group: GroupDef;
    issues: Issue[];
  }
  let { group, issues }: Props = $props();

  const c = $derived(app.config);
  const available = $derived(groupAvailable(group, c.version, c.platform) && group.fields.some((f) => fieldAvailable(f, c.version, c.platform, c.values)));
  const enabled = $derived(groupEnabled(group, c));
  const visible = $derived(group.fields.filter((f) => fieldAvailable(f, c.version, c.platform, c.values)));
  const trustedFields = $derived(visible.filter((f) => f.trustedCertIndex !== undefined));
  const hostFields = $derived(visible.filter((f) => f.hostEntryIndex !== undefined));
  const regularFields = $derived(visible.filter((f) => f.trustedCertIndex === undefined && f.hostEntryIndex === undefined && f.id !== group.enabledBy));
  const hiddenByVersion = $derived(group.fields.filter((f) => f.since && c.version < f.since).length);

  function err(fieldId: string): string | undefined {
    return issues.find((i) => i.fieldId === fieldId && !i.list && i.level === 'error')?.message;
  }
</script>

{#if available}
  <section class="card">
    <div class="card-head">
      <h3>{group.title}</h3>
      {#if group.enabledBy}
        <label class="toggle">
          <input id={`f-${group.enabledBy}`} type="checkbox" checked={c.values[group.enabledBy] === true} onchange={(e) => (app.config.values[group.enabledBy!] = e.currentTarget.checked)} />
          Enabled
          <FieldDetails field={group.fields.find((field) => field.id === group.enabledBy)!} platform={c.platform} />
        </label>
      {/if}
    </div>
    {#if group.help}<p class="help">{group.help}</p>{/if}
    {#if enabled}
      <div class="grid">
        {#each regularFields as f (f.id)}
          {#if f.rows}
            <RowListEditor field={f} platform={c.platform} bind:values={app.config.values as Values} {issues} />
          {:else}
            <FieldInput field={f} platform={c.platform} bind:values={app.config.values as Values} error={err(f.id)} />
          {/if}
        {/each}
        {#if trustedFields.length}
          <TrustedCertEditor fields={trustedFields} bind:values={app.config.values as Values} {issues} uid={group.id} platform={c.platform} />
        {/if}
        {#if hostFields.length}
          <HostEntryEditor fields={hostFields} bind:values={app.config.values as Values} {issues} platform={c.platform} />
        {/if}
      </div>
      {#if hiddenByVersion > 0}
        <div class="notice">{hiddenByVersion} setting{hiddenByVersion > 1 ? 's' : ''} in this group {hiddenByVersion > 1 ? 'are' : 'is'} not available in UAG {c.version} and {hiddenByVersion > 1 ? 'are' : 'is'} hidden.</div>
      {/if}
    {:else}
      <p class="help">{group.target === 'horizon' && c.values.cascade_role === 'outer' ? 'Not used: this UAG is the outer cascade proxy (see Cascading above). Configure Horizon on the inner UAG.' : 'Turn on to configure and include in the output.'}</p>
    {/if}
  </section>
{/if}
