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

export function buildVCenterTarget(target: VCenterTarget): string {
  if (!target.username && !target.server && !target.inventoryPath) return '';
  return `vi://${target.username}@${target.server}/${target.inventoryPath.replace(/^\/+/, '')}`;
}
