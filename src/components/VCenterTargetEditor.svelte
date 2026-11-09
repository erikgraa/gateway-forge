<script lang="ts">
  import { untrack } from 'svelte';
  import type { Field, Values } from '../lib/schema';
  import { buildVCenterTarget, parseVCenterTarget, type VCenterTarget } from '../lib/vcenterTarget';
  import FieldDetails from './FieldDetails.svelte';

  interface Props { field: Field; values: Values; error?: string }
  let { field, values = $bindable(), error }: Props = $props();
  const initial = untrack(() => String(values[field.id] ?? ''));
  let emitted = $state(initial);
  let parts = $state<VCenterTarget>(parseVCenterTarget(initial) ?? { username: '', server: '', inventoryPath: '' });
  let advanced = $state(parseVCenterTarget(initial) === null);
  const canGuide = $derived(parseVCenterTarget(String(values[field.id] ?? '')) !== null);

  $effect(() => {
    const external = String(values[field.id] ?? '');
    if (external !== emitted) {
      const parsed = parseVCenterTarget(external);
      if (parsed) parts = parsed;
      else advanced = true;
      emitted = external;
    }
  });

  function update(key: keyof VCenterTarget, value: string) {
    parts[key] = value;
    emitted = buildVCenterTarget(parts);
    values[field.id] = emitted;
  }

  function updateRaw(value: string) {
    emitted = value;
    values[field.id] = value;
    const parsed = parseVCenterTarget(value);
    if (parsed) parts = parsed;
  }
</script>

<fieldset class="field wide vcenter-target" id="f-target" tabindex="-1">
  <legend class="lbl">
    {field.label}<FieldDetails {field} platform="vsphere" />
    <span class="req" title="Required">*</span>
  </legend>
  <div class="grid">
    {#if advanced}
      <label class="field wide" for="f-target-raw">
        <span class="lbl">Full OVF Tool locator</span>
        <input id="f-target-raw" type="text" autocomplete="off" spellcheck="false" required class:bad={!!error}
          value={values[field.id]} placeholder={field.placeholder} oninput={(e) => updateRaw(e.currentTarget.value)} />
      </label>
    {:else}
      <label class="field" for="f-target-username">
        <span class="lbl">vCenter username</span>
        <input id="f-target-username" type="text" autocomplete="off" spellcheck="false" required
          value={parts.username} placeholder="administrator@vsphere.local" oninput={(e) => update('username', e.currentTarget.value)} />
        <span class="hint">Use your UPN, for example username@domain.fqdn. The password is supplied at deployment.</span>
      </label>
      <label class="field" for="f-target-server">
        <span class="lbl">vCenter FQDN</span>
        <input id="f-target-server" type="text" autocomplete="off" spellcheck="false" required
          value={parts.server} placeholder="vcenter.corp.local" oninput={(e) => update('server', e.currentTarget.value)} />
      </label>
      <label class="field wide" for="f-target-inventory">
        <span class="lbl">Compute inventory path</span>
        <input id="f-target-inventory" type="text" autocomplete="off" spellcheck="false" required
          value={parts.inventoryPath} placeholder="DC1/host/Cluster1" oninput={(e) => update('inventoryPath', e.currentTarget.value)} />
        <span class="hint">Datacenter/host/cluster-or-host, including any compute inventory folders. For a resource pool, append /Resources/pool-path. Example: DC1/host/Cluster1/Resources/UAG. Use the separate VM folder setting for placement in VMs and Templates.</span>
      </label>
      <span class="hint wide">vi:// is added automatically. Existing locator spelling is preserved until you edit it.</span>
    {/if}
  </div>
  <button type="button" class="small" disabled={advanced && !canGuide} onclick={() => advanced = !advanced}>
    {advanced ? 'Use guided target fields' : 'Edit full locator'}
  </button>
  {#if advanced && !canGuide}<span class="hint">This imported locator cannot be split safely. It remains unchanged; edit it here.</span>{/if}
  {#if error}<span class="err">{error}</span>{/if}
</fieldset>
