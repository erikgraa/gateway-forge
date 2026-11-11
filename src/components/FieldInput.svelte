<script lang="ts">
  import { displayFieldLabel, fieldHelp, type Field, type Values } from '../lib/schema';
  import type { Platform } from '../lib/versions';
  import { certificateMode, selectCertificateMode } from '../lib/certificate-input';
  import { normalizeField } from '../lib/ordinary-whitespace';
  import { setSyslogServer, syslogDestination } from '../lib/syslog';
  import FieldDetails from './FieldDetails.svelte';

  interface Props {
    field: Field;
    values: Values;
    platform: Platform;
    error?: string;
    /** DOM id suffix when the same field id appears more than once (list items). */
    uid?: string;
    horizonAuthentication?: boolean;
  }
  let { field, values = $bindable(), platform, error, uid, horizonAuthentication = false }: Props = $props();

  let reveal = $state(false);
  const id = $derived(`f-${uid ?? field.id}`);
  const help = $derived(fieldHelp(field, platform));
  const required = $derived(typeof field.required === 'function' ? field.required(values) : field.required === true);
  const label = $derived(displayFieldLabel(field, values, platform));
  const placeholder = $derived(field.platformPlaceholders?.[platform] ?? field.placeholder);
  const inputValue = $derived(field.id === 'syslogPort' ? syslogDestination(values).port : values[field.id]);
  const isHorizonAuth = $derived(horizonAuthentication && field.id === 'authMethods');
  const authProviders: Record<string, string> = {
    radius_enabled: 'RADIUS',
    securid_enabled: 'RSA SecurID',
    oidc_enabled: 'OpenID Connect',
    saml_enabled: 'SAML',
    certauth_enabled: 'X.509 certificate authentication'
  };
  const horizonAuthProviders: Record<string, string[]> = {
    'radius-auth': ['radius_enabled'],
    'radius-auth-and-unauthenticated': ['radius_enabled'],
    'securid-auth': ['securid_enabled'],
    'securid-auth-and-unauthenticated': ['securid_enabled'],
    'oidc-auth': ['oidc_enabled'],
    'saml-auth': ['saml_enabled'],
    'saml-auth-and-passthrough': ['saml_enabled'],
    'saml-auth-and-unauthenticated': ['saml_enabled'],
    'certificate-auth': ['certauth_enabled'],
    'certificate-auth-and-passthrough': ['certauth_enabled'],
    'certificate-auth-and-radius-auth': ['certauth_enabled', 'radius_enabled'],
    'device-certificate-auth-and-passthrough': ['certauth_enabled'],
    'device-certificate-auth-and-saml-auth': ['certauth_enabled', 'saml_enabled']
  };
  const unavailableAuthProvider = $derived(horizonAuthPrerequisite(String(values[field.id] ?? '')));

  function horizonAuthPrerequisite(method: string): string | undefined {
    if (!isHorizonAuth) return;
    const missing = (horizonAuthProviders[method] ?? [])
      .filter((enabledBy) => values[enabledBy] !== true)
      .map((enabledBy) => authProviders[enabledBy]);
    return missing.length ? missing.join(' and ') : undefined;
  }

  function setNumber(e: Event) {
    const raw = (e.currentTarget as HTMLInputElement).value;
    values[field.id] = raw === '' ? '' : Number(raw);
  }
</script>

{#if field.type === 'bool'}
  <label class="field bool" class:wide={field.wide}>
    <input {id} type="checkbox" checked={values[field.id] === true} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined} onchange={(e) => (values[field.id] = e.currentTarget.checked)} />
    <span>
      {label}
      <FieldDetails {field} {platform} {uid} />
      {#if field.since}<span class="chip">UAG ≥ {field.since}</span>{/if}
      {#if error}<span class="err" id={`${id}-error`}>{error}</span>{:else if help}<span class="hint" id={`${id}-help`}> - {help}</span>{/if}
    </span>
  </label>
{:else}
  <label class="field" class:wide={field.wide} class:compact-number={field.type === 'number'} class:compact-select={field.id === 'secureRandomSource' || field.id === 'sshInterface'} for={id}>
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
        <select {id} class:bad={!!error} {required} bind:value={values[field.id]}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={isHorizonAuth ? [error ? `${id}-error` : help ? `${id}-help` : undefined, `${id}-prerequisites`].filter(Boolean).join(' ') : undefined}>
          {#each field.options ?? [] as o (o.value)}
            {@const prerequisite = horizonAuthPrerequisite(o.value)}
            <option value={o.value} disabled={!!prerequisite}>{o.label ?? (o.value === '' ? '(none)' : o.value)}{#if prerequisite} — enable {prerequisite} first{/if}</option>
          {/each}
        </select>
      {/if}
    {:else if field.type === 'number'}
      <input {id} type="number" class:bad={!!error} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined} {required} min={field.min} max={field.max} value={inputValue} oninput={setNumber} {placeholder} />
    {:else if field.type === 'secret'}
      <span class="secret-wrap">
        <input {id} type={reveal ? 'text' : 'password'} autocomplete="off" spellcheck="false" class:bad={!!error} {required} bind:value={values[field.id]} placeholder={placeholder ?? 'not stored'} />
        <button type="button" class="small" onclick={() => (reveal = !reveal)} aria-label={reveal ? 'Hide secret' : 'Show secret'}>{reveal ? 'Hide' : 'Show'}</button>
      </span>
    {:else if field.type === 'textarea'}
      <textarea {id} rows="3" maxlength={field.maxLength} class:bad={!!error} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined} {required} bind:value={values[field.id]} {placeholder}></textarea>
    {:else if field.id === 'syslogUrl'}
      <input {id} type="text" onblur={() => setSyslogServer(values, String(normalizeField(field, syslogDestination(values).server) ?? ''))} autocomplete="off" spellcheck="false" class:bad={!!error} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined} {required} value={syslogDestination(values).server} oninput={(e) => setSyslogServer(values, e.currentTarget.value)} {placeholder} />
    {:else}
      <input {id} type="text" onblur={() => { values[field.id] = normalizeField(field, values[field.id]) as Values[string]; }} maxlength={field.maxLength} autocomplete="off" spellcheck="false" class:bad={!!error} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined} {required} bind:value={values[field.id]} {placeholder} />
    {/if}
    {#if error}<span class="err" id={`${id}-error`}>{error}</span>{:else if help}<span class="hint" id={`${id}-help`}>{help}</span>{/if}
    {#if isHorizonAuth}
      <span class="hint" id={`${id}-prerequisites`}>
        {#if unavailableAuthProvider}
          Current selection is retained. Enable {unavailableAuthProvider} in Identity and access or choose another method.
        {:else}
          Only passthrough is available without providers. Enable RADIUS, RSA SecurID, OpenID Connect, SAML or X.509 certificate authentication in Identity and access to select their methods. Combined methods require every named provider.
        {/if}
      </span>
    {/if}
  </label>
{/if}
