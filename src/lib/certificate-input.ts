import type { Values } from './schema';

export interface CertificateInput {
  pemCert: string;
  pemKey: string;
  pfx?: string;
  alias?: string;
}

export function certificateMode(values: Values, selector: string, input: CertificateInput): string {
  const configured = String(values[selector] ?? '').trim().toUpperCase();
  if (configured && configured !== 'NONE') return configured;
  if (input.pfx && String(values[input.pfx] ?? '').trim()) return 'PFX';
  if ([input.pemCert, input.pemKey].some((id) => String(values[id] ?? '').trim())) return 'PEM';
  return 'NONE';
}

export function selectCertificateMode(values: Values, selector: string, input: CertificateInput, mode: string): void {
  values[selector] = mode;
  if (mode !== 'PEM') {
    values[input.pemCert] = '';
    values[input.pemKey] = '';
  }
  if (mode !== 'PFX') {
    if (input.pfx) values[input.pfx] = '';
    if (input.alias) values[input.alias] = '';
  }
}

export function certificatePathsMatch(certPath: unknown, keyPath: unknown): boolean {
  const normalize = (path: unknown) => String(path ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .toLowerCase();
  const cert = normalize(certPath);
  const key = normalize(keyPath);
  return cert.length > 0 && cert === key;
}
