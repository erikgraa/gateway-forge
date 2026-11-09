<script lang="ts">
  import { untrack } from 'svelte';
  import { fieldHelp, type Field, type Values } from '../lib/schema';
  import type { Platform } from '../lib/versions';
  import type { Issue } from '../lib/validate';
  import { parseListValue, serializeListValue } from '../lib/listValue';
  import FieldDetails from './FieldDetails.svelte';

  interface Props {
    field: Field;
    values: Values;
    platform: Platform;
    issues: Issue[];
  }
  let { field, values = $bindable(), platform, issues }: Props = $props();

  const definition = $derived(field.rows!);
  const separator = $derived(definition.separator ?? 'space');
  const isStaticRoute = $derived(definition.rule === 'staticRoutes');
  const help = $derived(fieldHelp(field, platform));
  const initial = untrack(() => String(values[field.id] ?? ''));
  const initialSeparator = untrack(() => field.rows?.separator ?? 'space');
  let emitted = $state(initial);
  let rows = $state<string[]>(parseListValue(initial, initialSeparator));

  $effect(() => {
    const external = String(values[field.id] ?? '');
    if (external !== emitted) {
      rows = parseListValue(external, separator);
      emitted = external;
    }
  });

  function commit() {
    emitted = serializeListValue(rows, separator);
    values[field.id] = emitted;
  }

  function update(index: number, event: Event) {
    const pasted = parseListValue((event.currentTarget as HTMLInputElement).value, separator);
    if (pasted.length > 1) rows.splice(index, 1, ...pasted);
    else rows[index] = pasted[0] ?? '';
    commit();
  }

  function routeParts(row: string): { network: string; gateway: string } {
    const [network = '', gateway = ''] = row.trim().split(/\s+/);
    return { network, gateway };
  }

  function updateRoute(index: number, part: 'network' | 'gateway', value: string) {
    const route = routeParts(rows[index] ?? '');
    if (part === 'network') {
      rows[index] = value.trim() ? `${value.trim()}${route.gateway ? ` ${route.gateway}` : ''}` : '';
    } else {
      rows[index] = route.network ? `${route.network}${value.trim() ? ` ${value.trim()}` : ''}` : '';
    }
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
    <FieldDetails {field} {platform} />
    {#if field.required === true}<span class="req" title="Required">*</span>{/if}
    <button type="button" class="small primary" onclick={add} aria-label={`Add ${definition.itemLabel.toLowerCase()}`}>
      + Add {definition.itemLabel.toLowerCase()}
    </button>
  </legend>
  <div class="row-list" id={`f-${field.id}`} tabindex="-1">
    {#each rows as row, index (index)}
      {@const route = isStaticRoute ? routeParts(row) : null}
      <div class="row-list-item" class:static-route-item={isStaticRoute}>
        {#if route}
          <div class="static-route-fields">
            <label class="row-list-input">
              <span class="lbl">Network / CIDR</span>
              <input
                id={`f-${field.id}-${index}-network`}
                type="text"
                autocomplete="off"
                spellcheck="false"
                value={route.network}
                class:bad={!!rowError(index)}
                placeholder="10.108.172.32/32"
                aria-label={`${definition.itemLabel} ${index + 1} network`}
                aria-invalid={rowError(index) ? 'true' : undefined}
                aria-describedby={rowError(index) ? `f-${field.id}-${index}-error` : undefined}
                oninput={(event) => updateRoute(index, 'network', event.currentTarget.value)}
              />
            </label>
            <label class="row-list-input">
              <span class="lbl">Gateway</span>
              <input
                id={`f-${field.id}-${index}-gateway`}
                type="text"
                autocomplete="off"
                spellcheck="false"
                value={route.gateway}
                disabled={!route.network}
                class:bad={!!rowError(index)}
                placeholder="10.108.172.253"
                aria-label={`${definition.itemLabel} ${index + 1} gateway`}
                aria-invalid={rowError(index) ? 'true' : undefined}
                aria-describedby={rowError(index) ? `f-${field.id}-${index}-error` : undefined}
                oninput={(event) => updateRoute(index, 'gateway', event.currentTarget.value)}
              />
            </label>
            {#if rowError(index)}
              <span class="err" id={`f-${field.id}-${index}-error`}>{rowError(index)}</span>
            {/if}
          </div>
        {:else}
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
        {/if}
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
