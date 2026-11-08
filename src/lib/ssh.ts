export interface SshPublicKey {
  name: string;
  fileName: string;
  data?: string;
  path?: string;
}

export function sshPublicKeyLines(value: unknown): string[] {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function isSshRsaPublicKey(value: string): boolean {
  const m = /^ssh-rsa[ \t]+([A-Za-z0-9+/]+={0,2})(?:[ \t]+\S.*)?$/.exec(value.trim());
  if (!m || m[1].length % 4 === 1) return false;
  try {
    const decoded = atob(m[1]);
    return decoded.length >= 11 && decoded.charCodeAt(0) === 0 && decoded.charCodeAt(1) === 0 &&
      decoded.charCodeAt(2) === 0 && decoded.charCodeAt(3) === 7 && decoded.slice(4, 11) === 'ssh-rsa';
  } catch {
    return false;
  }
}

export function isSshPublicKeyPath(value: string): boolean {
  const path = value.trim();
  return /\.pub$/i.test(path) && !/[\r\n]/.test(path) && !/[<>"|?*]/.test(path);
}

function safeFileName(name: string, index: number): string {
  const clean = name.split(/[\\/]/).pop()?.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '') ?? '';
  return clean && clean.toLowerCase().endsWith('.pub') ? clean : `ssh-public-key-${index + 1}.pub`;
}

export function sshPublicKeys(value: unknown, names?: unknown): SshPublicKey[] {
  const importedNames = String(names ?? '').split(/\r?\n/);
  return sshPublicKeyLines(value).map((line, index) => {
    const name = importedNames[index]?.trim() || `ssh-public-key-${index + 1}.pub`;
    const fileName = safeFileName(name, index);
    return isSshRsaPublicKey(line)
      ? { name, fileName, data: line }
      : { name, fileName, path: line };
  });
}

export function sshPublicKeyValidationError(value: unknown): string | null {
  for (const [index, line] of sshPublicKeyLines(value).entries()) {
    if (!isSshRsaPublicKey(line) && !isSshPublicKeyPath(line)) {
      return `Line ${index + 1} must be an OpenSSH RSA public key (ssh-rsa ...) or a .pub file path`;
    }
  }
  return null;
}
