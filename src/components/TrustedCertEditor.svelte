<script lang="ts">
  import type { Field, Values } from '../lib/schema';
  import type { Issue } from '../lib/validate';
  import {
    removeTrustedCertPath,
    TRUSTED_CERT_MAX,
    trustedCertFields,
    trustedCertPaths
  } from '../lib/trusted-certs';
  import FieldDetails from './FieldDetails.svelte';

  interface Props {
    fields: Field[];
    values: Values;
    issues: Issue[];
    uid: string;
    platform?: 'vsphere' | 'hyperv' | 'azure' | 'nutanix' | 'openshift';
    list?: { id: 'wrp' | 'syslog' | 'adminUsers'; index: number };
  }
  let { fields, values = $bindable(), issues, uid, platform = 'vsphere', list }: Props = $props();

  let requestedRows = $state(1);
  const orderedFields = $derived(trustedCertFields(fields));
  const populatedCount = $derived(trustedCertPaths(values, fields).length);
  const rowCount = $derived(Math.min(TRUSTED_CERT_MAX, Math.max(requestedRows, populatedCount, 1)));

  function error(field: Field): string | undefined {
    return issues.find((issue) =>
      issue.fieldId === field.id &&
      issue.level === 'error' &&
      (list ? issue.list?.id === list.id && issue.list.index === list.index : !issue.list)
    )?.message;
  }

  function add() {
    if (rowCount < TRUSTED_CERT_MAX) requestedRows = rowCount + 1;
  }

  function remove(index: number) {
    removeTrustedCertPath(values, fields, index);
    requestedRows = Math.max(1, rowCount - 1);
  }
</script>

<div class="trusted-certs" role="group" aria-labelledby={`${uid}-heading`}>
  <div class="trusted-certs-head">
    <div>
      <strong id={`${uid}-heading`}>Trusted CA certificate paths</strong>
      <span>{populatedCount} of {TRUSTED_CERT_MAX} configured</span>
    </div>
    <button type="button" class="small primary" onclick={add} disabled={rowCount >= TRUSTED_CERT_MAX} aria-label="Add trusted CA certificate path">+ Add certificate</button>
  </div>
  <div class="trusted-cert-rows">
    {#each orderedFields.slice(0, rowCount) as field, index (field.id)}
      {@const id = list ? `${uid}-${index + 1}` : `f-${field.id}`}
      {@const message = error(field)}
      <div class="trusted-cert-row">
        <label class="field" for={id}>
          <span class="lbl">Certificate path {index + 1}<FieldDetails {field} {platform} uid={`${uid}-${field.id}`} /></span>
          <input
            {id}
            type="text"
            autocomplete="off"
            spellcheck="false"
            class:bad={!!message}
            bind:value={values[field.id]}
            placeholder={field.placeholder}
            aria-describedby={`${id}-help`}
          />
          <span id={`${id}-help`} class:err={!!message} class="hint">{message ?? 'Absolute local .pem, .crt, or .cer path read by uagdeploy.'}</span>
        </label>
        {#if rowCount > 1}
          <button type="button" class="small danger" onclick={() => remove(index)} aria-label={`Remove trusted CA certificate path ${index + 1}`}>Remove</button>
        {/if}
      </div>
    {/each}
  </div>
</div>
