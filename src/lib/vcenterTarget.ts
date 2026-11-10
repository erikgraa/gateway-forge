export const VCENTER_CREDENTIAL_TARGET_EXAMPLE = 'vi://uagdeploy@vsphere.local:PASSWORD@vcenter.example.com/DC1/host/Cluster1';

export const OVF_TOOL_VERSION_GUIDANCE = 'Horizon on vSphere is operator-tested with OVF Tool 5.0. Regressions were reported with 5.1 and 9.1; their causes and affected configurations have not been independently verified. This is not certification of every release or authentication workflow.';

export const VCENTER_INLINE_PASSWORD_WARNING = 'Full locators are saved in the browser draft and exported to INI/PowerShell without password redaction, regardless of secret mode. Add the real password only to a protected deployment copy outside Gateway Forge; keep credential-bearing files and logs private. Generated PowerShell rewrites the INI from its embedded configuration.';

export interface VCenterTarget {
  username: string;
  server: string;
  inventoryPath: string;
}

export function parseVCenterTarget(value: string): VCenterTarget | null {
  if (!value) return { username: '', server: '', inventoryPath: '' };
  if (!value.startsWith('vi://')) return null;
  const locator = value.slice(5);
  const slash = locator.indexOf('/');
  const authority = slash < 0 ? locator : locator.slice(0, slash);
  const at = authority.lastIndexOf('@');
  if (at < 0 || authority.slice(0, at).includes(':')) return null;
  return {
    username: authority.slice(0, at),
    server: authority.slice(at + 1),
    inventoryPath: slash < 0 ? '' : locator.slice(slash + 1)
  };
}

export interface TargetFeedback {
  message: string;
  warning: boolean;
}

export function vCenterTargetFeedback(target: VCenterTarget): Partial<Record<keyof VCenterTarget, TargetFeedback>> {
  const feedback: Partial<Record<keyof VCenterTarget, TargetFeedback>> = {};
  if (!target.username.trim()) {
    feedback.username = { message: 'Enter the vCenter account used at deployment.', warning: true };
  } else if (target.username.startsWith('@') || target.username.endsWith('@')) {
    feedback.username = { message: 'This UPN looks incomplete. Include both the username and domain, or use your supported account format.', warning: true };
  } else if (!target.username.includes('@')) {
    feedback.username = { message: 'If you use a UPN, include its domain (username@domain.fqdn). Other supported account formats are not rejected.', warning: false };
  }
  if (!target.server.trim()) {
    feedback.server = { message: 'Enter the vCenter server address, without a protocol or inventory path.', warning: true };
  } else if (/^[a-z][a-z\d+.-]*:\/\//i.test(target.server)) {
    feedback.server = { message: 'Remove the pasted protocol from this field. vi:// is added automatically; put the compute path below.', warning: true };
  } else if (/[\s/]/.test(target.server)) {
    feedback.server = { message: 'Check this server address for spaces or a pasted inventory path. Put the compute path below.', warning: true };
  }
  if (!target.inventoryPath.replace(/^\/+/, '').trim()) {
    feedback.inventoryPath = { message: 'Enter the compute inventory path, for example DC1/host/Cluster1. A VM folder is not a compute destination.', warning: true };
  }
  return feedback;
}

export function buildVCenterTarget(target: VCenterTarget): string {
  if (!target.username && !target.server && !target.inventoryPath) return '';
  return `vi://${target.username}@${target.server}/${target.inventoryPath.replace(/^\/+/, '')}`;
}
