import { GROUPS, LISTS, type Field, type Values } from './schema';

export const TRUSTED_CERT_MAX = 9;

export function trustedCertFields(fields: Field[]): Field[] {
  return fields
    .filter((field) => field.trustedCertIndex !== undefined)
    .sort((a, b) => a.trustedCertIndex! - b.trustedCertIndex!);
}

export function trustedCertPaths(values: Values, fields: Field[]): string[] {
  return trustedCertFields(fields)
    .map((field) => String(values[field.id] ?? '').trim())
    .filter(Boolean)
    .slice(0, TRUSTED_CERT_MAX);
}

export function writeTrustedCertPaths(values: Values, fields: Field[], paths: string[]): void {
  trustedCertFields(fields).forEach((field, index) => {
    values[field.id] = paths[index] ?? '';
  });
}

export function compactTrustedCertPaths(values: Values, fields: Field[]): string[] {
  const paths = trustedCertPaths(values, fields);
  writeTrustedCertPaths(values, fields, paths);
  return paths;
}

export function addTrustedCertPath(values: Values, fields: Field[]): number {
  const paths = trustedCertPaths(values, fields);
  if (paths.length >= TRUSTED_CERT_MAX) return paths.length;
  writeTrustedCertPaths(values, fields, [...paths, '']);
  return paths.length + 1;
}

export function removeTrustedCertPath(values: Values, fields: Field[], index: number): void {
  const paths = trustedCertPaths(values, fields);
  paths.splice(index, 1);
  writeTrustedCertPaths(values, fields, paths);
}

export function compactConfigTrustedCerts(config: { values: Values; wrp: Values[]; syslog: Values[]; adminUsers: Values[] }): void {
  for (const group of GROUPS) compactTrustedCertPaths(config.values, group.fields);
  for (const list of LISTS) {
    for (const item of config[list.id]) compactTrustedCertPaths(item, list.fields);
  }
}
