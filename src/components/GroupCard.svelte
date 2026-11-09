<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { fieldAvailable, groupAvailable, groupEnabled } from '../lib/model';
  import { hiddenSettings } from '../lib/conditional-settings';
  import type { Field, GroupDef, Values } from '../lib/schema';
  import type { Issue } from '../lib/validate';
  import FieldInput from './FieldInput.svelte';
  import VCenterTargetEditor from './VCenterTargetEditor.svelte';
  import TrustedCertEditor from './TrustedCertEditor.svelte';
  import RowListEditor from './RowListEditor.svelte';
  import HostEntryEditor from './HostEntryEditor.svelte';
  import AllowedOriginEditor from './AllowedOriginEditor.svelte';
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
  const renderedFields = $derived(visible.filter((f) => f.id !== group.enabledBy));
  const hiddenByVersion = $derived(group.fields.filter((f) => f.since && c.version < f.since).length);
  const conditional = $derived(hiddenSettings(group.fields, c));

  function err(fieldId: string): string | undefined {
    return issues.find((i) => i.fieldId === fieldId && !i.list && i.level === 'error')?.message;
  }

  function enabledField(target: GroupDef): Field {
    const existing = target.fields.find((field) => field.id === target.enabledBy);
    return existing ?? {
      id: target.enabledBy!,
      label: `Enable ${target.title}`,
      type: 'bool',
      key: target.enabledBy!,
      ini: false,
      json: false,
      help: target.help
    };
  }
</script>

{#if available}
  <details class="card collapsible-card" open>
    <summary class="card-head">
      <h3>{group.title}</h3>
      <span class="card-summary-actions">
        {#if group.enabledBy}
          <label class="toggle">
            <input id={`f-${group.enabledBy}`} type="checkbox" checked={c.values[group.enabledBy] === true} onchange={(e) => (app.config.values[group.enabledBy!] = e.currentTarget.checked)} />
            Enabled
            <FieldDetails field={enabledField(group)} platform={c.platform} />
          </label>
        {/if}
        <span class="collapse-indicator" aria-hidden="true"></span>
      </span>
    </summary>
    {#if group.help}<p class="help">{group.help}</p>{/if}
    {#if enabled}
      <div class="grid" class:policy-grid={group.id === 'timeouts'}>
        {#each renderedFields as f (f.id)}
          {#if f.trustedCertIndex === 1 && trustedFields.length}
            <TrustedCertEditor fields={trustedFields} bind:values={app.config.values as Values} {issues} uid={group.id} platform={c.platform} />
          {:else if f.hostEntryIndex === 1 && hostFields.length}
            <HostEntryEditor fields={hostFields} bind:values={app.config.values as Values} {issues} platform={c.platform} />
          {:else if f.trustedCertIndex === undefined && f.hostEntryIndex === undefined && f.rows}
            <RowListEditor field={f} platform={c.platform} bind:values={app.config.values as Values} {issues} />
          {:else if f.originDetails}
            <AllowedOriginEditor field={f} platform={c.platform} bind:values={app.config.values as Values} {issues} />
          {:else if f.id === 'target' && c.platform === 'vsphere'}
            <VCenterTargetEditor field={f} bind:values={app.config.values as Values} error={err(f.id)} />
          {:else if f.trustedCertIndex === undefined && f.hostEntryIndex === undefined}
            <FieldInput field={f} platform={c.platform} bind:values={app.config.values as Values} error={err(f.id)} />
          {/if}
        {/each}
      </div>
      {#if conditional.length > 0}
        <details class="notice conditional-settings">
          <summary>Hidden settings — how to enable them</summary>
          <p>Hidden values are kept in your configuration. Existing output rules still apply.</p>
          <ul>
            {#each conditional as entry}
              <li><strong>{entry.prerequisite}</strong> Hidden: {entry.fields.map((field) => field.label).join(', ')}.</li>
            {/each}
          </ul>
        </details>
      {/if}
      {#if hiddenByVersion > 0}
        <div class="notice">{hiddenByVersion} setting{hiddenByVersion > 1 ? 's' : ''} in this group {hiddenByVersion > 1 ? 'are' : 'is'} not available in UAG {c.version} and {hiddenByVersion > 1 ? 'are' : 'is'} hidden.</div>
      {/if}
    {:else}
      <p class="help">{group.target === 'horizon' && c.values.cascade_role === 'outer' ? 'Not used: this UAG is the outer cascade proxy (see Cascading above). Configure Horizon on the inner UAG.' : 'Turn on to configure and include in the output.'}</p>
    {/if}
  </details>
{/if}

<style>
  .conditional-settings summary { cursor: pointer; color: var(--info); }
  .conditional-settings li + li { margin-top: .6rem; }
  .conditional-settings ul { padding-left: 1.2rem; }
</style>
