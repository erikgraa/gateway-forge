<script lang="ts">
  import { untrack } from 'svelte';
  import type { Field, Values } from '../lib/schema';
  import { buildVCenterTarget, parseVCenterTarget, vCenterTargetFeedback, VCENTER_CREDENTIAL_TARGET_EXAMPLE, VCENTER_INLINE_PASSWORD_WARNING, type VCenterTarget } from '../lib/vcenterTarget';
  import { markGuidedTarget, trailingWhitespace } from '../lib/ordinary-whitespace';
  import FieldDetails from './FieldDetails.svelte';

  interface Props { field: Field; values: Values; error?: string }
  let { field, values = $bindable(), error }: Props = $props();
  const initial = untrack(() => String(values[field.id] ?? ''));
  let emitted = $state(initial);
  let parts = $state<VCenterTarget>(parseVCenterTarget(initial) ?? { username: '', server: '', inventoryPath: '' });
  let advanced = $state(parseVCenterTarget(initial) === null);
  const canGuide = $derived(parseVCenterTarget(String(values[field.id] ?? '')) !== null);
  const feedback = $derived(vCenterTargetFeedback(parts));

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
    markGuidedTarget(values, true);
    parts[key] = value;
    emitted = buildVCenterTarget(parts);
    values[field.id] = emitted;
  }

  function updateRaw(value: string) {
    markGuidedTarget(values, false);
    emitted = value;
    values[field.id] = value;
    const parsed = parseVCenterTarget(value);
    if (parsed) parts = parsed;
  }
</script>

<fieldset class="field wide vcenter-target" id="f-target" tabindex="-1" aria-describedby={error ? 'f-target-error' : undefined}>
  <legend class="lbl">
    {field.label}<FieldDetails {field} platform="vsphere" />
    <span class="req" title="Required">*</span>
  </legend>
  <div class="grid">
    {#if advanced}
      <label class="field wide" for="f-target-raw">
        <span class="lbl">Full OVF Tool locator</span>
        <input id="f-target-raw" type="text" autocomplete="off" spellcheck="false" required class:bad={!!error}
          aria-invalid={!!error || undefined} aria-describedby={error ? 'f-target-credentials-help f-target-error' : 'f-target-credentials-help'}
          value={values[field.id]} placeholder={field.placeholder} oninput={(e) => updateRaw(e.currentTarget.value)} />
      </label>
      <p class="hint wide" id="f-target-credentials-help">Unattended target syntax (synthetic): <code class="locator-example">{VCENTER_CREDENTIAL_TARGET_EXAMPLE}</code>. The UPN domain belongs before the colon; check special-character handling against the installed OVF Tool release. {VCENTER_INLINE_PASSWORD_WARNING}</p>
    {:else}
      <p class="hint wide">Builder guidance only — these checks do not change your locator or add deployment restrictions.</p>
      <div class="target-fields wide">
      <label class="field" for="f-target-username">
        <span class="lbl">vCenter username</span>
        <input id="f-target-username" type="text" onblur={() => update('username', trailingWhitespace(parts.username))} autocomplete="off" spellcheck="false" required
          aria-describedby="f-target-username-help f-target-username-feedback" aria-invalid={feedback.username?.warning || undefined}
          class:bad={feedback.username?.warning}
          value={parts.username} placeholder="administrator@vsphere.local" oninput={(e) => update('username', e.currentTarget.value)} />
        <span class="hint" class:err={feedback.username?.warning} id="f-target-username-feedback" aria-live="polite">{feedback.username?.message ?? ''}</span>
      </label>
      <label class="field" for="f-target-server">
        <span class="lbl">vCenter FQDN</span>
        <input id="f-target-server" type="text" onblur={() => update('server', trailingWhitespace(parts.server))} autocomplete="off" spellcheck="false" required
          aria-describedby="f-target-server-feedback" aria-invalid={feedback.server?.warning || undefined} class:bad={feedback.server?.warning}
          value={parts.server} placeholder="vcenter.corp.local" oninput={(e) => update('server', e.currentTarget.value)} />
        <span class="hint" class:err={feedback.server?.warning} id="f-target-server-feedback" aria-live="polite">{feedback.server?.message ?? ''}</span>
      </label>
      <label class="field inventory-field" for="f-target-inventory">
        <span class="lbl">Compute inventory path</span>
        <input id="f-target-inventory" type="text" onblur={() => update('inventoryPath', trailingWhitespace(parts.inventoryPath))} autocomplete="off" spellcheck="false" required
          aria-describedby="f-target-inventory-help f-target-inventory-feedback" aria-invalid={feedback.inventoryPath?.warning || undefined}
          class:bad={feedback.inventoryPath?.warning}
          value={parts.inventoryPath} placeholder="DC1/host/Cluster1" oninput={(e) => update('inventoryPath', e.currentTarget.value)} />
        <span class="hint" class:err={feedback.inventoryPath?.warning} id="f-target-inventory-feedback" aria-live="polite">{feedback.inventoryPath?.message ?? ''}</span>
      </label>
      </div>
      <span class="hint wide" id="f-target-username-help">A UPN is commonly username@domain.fqdn. Guided targets omit the password, so OVF Tool prompts for it. For unattended deployment, add credentials to a protected full locator after export.</span>
      <span class="hint wide" id="f-target-inventory-help">Datacenter/host/cluster-or-host, including any compute inventory folders. For a resource pool, append /Resources/pool-path. Example: DC1/host/Cluster1/Resources/UAG. Use the separate VM folder setting for placement in VMs and Templates.</span>
      <div class="target-preview wide">
        <span class="lbl">Assembled target (current value)</span>
        <code>{String(values[field.id] ?? '') || 'No target yet'}</code>
        <span class="hint">vi:// is added automatically. Existing locator spelling is preserved until you edit it.</span>
      </div>
    {/if}
  </div>
  <button type="button" class="small" disabled={advanced && !canGuide} onclick={() => advanced = !advanced}>
    {advanced ? 'Use guided target fields' : 'Edit full locator'}
  </button>
  {#if advanced && !canGuide}<span class="hint">This imported locator cannot be split safely. It remains unchanged; edit it here.</span>{/if}
  {#if error}<span class="err" id="f-target-error">{error}</span>{/if}
</fieldset>

<style>
  .vcenter-target { container-type: inline-size; }
  .vcenter-target > .grid { grid-template-columns: minmax(0, 1fr); }
  .target-fields { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-items: start; }
  .target-fields .field { min-width: 0; }
  @container (min-width: 420px) {
    .target-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .inventory-field { grid-column: 1 / -1; }
  }
  @container (min-width: 630px) {
    .target-fields { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .inventory-field { grid-column: auto; }
  }
  .target-preview { display: grid; gap: .5rem; min-width: 0; padding: .8rem; border: 1px solid var(--line); border-radius: .6rem; }
  .target-preview code, .locator-example { overflow-wrap: anywhere; white-space: pre-wrap; }
</style>
