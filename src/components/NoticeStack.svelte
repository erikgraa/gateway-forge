<script lang="ts">
  import { olderDeploymentWarning, type Platform } from '../lib/versions';
  import { vmReplacementWarning } from '../lib/deployment-safety';

  let {
    platform,
    version,
    latestVersionId,
    onUseLatest
  }: {
    platform: Platform;
    version: string;
    latestVersionId: string;
    onUseLatest: () => void;
  } = $props();

  const usingLatestVersion = $derived(version === latestVersionId);
  const deploymentWarning = $derived(olderDeploymentWarning(version, latestVersionId));
  const replacementWarning = $derived(vmReplacementWarning(platform));
</script>

<aside class="form-notice-stack" aria-label="Release and platform advisories">
  <section
    class:older-version={!usingLatestVersion}
    class="form-notice version-policy"
    aria-labelledby="release-advisory-title"
    aria-live="polite"
  >
    <span class="version-shield" aria-hidden="true">{usingLatestVersion ? '✓' : '!'}</span>
    <div class="form-notice-copy">
      <strong id="release-advisory-title">
        {usingLatestVersion
          ? `UAG ${latestVersionId} is the recommended security baseline`
          : `UAG ${version} is older than the recommended release`}
      </strong>
      <p>
        {#if usingLatestVersion}
          New configurations target the current release and include fixes available in this build line.
        {:else}
          Other releases remain available for migration and maintenance, but may no longer be supported or include important security fixes present in UAG {latestVersionId}. Review the Omnissa lifecycle matrix and security advisories before deployment.
        {/if}
      </p>
      {#if deploymentWarning}<p>{deploymentWarning}</p>{/if}
    </div>
    {#if usingLatestVersion}
      <span class="version-pill">CURRENT</span>
    {:else}
      <button class="small" onclick={onUseLatest}>Use UAG {latestVersionId}</button>
    {/if}
  </section>

  {#if replacementWarning}
    <section class="form-notice platform-advisory" aria-labelledby="vm-replacement-advisory-title">
      <span class="platform-advisory-icon" aria-hidden="true">!</span>
      <div class="form-notice-copy">
        <strong id="vm-replacement-advisory-title">Warning: existing VM will be deleted and recreated</strong>
        <p>{replacementWarning}</p>
        <p>Gateway Forge generates files only; it does not check the target for existing VMs.</p>
      </div>
    </section>
  {/if}

  {#if platform === 'openshift'}
    <section class="form-notice platform-advisory" aria-labelledby="openshift-advisory-title">
      <span class="platform-advisory-icon" aria-hidden="true">!</span>
      <div class="form-notice-copy">
        <strong id="openshift-advisory-title">Limited Availability</strong>
        <p>OpenShift deployment requires Omnissa-granted access and the prerequisites documented in the Network &amp; deploy section. Gateway Forge generates preparation YAML and the official script workflow; it does not bypass that access requirement.</p>
      </div>
    </section>
  {:else if platform === 'nutanix'}
    <section class="form-notice platform-advisory" aria-labelledby="nutanix-advisory-title">
      <span class="platform-advisory-icon" aria-hidden="true">!</span>
      <div class="form-notice-copy">
        <strong id="nutanix-advisory-title">Nutanix QCOW2 preparation</strong>
                <p>Upload the UAG QCOW2 image to Prism Central first.</p>
      </div>
    </section>
  {/if}
</aside>
