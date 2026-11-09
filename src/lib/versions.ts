export type Platform = 'vsphere' | 'hyperv' | 'azure' | 'nutanix' | 'openshift';

export interface UagVersion {
  id: string;
  released: string;
  latest?: boolean;
}

/**
 * UAG versions that are listed as "Supported" in the Omnissa Lifecycle Matrix
 * (https://docs.omnissa.com/bundle/Product-Lifecycle-Matrix/page/lifecyclematrix.html,
 * snapshot taken 2026-10-30). UAG inherits the lifecycle of the product it is integrated
 * with, so every release in the matrix is currently "Supported". 2209 and older are no
 * longer listed and are treated as end-of-life. Maintenance releases (e.g. 2509.1) share
 * the INI/JSON schema of their parent release.
 */
export const LIFECYCLE_SNAPSHOT = '2026-10-30';

export const VERSIONS: UagVersion[] = [
  { id: '2212', released: '2023-01-10' },
  { id: '2303', released: '2023-03-14' },
  { id: '2306', released: '2023-07-06' },
  { id: '2309', released: '2023-10-23' },
  { id: '2312', released: '2024-01-30' },
  { id: '2406', released: '2024-06-27' },
  { id: '2412', released: '2025-01-28' },
  { id: '2503', released: '2025-04-09' },
  { id: '2506', released: '2025-07-31' },
  { id: '2512', released: '2025-12-16' },
  { id: '2603', released: '2026-04-14' },
  { id: '2606', released: '2026-08-24' },
  { id: '2609', released: '2026-10-29', latest: true }
];

export const DEFAULT_VERSION = '2609';

/** First UAG release whose admin UI no longer offers the TLS 1.0/1.1 toggles (TLS 1.2/1.3 only). */
export const TLS_LEGACY_UNTIL = '2412';

export interface PlatformDef {
  id: Platform;
  label: string;
  script: string;
  iniArgument: 'named';
  nonInteractive: 'named' | 'positional' | 'none';
  since?: string;
  limitedAvailability?: boolean;
}

export const PLATFORMS: PlatformDef[] = [
  { id: 'vsphere', label: 'VMware', script: 'uagdeploy.ps1', iniArgument: 'named', nonInteractive: 'named' },
  { id: 'hyperv', label: 'Hyper-V', script: 'uagdeployhv.ps1', iniArgument: 'named', nonInteractive: 'named' },
  { id: 'azure', label: 'Azure', script: 'uagdeployaz.ps1', iniArgument: 'named', nonInteractive: 'positional' },
  { id: 'nutanix', label: 'Nutanix AHV', script: 'uagdeployntnx.ps1', iniArgument: 'named', nonInteractive: 'none', since: '2606' },
  { id: 'openshift', label: 'Red Hat OpenShift Virtualization', script: 'uagdeployopenshift.ps1', iniArgument: 'named', nonInteractive: 'named', since: '2609', limitedAvailability: true }
];

export function platformDef(id: Platform): PlatformDef {
  return PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[0];
}

export function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function isSupportedVersion(id: string): boolean {
  return VERSIONS.some((v) => v.id === id);
}

export function platformAvailable(platform: Platform, version: string): boolean {
  return inVersion(version, platformDef(platform).since);
}

/** True when a feature with the given since/until bounds exists in `version`. */
export function inVersion(version: string, since?: string, until?: string): boolean {
  if (since && cmpVersion(version, since) < 0) return false;
  if (until && cmpVersion(version, until) >= 0) return false;
  return true;
}
