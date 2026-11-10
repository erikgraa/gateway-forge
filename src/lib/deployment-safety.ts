import type { Platform } from './versions';

export function vmReplacementWarning(platform: Platform): string {
  const details: Record<Platform, string> = {
    vsphere: '',
    hyperv: '',
    azure: 'Matching is limited to the configured Azure resource group. The script also deletes the VM OS disk and attempts to delete the name-eth0, name-eth1, and name-eth2 network interfaces, even if no matching VM exists. ',
    nutanix: 'Matching is limited to the selected cluster. Exactly one matching VM is deleted; multiple matches abort deployment. ',
    openshift: 'Matching is limited to the configured namespace. The script waits for VM deletion before creating the replacement. '
  };
  return `The deployment script deletes and recreates an existing VM matching the configured VM name ([General] name) at the deployment target. ${details[platform]}This is not an in-place update. Confirm the target and VM name, back up configuration, and plan downtime before running.`;
}
