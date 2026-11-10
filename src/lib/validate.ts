import { GROUPS, LISTS, SECTIONS, deploymentNicCount, displayFieldLabel, type Field, type ListDef, type Rule, type SectionId, type Values } from './schema';
import { fieldAvailable, groupEnabled, listEnabled, isEmpty, type Config } from './model';
import { cascadeRole } from './cascade';
import { parseSecurityHeaders } from './security-headers';
import { TLS_LEGACY_UNTIL, VERSIONS, cmpVersion, olderDeploymentWarning, platformAvailable, platformDef, type Platform } from './versions';
import { parseOriginHeaderDetails } from './generate';
import { sshPublicKeyValidationError } from './ssh';
import { parseListValue } from './listValue';
import { HOST_ENTRY_MAX, hostEntryValues } from './host-entries';
import { certificateMode, certificatePathsMatch } from './certificate-input';
import { trustedCertFields, trustedCertPaths } from './trusted-certs';
import { knownAzureRegion } from './azure-regions';

export type Level = 'error' | 'warn' | 'info';

export interface Issue {
  id: string;
  level: Level;
  section: SectionId;
  message: string;
  fieldId?: string;
  /** For list items: list id and 0-based index. */
  list?: { id: ListDef['id']; index: number };
  /** For a row within a string-backed multi-value field. */
  rowIndex?: number;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HOST = /^(?=.{1,253}$)([A-Za-z0-9_]([A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?)(\.[A-Za-z0-9_]([A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?)*$/;
const DNS_DOMAIN = /^(?=.{1,253}\.?$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*\.?$/;

export const isIpv4 = (s: string) => IPV4.test(s);

function isNetmask(s: string): boolean {
  if (!IPV4.test(s)) return false;
  const bits = s.split('.')
    .map((octet) => Number(octet).toString(2).padStart(8, '0'))
    .join('');
  return /^1*0*$/.test(bits);
}

function isIpv6(s: string): boolean {
  if (!s.includes(':')) return false;
  try {
    return new URL(`http://[${s}]`).hostname.startsWith('[');
  } catch {
    return false;
  }
}

function validStaticRoutes(s: string): string | null {
  for (const route of s.split(',').map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\S+)\s+(\S+)$/.exec(route);
    if (!m) return `Route "${route}" must be "IPv4-network/prefix gateway-IPv4"`;
    const network = m[1].split('/');
    const prefix = Number(network[1]);
    if (network.length !== 2 || !IPV4.test(network[0]) || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
      return `"${m[1]}" is not an IPv4 CIDR network`;
    }
    if (!IPV4.test(m[2])) return `"${m[2]}" is not an IPv4 gateway`;
  }
  return null;
}

function validSourceImage(s: string, platform: Platform): string | null {
  const extension = platform === 'hyperv' ? '.vhdx' : '.ova';
  const isUrl = /^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(s);
  const hasUrlScheme = /^[A-Za-z][A-Za-z\d+.-]*:/.test(s);
  const isDrivePath = /^[A-Za-z]:[\\/]/.test(s);
  if (isUrl) {
    if (platform === 'hyperv') return 'Hyper-V source images must be local .vhdx paths, not URLs';
    try {
      const url = new URL(s);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return 'VMware source image URLs must use http:// or https://';
      if (!url.pathname.toLowerCase().endsWith(extension)) return 'VMware source image URLs must point to a .ova file';
      return null;
    } catch {
      return 'Not a valid source image URL';
    }
  }
  if (hasUrlScheme && !isDrivePath) return 'Not a valid local path or source image URL';
  if (!s.toLowerCase().endsWith(extension)) {
    return platform === 'hyperv'
      ? 'Hyper-V source images must be local .vhdx paths'
      : 'VMware source images must be local .ova paths or HTTP(S) URLs';
  }
  return null;
}

function hostPort(s: string): boolean {
  const m = /^(.+?)(?::(\d{1,5}))?$/.exec(s);
  if (!m) return false;
  if (m[2] !== undefined && (Number(m[2]) < 1 || Number(m[2]) > 65535)) return false;
  return IPV4.test(m[1]) || HOST.test(m[1]);
}

function validUrl(s: string, httpsOnly: boolean): boolean {
  try {
    const u = new URL(s);
    if (!u.hostname) return false;
    return httpsOnly ? u.protocol === 'https:' : u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function validHttpsOrigin(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'https:'
      && !!u.hostname
      && !u.username
      && !u.password
      && u.pathname === '/'
      && !u.search
      && !u.hash;
  } catch {
    return false;
  }
}

function validHostEntries(s: string): boolean {
  return s.split(',').map((entry) => entry.trim()).filter(Boolean).every((entry) => {
    const parts = entry.split(/\s+/);
    return parts.length >= 2 && parts.length <= 3 && IPV4.test(parts[0]) && parts.slice(1).every((part) => HOST.test(part));
  });
}

const HASH_LEN: Record<string, number> = { sha1: 40, sha256: 64, sha384: 96, sha512: 128 };

export function parseThumbprint(entry: string): { alg: string; hex: string } | null {
  const m = /^\s*(?:(sha1|sha256|sha384|sha512)\s*[=:]\s*)?(.+?)\s*$/i.exec(entry);
  if (!m) return null;
  const alg = (m[1] ?? 'sha256').toLowerCase();
  const body = m[2];
  let hex: string;
  if (/[:\s]/.test(body)) {
    const parts = body.split(/[:\s]+/).filter(Boolean);
    if (parts.some((p) => !/^[0-9a-f]{1,2}$/i.test(p))) return null;
    hex = parts.map((p) => p.padStart(2, '0')).join('');
  } else {
    if (!/^[0-9a-f]+$/i.test(body)) return null;
    hex = body;
  }
  return { alg, hex: hex.toLowerCase() };
}

export function validThumbprints(s: string): string | null {
  if (!s.trim()) return null;
  for (const entry of s.split(',')) {
    if (!entry.trim()) return 'Thumbprint lists cannot contain empty entries';
    const t = parseThumbprint(entry);
    if (!t) return `"${entry.trim()}" is not a valid thumbprint ([alg=]xx:xx:… or alg:xx xx …)`;
    if (t.hex.length !== HASH_LEN[t.alg]) return `${t.alg} thumbprint must be ${HASH_LEN[t.alg] / 2} bytes (got ${t.hex.length / 2})`;
  }
  return null;
}

export function checkRule(rule: Rule, raw: string, platform: Platform = 'vsphere'): string | null {
  const s = raw.trim();
  switch (rule) {
    case 'securityHeaders':
      return parseSecurityHeaders(s) ? null : 'Enter a JSON object of header names and string values, or a quoted, escaped JSON value from an appliance INI export';
    case 'guid':
      return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s) ? null : 'Not a valid GUID (expected 8-4-4-4-12 hexadecimal characters with hyphens)';
    case 'ipv4':
      return IPV4.test(s) ? null : 'Not a valid IPv4 address';
    case 'netmask':
      return isNetmask(s) ? null : 'Not a valid contiguous IPv4 netmask';
    case 'dnsDomain':
      return DNS_DOMAIN.test(s) && !IPV4.test(s.replace(/\.$/, '')) ? null : 'Not a valid DNS search domain';
    case 'hostOrIp':
      return hostPort(s) ? null : 'Not a valid host name, IP address or host:port';
    case 'hostPort':
      return s === '_empty_' || hostPort(s) ? null : 'Not a valid host[:port] value or _empty_';
    case 'hostList':
      return s.split(/[\s,]+/).filter(Boolean).every(hostPort) ? null : 'Contains an invalid host name or IP address';
    case 'hostPortList':
      return s.split(',').map((x) => x.trim()).filter(Boolean).every((x) => x === '_empty_' || hostPort(x)) ? null : 'Contains an invalid host[:port] value';
    case 'hostEntry': {
      const [ip, host, alias, extra] = s.trim().split(/\s+/);
      return IPV4.test(ip ?? '') && !!host && (!alias || HOST.test(alias)) && extra === undefined && HOST.test(host) ? null : 'Use IPv4_address hostname [alias]';
    }
    case 'ipList':
      return s.split(/[\s,]+/).filter(Boolean).every((x) => IPV4.test(x)) ? null : 'Contains an invalid IPv4 address';
    case 'url':
      return validUrl(s, false) ? null : 'Not a valid http(s) URL';
    case 'httpsUrl':
      return validUrl(s, true) ? null : 'Must be a valid https:// URL';
    case 'httpsOrigin':
      return validHttpsOrigin(s) ? null : 'Must be an https:// origin with no path, query or fragment';
    case 'urlList':
      return s.split(',').map((x) => x.trim()).filter(Boolean).every((x) => validUrl(x, true)) ? null : 'Contains an invalid https:// URL';
    case 'port':
      return /^\d+$/.test(s) && Number(s) >= 1 && Number(s) <= 65535 ? null : 'Port must be 1-65535';
    case 'thumbprints':
      return validThumbprints(s);
    case 'sshPublicKeys':
      return sshPublicKeyValidationError(s);
    case 'uagName':
      return /^[A-Za-z0-9.-]{1,24}$/.test(s) ? null : 'Up to 24 characters: A-Z, 0-9, "-" and "."; no spaces';
    case 'osLoginUsername':
      return /^[a-z0-9_-]{1,32}$/.test(s) ? null : 'Up to 32 lowercase characters: a-z, 0-9, "_" and "-"';
    case 'ascii':
      return /^[\x20-\x7e\r\n]*$/.test(s) ? null : 'ASCII characters only';
    case 'ipv4Port': {
      const [ip, port] = s.split(':');
      return IPV4.test(ip) && (port === undefined || (Number(port) >= 1 && Number(port) <= 65535)) ? null : 'Must be an IPv4 address with optional :port';
    }
    case 'ipv6':
      return isIpv6(s) ? null : 'Not a valid IPv6 address';
    case 'staticRoutes':
      return validStaticRoutes(s);
    case 'customConfig':
      return s.split(';').map((x) => x.trim()).filter(Boolean).every((x) => /^[A-Za-z0-9_.-]+\^[A-Za-z0-9_.-]+=.*$/.test(x))
        ? null
        : 'Use semicolon-separated Section^Parameter=Value entries';
    case 'hostEntryList':
      return validHostEntries(s) ? null : 'Must contain comma-separated "IP hostname [alias]" entries';
    case 'path':
      return s.startsWith('/') ? null : 'Must start with "/"';
    case 'redirectMappings':
      return s.split(',').map((x) => x.trim()).filter(Boolean).every((x) => {
        const [from, to, extra] = x.split('_');
        return !!from && !!to && extra === undefined && hostPort(from) && hostPort(to);
      }) ? null : 'Use comma-separated source_host:port_redirect_host:port mappings';
    case 'sourceImage':
      return validSourceImage(s, platform);
    case 'monitoringUserName':
      return /^[\p{L}\p{N}\p{M}\\_]+$/u.test(s) && s.length <= 35
        ? null
        : 'Use 1-35 letters, numbers, underscores, or backslashes; no spaces';
    case 'pemPath': {
      const absolute = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(s);
      if (!absolute) return 'Must be an absolute local path (Windows, UNC, or Unix)';
      if (!/\.(?:pem|crt|cer)$/i.test(s)) return 'Must point to a .pem, .crt, or .cer file';
      return null;
    }
    case 'pemKeyPath': {
      const absolute = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(s);
      if (!absolute) return 'Must be an absolute local path (Windows, UNC, or Unix)';
      if (!/\.(?:pem|key)$/i.test(s)) return 'Must point to a .pem or .key file';
      return null;
    }
    case 'pfxPath': {
      const absolute = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(s);
      if (!absolute) return 'Must be an absolute local path (Windows, UNC, or Unix)';
      if (!/\.(?:pfx|p12)$/i.test(s)) return 'Must point to a .pfx or .p12 file';
      return null;
    }
    case 'int':
      return /^-?\d+$/.test(s) ? null : 'Must be an integer';
    case 'kubeName':
      return /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?(?:\.[a-z0-9](?:[-a-z0-9]*[a-z0-9])?)*$/.test(s) && s.length <= 253 ? null : 'Must be a lowercase DNS-style name (letters, numbers, "-" and ".")';
    case 'kubeNamespace':
      return /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(s) && s.length <= 63 ? null : 'Must be a lowercase DNS label of at most 63 characters (letters, numbers and "-")';
  }
}

function checkField(f: Field, values: Values, platform: Platform): string | null {
  const v = f.certificateInput ? certificateMode(values, f.id, f.certificateInput) : values[f.id];
  const required = typeof f.required === 'function' ? f.required(values) : f.required;
  const label = displayFieldLabel(f, values, platform);
  const emptyRequiredPemPath = required && f.rule === 'pemPath' && !String(v ?? '').trim();
  if (isEmpty(v) || emptyRequiredPemPath) return required ? `${label} is required` : null;
  if (f.type === 'number') {
    const n = Number(v);
    if (!Number.isFinite(n)) return `${label} must be a number`;
    if (f.min !== undefined && n < f.min) return `${label} must be ≥ ${f.min}`;
    if (f.max !== undefined && n > f.max) return `${label} must be ≤ ${f.max}`;
  }
  if (f.maxLength !== undefined && String(v).length > f.maxLength) return `${label} must be at most ${f.maxLength} characters`;
  if (f.type === 'select' && f.options && !f.options.some((option) => option.value === String(v))) {
    return `${label}: "${String(v)}" is not an allowed value`;
  }
  if (f.rule && f.type !== 'bool') {
    const err = checkRule(f.rule, String(v), platform);
    if (err) return `${label}: ${err}`;
  }
  return null;
}

function netOf(ip: string, mask: string): number | null {
  if (!IPV4.test(ip) || !IPV4.test(mask)) return null;
  const n = (s: string) => s.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
  return (n(ip) & n(mask)) >>> 0;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function validateConfig(c: Config): Issue[] {
  const issues: Issue[] = [];
  const push = (i: Omit<Issue, 'id'>) => issues.push({ ...i, id: `${i.section}:${i.fieldId ?? ''}:${issues.length}` });
  const v = c.values;

  if (c.platform === 'azure' && !isEmpty(v.az_location) && !knownAzureRegion(String(v.az_location))) {
    push({ level: 'warn', section: 'network', fieldId: 'az_location', message: 'This location is not recognized in the bundled Azure public-cloud region catalog. It may be new, cloud-specific, or misspelled. Verify it with az account list-locations in your deployment environment; your value is retained.' });
  }

  if (v.ha_enabled === true && c.platform === 'azure') {
    push({ level: 'error', section: 'ha', fieldId: 'ha_enabled', message: 'Native high availability is not supported on Azure. HA values are retained but not emitted.' });
  }

  if (v.ha_enabled === true && IPV4.test(String(v.ha_virtualIPAddress ?? '').trim())) {
    const vip = String(v.ha_virtualIPAddress).trim().split('.').map(Number).join('.');
    for (const nic of [0, 1, 2]) {
      const address = String(v[`ip${nic}`] ?? '').trim();
      if (IPV4.test(address) && address.split('.').map(Number).join('.') === vip) {
        push({ level: 'error', section: 'ha', fieldId: 'ha_virtualIPAddress', message: `The HA Virtual IP Address must differ from the configured NIC${nic} / eth${nic} address (${address}).` });
      }
    }
  }

  for (const g of GROUPS) {
    if (!groupEnabled(g, c)) continue;
    for (const selector of g.fields.filter((f) => f.certificateInput)) {
      const input = selector.certificateInput!;
      const hasPem = [input.pemCert, input.pemKey].some((id) => !isEmpty(v[id]));
      for (const fieldId of [input.pemCert, input.pemKey]) {
        if (/\.p(?:fx|12)$/i.test(String(v[fieldId] ?? '').trim())) {
          push({ level: 'error', section: g.section, fieldId, message: `${selector.label}: a PFX/PKCS#12 file cannot be used as a PEM certificate or private key.` });
        }
      }
      if (certificatePathsMatch(v[input.pemCert], v[input.pemKey])) {
        push({
          level: 'error',
          section: g.section,
          fieldId: input.pemKey,
          message: `${selector.label}: certificate and private key must reference separate files.`
        });
      }
      if (input.pfx && !isEmpty(v[input.pfx]) && hasPem) {
        push({ level: 'error', section: g.section, fieldId: selector.id, message: `${selector.label}: choose either PEM or PFX, not both. Select a mode to clear incompatible paths.` });
      }
      if (input.alias && !isEmpty(v[input.alias]) && input.pfx && isEmpty(v[input.pfx])) {
        push({ level: 'error', section: g.section, fieldId: selector.id, message: `${selector.label}: a PFX file is required when a PFX alias is configured.` });
      }
    }
    const trustedFields = trustedCertFields(g.fields);
    trustedFields.forEach((field, index) => {
      const duplicate = trustedFields.slice(0, index).find((previous) => certificatePathsMatch(v[previous.id], v[field.id]));
      if (duplicate) {
        push({
          level: 'error',
          section: g.section,
          fieldId: field.id,
          message: `${field.label}: duplicate trusted CA path already used by ${duplicate.label}.`
        });
      }
    });
    if (hostEntryValues(v, g.fields).length > HOST_ENTRY_MAX) {
      push({ level: 'error', section: g.section, fieldId: g.fields.find((f) => f.hostEntryIndex === HOST_ENTRY_MAX)?.id, message: 'A maximum of six host entries is supported. Remove extra entries before exporting.' });
    }
    for (const f of g.fields) {
      if (!fieldAvailable(f, c.version, c.platform, v)) continue;
      if (f.rows) {
        const rows = parseListValue(v[f.id], f.rows.separator);
        if (rows.length === 0) {
          const required = typeof f.required === 'function' ? f.required(v) : f.required;
          if (required) push({ level: 'error', section: g.section, fieldId: f.id, message: `${f.label} is required` });
          if (f.rule === 'urlList') {
            const error = checkRule('urlList', rows.join(','), c.platform);
            if (error) push({ level: 'error', section: g.section, fieldId: f.id, message: `${f.label}: ${error}` });
          }
          continue;
        }
        rows.forEach((row, index) => {
          const error = f.rows!.rule ? checkRule(f.rows!.rule, row, c.platform) : null;
          if (error) push({
            level: 'error',
            section: g.section,
            fieldId: f.id,
            rowIndex: index,
            message: `${f.rows!.itemLabel} ${index + 1}: ${error}`
          });
        });
        continue;
      }
      const msg = checkField(f, v, c.platform);
      if (msg) push({ level: 'error', section: g.section, fieldId: f.id, message: msg });
    }
  }
  for (const l of LISTS) {
    if (!listEnabled(l, c)) continue;
    if ((l.id === 'jwt' || l.id === 'jwtIssuers' || l.id === 'oidc') && c[l.id].length > l.max) push({ level: 'error', section: 'auth', message: `${l.title}: a maximum of ${l.max} profiles is supported.` });
    c[l.id].forEach((item, index) => {
      if (l.id === 'wrp' && item.enabled === false) return;
      if (l.id === 'oidc') {
        const id = item.oidcConfigurationId;
        const duplicate = !isEmpty(id) && (id === v.oidc_oidcConfigurationId || c.oidc.some((other, n) => n !== index && other.oidcConfigurationId === id));
        if (duplicate) push({ level: 'error', section: 'auth', fieldId: 'oidcConfigurationId', list: { id: 'oidc', index }, message: `OIDC provider ${index + 1}: configuration IDs must be unique across all providers.` });
        if (index === 0 && !isEmpty(v.oidc_oidcConfigurationId) && c.oidc.some((other) => other.oidcConfigurationId === v.oidc_oidcConfigurationId)) push({ level: 'error', section: 'auth', fieldId: 'oidc_oidcConfigurationId', message: 'OIDC configuration IDs must be unique across all providers.' });
      }
      if (l.id === 'jwt' || l.id === 'jwtIssuers') {
        const report = (level: 'error' | 'info', fieldId: string, message: string) => push({ level, section: 'auth', fieldId, message: `${l.itemLabel} ${index + 1}: ${message}`, list: { id: l.id, index } });
        if (item.name && !/^[\p{L}\p{N}\p{M}_.-]+(?: [\p{L}\p{N}\p{M}_.-]+)*$/u.test(String(item.name))) report('error', 'name', 'name must use letters, numbers, single spaces, underscore, dot or hyphen.');
        if (c[l.id].some((other, n) => n !== index && other.name === item.name && !!item.name)) report('error', 'name', 'profile names must be unique within this profile type.');
        const refresh = item.publicKeyRefreshInterval;
        if (item.url && !isEmpty(refresh) && Number(refresh) > 0 && Number(refresh) < 10) report('error', 'publicKeyRefreshInterval', 'refresh interval must be 0 or 10–86400 seconds.');
        const hasStatic = l.id === 'jwt' ? Array.from({ length: 9 }, (_, i) => item[`publicKey${i + 1}`]).some((value) => !isEmpty(value)) : !isEmpty(item.encryptionPublicKey);
        if (l.id === 'jwt' && !item.url && !hasStatic) report('error', 'url', 'a dynamic public key URL or at least one static public key file is required.');
        if (l.id === 'jwtIssuers' && item.url && hasStatic) report('error', 'encryptionPublicKey', 'choose static encryption key or dynamic URL, not both.');
        if (hasStatic || trustedCertPaths(item, l.fields).length || l.id === 'jwtIssuers') report('info', 'name', 'Settings JSON omits deployment-host key/certificate files. Supply actual material through an approved admin/API workflow before applying this profile; INI deployment reads the files.');
        for (const [key, value] of Object.entries(item)) {
          if (typeof value === 'string' && /-----BEGIN[^-]*(?:PRIVATE KEY|PUBLIC KEY|CERTIFICATE)-----/i.test(value)) report('error', key, 'use a deployment-host file path, not raw key/certificate material.');
          if (/^(publicKey\d+|encryptionPublicKey)$/.test(key) && /(?:^|[\\/])Public_Key_From_URL$/i.test(String(value))) report('error', key, 'Public_Key_From_URL is a reserved filename.');
        }
      }
      if (hostEntryValues(item, l.fields).length > HOST_ENTRY_MAX) {
        push({
          level: 'error',
          section: l.section,
          fieldId: l.fields.find((field) => field.hostEntryIndex === HOST_ENTRY_MAX)?.id,
          message: `${l.itemLabel} ${index + 1}: a maximum of six host entries is supported.`,
          list: { id: l.id, index }
        });
      }
      for (const f of l.fields) {
        if (!fieldAvailable(f, c.version, c.platform, item)) continue;
        const msg = checkField(f, item, c.platform);
        if (msg) push({ level: 'error', section: l.section, fieldId: f.id, message: `${l.itemLabel} ${index + 1}: ${msg}`, list: { id: l.id, index } });
      }
      if (l.id === 'wrp') {
        const fields = trustedCertFields(l.fields);
        fields.forEach((field, fieldIndex) => {
          const duplicate = fields.slice(0, fieldIndex).find((previous) => certificatePathsMatch(item[previous.id], item[field.id]));
          if (duplicate) {
            push({
              level: 'error',
              section: l.section,
              fieldId: field.id,
              message: `${l.itemLabel} ${index + 1}: duplicate trusted CA path already used by ${duplicate.label}.`,
              list: { id: l.id, index }
            });
          }
        });
      }
    });
  }

  validateNetworkServers(c, push);
  lint(c, push);
  return issues;
}

type Push = (i: Omit<Issue, 'id'>) => void;

function networkServerIdentity(raw: string): string {
  const host = raw.trim().replace(/:\d+$/, '');
  const octets = host.split('.');
  const numericIpv4 = octets.length === 4 && octets.every((octet) => /^\d+$/.test(octet) && Number(octet) <= 255);
  return numericIpv4 ? octets.map(Number).join('.') : host.toLowerCase();
}

function validateNetworkServers(c: Config, push: Push): void {
  const group = GROUPS.find((group) => group.id === 'dns')!;
  const regularNtp = new Map<string, number>();
  for (const id of ['dns', 'ntpServers', 'fallBackNtpServers']) {
    const field = group.fields.find((field) => field.id === id)!;
    if (!groupEnabled(group, c) || !fieldAvailable(field, c.version, c.platform, c.values)) continue;
    const seen = new Map<string, number>();
    parseListValue(c.values[id], field.rows!.separator).forEach((row, index) => {
      if (checkRule(field.rows!.rule!, row, c.platform)) return;
      const identity = networkServerIdentity(row);
      const previous = seen.get(identity);
      const regular = regularNtp.get(identity);
      const message = previous !== undefined
        ? `Duplicate server already used in ${field.rows!.itemLabel} ${previous + 1}. Remove this row or enter a different server.`
        : id === 'fallBackNtpServers' && regular !== undefined
          ? `Already configured as NTP server ${regular + 1}. Remove it here or choose a different fallback server.`
          : null;
      if (message) push({
        level: 'error',
        section: group.section,
        fieldId: id,
        rowIndex: index,
        message: `${field.rows!.itemLabel} ${index + 1}: ${message}`
      });
      if (previous === undefined) seen.set(identity, index);
      if (id === 'ntpServers' && !regularNtp.has(identity)) regularNtp.set(identity, index);
    });
  }
}

function lint(c: Config, push: Push): void {
  const v = c.values;
  const role = cascadeRole(v);
  const horizon = v.horizon_enabled === true && role !== 'outer';
  const nonEmpty = (k: string) => !isEmpty(v[k]);
  const def = platformDef(c.platform);
  const hasPublishedService = role !== 'none'
    || horizon
    || (v.airwatch_enabled === true && v.airwatch_tunnelGatewayEnabled === true)
    || v.contentGateway_enabled === true
    || v.seg_enabled === true
    || c.wrp.some((item) => item.enabled !== false);

  if (!hasPublishedService) {
    push({
      level: 'warn',
      section: 'services',
      message: 'No edge service is enabled or published; the UAG will deploy without Horizon, Workspace ONE, or web reverse proxy access.'
    });
  }

  if (c.version >= '2609' && v.adminSaml_enable === true) {
    if (v.saml_enabled !== true) push({ level: 'error', section: 'auth', fieldId: 'saml_enabled', message: 'Administrator SAML requires matching SAML identity provider metadata.' });
    else if (nonEmpty('adminSaml_entityId') && v.adminSaml_entityId !== v.saml_entityID) push({ level: 'error', section: 'auth', fieldId: 'adminSaml_entityId', message: 'Administrator IdP entity ID must match the configured SAML identity provider.' });
  }

  if (!platformAvailable(c.platform, c.version)) {
    push({ level: 'error', section: 'network', message: `${def.label} deployment output is supported by Gateway Forge from UAG ${def.since}; select UAG ${def.since} or newer.` });
  }
  if (c.platform === 'nutanix') {
    push({ level: 'info', section: 'network', message: 'Nutanix: the uploaded QCOW2 image and the Prism Central subnets and cluster must already exist.' });
    push({ level: 'info', section: 'network', message: 'Nutanix minimum versions: Prism Central 2024.3, AOS 7.0 and AHV 10.0.' });
    push({ level: 'warn', section: 'network', fieldId: 'name', message: 'The official Nutanix script deletes and recreates an existing VM with the same name.' });
    if (v.ntnx_image && !/\.qcow2$/i.test(String(v.ntnx_image))) push({ level: 'error', section: 'network', fieldId: 'ntnx_image', message: 'The Nutanix UAG 2606+ image name must reference the native .qcow2 artifact.' });
  }
  if (c.platform === 'openshift') {
    push({ level: 'info', section: 'network', message: 'OpenShift virtualization deployment is Limited Availability and requires Omnissa-granted access.' });
    push({ level: 'info', section: 'network', message: 'OpenShift prerequisites are external: namespace, RWX-capable StorageClass, NADs, RBAC, cluster capacity and any referenced NetworkPolicies.' });
    if (v.ocp_volumeSourceMode === 'url' && v.ocp_qcow2Url) {
      try {
        if (!/\.qcow2$/i.test(new URL(String(v.ocp_qcow2Url)).pathname)) push({ level: 'error', section: 'network', fieldId: 'ocp_qcow2Url', message: 'The OpenShift image URL must point to a .qcow2 artifact.' });
      } catch {
        // The field rule reports malformed URLs.
      }
    }
    if (v.ocp_labels && !String(v.ocp_labels).split(',').every((x) => /^[^=,\s]+=[^,\s]+$/.test(x.trim()))) {
      push({ level: 'error', section: 'network', fieldId: 'ocp_labels', message: 'OpenShift labels must be comma-separated key=value entries.' });
    }
  }

  if (role === 'outer') {
    push({ level: 'info', section: 'horizon', fieldId: 'cascade_role', message: 'Outer UAG: Horizon edge service is replaced by a "Horizon-WRP" reverse proxy to the inner UAG. Set Blast/tunnel external URLs on the INNER UAG to this UAG\'s public FQDN.' });
    if (String(v.deploymentOption).startsWith('onenic')) push({ level: 'info', section: 'network', fieldId: 'deploymentOption', message: 'Cascade: use separate NICs/DMZ networks so the outer UAG can reach DMZ 2 only through the inter-DMZ firewall.' });
    if (!nonEmpty('cascade_innerThumbprints') && !['cascade_innerTrustedCert', ...Array.from({ length: 8 }, (_, i) => `cascade_innerTrustedCert${i + 2}`)].some(nonEmpty) && nonEmpty('cascade_innerUrl')) push({ level: 'info', section: 'horizon', fieldId: 'cascade_innerThumbprints', message: 'No inner UAG thumbprint or trusted CA certificate: required if the inner UAG uses a self-signed or private-CA certificate.' });
    if (v.cascade_fwdPcoipTcp === true !== (v.cascade_fwdPcoipUdp === true)) push({ level: 'warn', section: 'horizon', fieldId: 'cascade_fwdPcoipTcp', message: 'PCoIP needs both TCP and UDP 4172 forwarded.' });
  }
  if (role === 'inner') {
    push({ level: 'info', section: 'horizon', fieldId: 'cascade_role', message: 'Inner UAG: allow only the outer UAG\'s IPs through the inter-DMZ firewall, and point Blast/tunnel external URLs at the OUTER UAG\'s public FQDN.' });
    if (v.horizon_enabled !== true) push({ level: 'error', section: 'horizon', fieldId: 'horizon_enabled', message: 'The inner UAG of a cascade must have the Horizon edge service enabled.' });
  }

  if (v.airwatch_enabled === true) {
    const sharedContentGateway = v.contentGateway_enabled === true && v.contentGateway_mode === 'shared';
    if (v.airwatch_tunnelGatewayEnabled !== true && !sharedContentGateway) push({ level: 'error', section: 'tunnel', fieldId: 'airwatch_tunnelGatewayEnabled', message: 'Tunnel gateway must be enabled unless the shared [Airwatch] section is used for Content Gateway.' });
    if (v.airwatch_outboundProxyHost && isEmpty(v.airwatch_outboundProxyPort)) push({ level: 'error', section: 'tunnel', fieldId: 'airwatch_outboundProxyPort', message: 'Outbound proxy port is required when an outbound proxy host is set.' });
    if (!!v.airwatch_outboundProxyUsername !== !!v.airwatch_outboundProxyPassword) push({ level: 'warn', section: 'tunnel', fieldId: 'airwatch_outboundProxyPassword', message: 'Outbound proxy user and password should be configured together.' });
    if (v.airwatch_tunnelProxyEnabled === true || v.airwatch_airwatchOutboundProxy === true) push({ level: 'info', section: 'tunnel', message: 'Legacy 2212 proxy switches are present only for historical imports; current UAG releases do not document them.' });
    if (v.airwatch_pacFilePath && v.airwatch_pacFileURL) push({ level: 'warn', section: 'tunnel', fieldId: 'airwatch_pacFileURL', message: 'Both PAC file path and URL are set; the 2609 reference does not document how they interact.' });
  }
  if (typeof v.quiesceMode !== 'boolean') push({ level: 'error', section: 'general', fieldId: 'quiesceMode', message: 'Quiesce mode must be true or false.' });
  if (v.seg_enabled === true) {
    for (const field of GROUPS.find((g) => g.id === 'seg')!.fields.filter((f) => f.type === 'bool')) {
      if (typeof v[field.id] !== 'boolean') push({ level: 'error', section: 'seg', fieldId: field.id, message: `${field.label} must be true or false.` });
    }
    if ((v.seg_airwatchOutboundProxy === true || !isEmpty(v.seg_outboundProxyUsername) || !isEmpty(v.seg_outboundProxyPort)) && isEmpty(v.seg_outboundProxyHost)) push({ level: 'error', section: 'seg', fieldId: 'seg_outboundProxyHost', message: 'Outbound proxy host is required when proxy settings are configured.' });
    push({ level: 'info', section: 'seg', fieldId: 'seg_apiServerUsername', message: 'SEG API/proxy/PFX passwords are runtime-only. Settings JSON omits credentials and local certificate files; complete it through an approved admin/API workflow before applying. Environment-password deployment verifies that your script exposes awSEGAPIServerPwd.' });
  }
  if (v.contentGateway_enabled === true) {
    if (v.contentGateway_mode === 'shared') {
      if (v.airwatch_enabled !== true) push({ level: 'error', section: 'contentGateway', fieldId: 'contentGateway_mode', message: 'Shared Content Gateway requires the [Airwatch] UEM settings to be enabled in Workspace ONE Tunnel.' });
      push({ level: 'info', section: 'contentGateway', fieldId: 'contentGateway_mode', message: 'Shared mode uses the API URL, user, organization group, hostname, proxy, host entry and certificate inputs from Workspace ONE Tunnel.' });
    } else {
      if (v.contentGateway_outboundProxyHost && isEmpty(v.contentGateway_outboundProxyPort)) push({ level: 'error', section: 'contentGateway', fieldId: 'contentGateway_outboundProxyPort', message: 'Outbound proxy port is required when an outbound proxy host is set.' });
      if (v.contentGateway_outboundProxyUsername) push({ level: 'info', section: 'contentGateway', fieldId: 'contentGateway_outboundProxyUsername', message: 'The official deployment script prompts for the outbound proxy password; Gateway Forge does not store or export it.' });
    }
  }

  if (c.syslog.length === 0) push({ level: 'warn', section: 'monitoring', message: 'No syslog server configured - events stay on the appliance.' });
  if (!nonEmpty('ntpServers')) push({ level: 'warn', section: 'network', fieldId: 'ntpServers', message: 'No NTP server configured - clock drift breaks TLS, RADIUS and SAML.' });

  if (cmpVersion(c.version, TLS_LEGACY_UNTIL) < 0 && (v.tls10Enabled === true || v.tls11Enabled === true)) push({ level: 'warn', section: 'tls', fieldId: 'tls11Enabled', message: 'TLS 1.0/1.1 are enabled - disable them.' });
  if (v.tls12Enabled !== true && (v.tls13Enabled !== true || c.version < '2412')) push({ level: 'error', section: 'tls', fieldId: 'tls12Enabled', message: 'No modern TLS version enabled (TLS 1.2 or 1.3 required).' });
  if (!nonEmpty('cert_pemCerts') && !nonEmpty('cert_pfxCerts')) push({ level: 'warn', section: 'tls', message: 'No server certificate configured - the appliance keeps its self-signed certificate. Use a CA-signed cert in production.' });

  if (v.sshEnabled === true) {
    const rawPort = isEmpty(v.sshPort) ? 22 : v.sshPort;
    const port = typeof rawPort === 'number' || typeof rawPort === 'string' ? Number(rawPort) : NaN;
    const validPort = Number.isInteger(port) && port >= 1 && port <= 65535;
    push({ level: 'warn', section: 'general', fieldId: 'sshEnabled', message: validPort
      ? `SSH is enabled - restrict TCP/${port} to admin source IPs or use console access.`
      : 'SSH is enabled - configure a valid SSH port before defining the firewall restriction; restrict access to admin source IPs or use console access.' });
    if (v.sshPasswordAccessEnabled === true) push({ level: 'warn', section: 'general', fieldId: 'sshPasswordAccessEnabled', message: 'SSH password authentication is enabled - prefer key-based access.' });
  }
  if (c.platform !== 'openshift' && v.run_noSSLVerify === true) push({ level: 'warn', section: 'network', fieldId: 'run_noSSLVerify', message: '-noSSLVerify is on: the deployment script will not verify SSL/TLS certificates. Avoid in production.' });
  if (c.platform === 'vsphere' && v.run_disableVerification === true) push({ level: 'warn', section: 'network', fieldId: 'run_disableVerification', message: '-disableVerification is on: the OVA/OVF signature and certificate chain are not validated. Only use with an image you downloaded from Omnissa and verified yourself.' });
  if (v.ceipEnabled === true) push({ level: 'info', section: 'general', fieldId: 'ceipEnabled', message: 'CEIP is enabled - the appliance sends telemetry to Omnissa.' });

  const sshInterface = String(v.sshInterface ?? '');
  const nicCount = deploymentNicCount(v);
  if (v.sshEnabled === true && sshInterface && Number(sshInterface.slice(3)) >= nicCount) {
    push({ level: 'error', section: 'general', fieldId: 'sshInterface', message: `${sshInterface} is not present in the selected ${nicCount}-NIC deployment.` });
  }
  const staticIpv6 = String(v.v6ip0 ?? '');
  if (staticIpv6 && !String(v.ipmode0 ?? '').includes('STATICV6')) {
    push({ level: 'warn', section: 'network', fieldId: 'ipmode0', message: 'NIC0 has a static IPv6 address but ipmode0 does not include STATICV6.' });
  }
  if (nicCount === 1) {
    for (const key of ['routes1', 'routes2', 'eth1CustomConfig', 'eth2CustomConfig']) {
      if (nonEmpty(key)) push({ level: 'error', section: 'network', fieldId: key, message: `${key} is configured but the selected deployment has only NIC0.` });
    }
  } else if (nicCount === 2 && (nonEmpty('routes2') || nonEmpty('eth2CustomConfig'))) {
    for (const key of ['routes2', 'eth2CustomConfig']) {
      if (nonEmpty(key)) push({ level: 'error', section: 'network', fieldId: key, message: `${key} is configured but the selected two-NIC deployment has no NIC2.` });
    }
  }

  const latest = VERSIONS.find((x) => x.latest);
  const deploymentWarning = olderDeploymentWarning(c.version, latest?.id);
  if (deploymentWarning) push({ level: 'warn', section: 'general', message: deploymentWarning });
  if (latest && c.version !== latest.id) push({ level: 'info', section: 'general', message: `UAG ${latest.id} is available; you are targeting ${c.version}. Stay current for security fixes.` });

  if (String(v.deploymentOption).startsWith('onenic') && v.gatewayLocation === 'external' && horizon) push({ level: 'info', section: 'network', fieldId: 'deploymentOption', message: 'Single-NIC deployment: for DMZ use consider twonic/threenic to separate Internet, management and backend traffic.' });

  const ip0 = String(v.ip0 ?? '');
  const activeIpIds = ['ip0', 'ip1', 'ip2'].slice(0, deploymentNicCount(v));
  const usesStaticIpv4 = (id: string) => {
    const nic = id.slice(-1);
    if (c.platform === 'nutanix' || c.platform === 'openshift') return v[`ipMode${nic}`] === 'STATICV4';
    const mode = String(v[`ipmode${nic}`] ?? '');
    return mode === '' || mode.includes('STATICV4');
  };
  const activeStaticIps = activeIpIds
    .filter(usesStaticIpv4)
    .map((k) => String(v[k] ?? ''))
    .filter(Boolean);
  if (c.platform !== 'azure' && new Set(activeStaticIps).size !== activeStaticIps.length) {
    push({ level: 'error', section: 'network', message: 'Two applicable NICs share the same IP address.' });
  }
  const staticNic0 = usesStaticIpv4('ip0');
  if (staticNic0 && ip0 && nonEmpty('netmask0') && nonEmpty('defaultGateway')) {
    const a = netOf(ip0, String(v.netmask0));
    const b = netOf(String(v.defaultGateway), String(v.netmask0));
    if (a !== null && b !== null && a !== b) push({ level: 'warn', section: 'network', fieldId: 'defaultGateway', message: 'Default gateway is not in the NIC0 subnet.' });
  }

  if (horizon) {
    const url = String(v.proxyDestinationUrl ?? '');
    if (url && validUrl(url, true) && !nonEmpty('proxyDestinationUrlThumbprints') && !Array.from({ length: 9 }, (_, i) => `trustedCert${i + 1}`).some(nonEmpty)) push({ level: 'warn', section: 'horizon', fieldId: 'trustedCert1', message: 'No Connection Server thumbprint or trusted CA certificate: one of them is required if its certificate is self-signed or from a private CA.' });
    const tp = String(v.proxyDestinationUrlThumbprints ?? '');
    if (tp && tp.split(',').some((e) => parseThumbprint(e)?.alg === 'sha1')) push({ level: 'warn', section: 'horizon', fieldId: 'proxyDestinationUrlThumbprints', message: 'SHA-1 thumbprint in use - prefer SHA-256 or stronger.' });
    if (v.minSHAHashSize === 'SHA-1' && c.version >= '2312') push({ level: 'warn', section: 'horizon', fieldId: 'minSHAHashSize', message: 'Minimum SHA hash size is SHA-1, which is not recommended.' });
    if (v.blastEnabled === true && !nonEmpty('blastExternalUrl')) push({ level: 'warn', section: 'horizon', fieldId: 'blastExternalUrl', message: 'Blast is enabled without an external URL - clients are sent the appliance IP instead of your public FQDN.' });
    if (v.tunnelEnabled === true && c.version >= '2412' && !nonEmpty('tunnelExternalUrl')) push({ level: 'info', section: 'horizon', fieldId: 'tunnelExternalUrl', message: 'Tunnel external URL is not set.' });
    if (v.pcoipEnabled === true && !nonEmpty('pcoipExternalUrl')) push({ level: 'warn', section: 'horizon', fieldId: 'pcoipExternalUrl', message: 'PCoIP is enabled without an external URL (IPv4:4172).' });
    if (v.authMethods === 'passthrough' && v.gatewayLocation === 'external') push({ level: 'warn', section: 'horizon', fieldId: 'authMethods', message: 'External gateway with passthrough authentication - no MFA in the DMZ. Consider RADIUS or SAML.' });
    const usesRadius = String(v.authMethods).startsWith('radius-auth') || v.authMethods === 'certificate-auth-and-radius-auth';
    const usesSaml = String(v.authMethods).startsWith('saml-auth') || v.authMethods === 'device-certificate-auth-and-saml-auth';
    const usesUnauthenticated = String(v.authMethods).includes('unauthenticated');
    if (usesRadius && v.radius_enabled !== true) push({ level: 'error', section: 'auth', message: 'Horizon uses RADIUS authentication but RADIUS is not configured.' });
    if (usesSaml && v.saml_enabled !== true) push({ level: 'error', section: 'auth', message: 'Horizon uses SAML authentication but no SAML identity provider is configured.' });
    if (v.authMethods === 'oidc-auth' && v.oidc_enabled !== true) push({ level: 'error', section: 'auth', message: 'Horizon uses OpenID Connect authentication but no OIDC provider is configured.' });
    if (v.authMethods === 'oidc-auth' && listEnabled(LISTS.find((list) => list.id === 'oidc')!, c) && !isEmpty(v.horizon_oidcConfigurationId)
      && ![v.oidc_oidcConfigurationId, ...c.oidc.map((provider) => provider.oidcConfigurationId)].includes(v.horizon_oidcConfigurationId)) {
      push({ level: 'error', section: 'horizon', fieldId: 'horizon_oidcConfigurationId', message: 'OIDC configuration ID does not match a configured provider in Identity and access. The selected ID is retained.' });
    }
    if (String(v.authMethods).startsWith('securid-auth') && v.securid_enabled !== true) push({ level: 'error', section: 'auth', message: 'Horizon uses RSA SecurID authentication but RSA SecurID is not configured.' });
    if (String(v.authMethods).includes('certificate-auth') && v.certauth_enabled !== true) push({ level: 'error', section: 'auth', message: 'Horizon uses certificate authentication but it is not configured.' });
    if (usesUnauthenticated && v.gatewayLocation !== 'internal') push({ level: 'error', section: 'horizon', fieldId: 'gatewayLocation', message: 'Unauthenticated Horizon authentication methods require Gateway location "internal".' });
    if (v.originCheckEnabled === false) push({ level: 'warn', section: 'horizon', fieldId: 'originCheckEnabled', message: 'Origin header check is disabled - leaves Horizon web access open to cross-origin requests.' });
    if (v.clientEncryptionMode === 'DISABLED') push({ level: 'warn', section: 'horizon', fieldId: 'clientEncryptionMode', message: 'Client encryption mode is DISABLED.' });
    const extra = String(v.additionalBlastExternalUrls ?? '').split(',').map((x) => hostOf(x.trim())).filter(Boolean);
    const all = [hostOf(String(v.blastExternalUrl ?? '')), ...extra].filter(Boolean);
    if (new Set(all).size !== all.length) push({ level: 'error', section: 'horizon', fieldId: 'additionalBlastExternalUrls', message: 'Blast external URLs must be unique by host name.' });
    const extraTunnel = String(v.additionalTunnelExternalUrls ?? '').split(',').map((x) => hostOf(x.trim())).filter(Boolean);
    const allTunnel = [hostOf(String(v.tunnelExternalUrl ?? '')), ...extraTunnel].filter(Boolean);
    if (new Set(allTunnel).size !== allTunnel.length) push({ level: 'error', section: 'horizon', fieldId: 'additionalTunnelExternalUrls', message: 'Tunnel external URLs must be unique by host name.' });
    if (v.pcoipDisableLegacyCertificate === true) push({ level: 'info', section: 'horizon', fieldId: 'pcoipDisableLegacyCertificate', message: 'Legacy PCoIP clients cannot connect while the legacy PCoIP certificate is disabled.' });
    if (v.canonicalizationEnabled === false) push({ level: 'warn', section: 'horizon', fieldId: 'canonicalizationEnabled', message: 'Proxy-pattern canonicalization is disabled - encoded path traversal checks can be bypassed.' });
    if (v.endpointComplianceCheckProvider && v.complianceCheckOnAuthentication !== true) push({ level: 'info', section: 'horizon', fieldId: 'complianceCheckOnAuthentication', message: 'Endpoint compliance is checked at application launch but not immediately after authentication.' });
    for (const [index, detail] of parseOriginHeaderDetails(v.origin).entries()) {
      if (!validUrl(detail.origin, true) && !HOST.test(detail.origin)) push({ level: 'error', section: 'horizon', fieldId: 'origin', rowIndex: index, message: `Allowed origin ${index + 1} must be an https:// URL or hostname.` });
    }
  }

  if (v.radius_enabled === true) {
    if (v.radius_authType === 'PAP') push({ level: 'info', section: 'auth', fieldId: 'radius_authType', message: 'PAP sends the passcode obscured only by the shared secret - use a strong secret (or MSCHAP2 where supported).' });
    const mult = v.radius_enabledAux === true ? 2 : 1;
    if (mult * Number(v.radius_numAttempts) * Number(v.radius_serverTimeout) > 120) push({ level: 'error', section: 'auth', fieldId: 'radius_serverTimeout', message: `Attempts × timeout${mult === 2 ? ' × 2 servers' : ''} must not exceed 120 seconds.` });
    if (horizon && v.authMethods !== 'radius-auth') push({ level: 'info', section: 'auth', message: 'RADIUS is configured but the Horizon edge service does not use it.' });
  }
  if (v.snmp_enabled === true && v.snmp_version === 'V1+V2c' && (!nonEmpty('snmp_communityName') || String(v.snmp_communityName).toLowerCase() === 'public')) push({ level: 'warn', section: 'monitoring', fieldId: 'snmp_communityName', message: 'SNMP v1/v2c uses the default "public" community - set a custom one or use SNMPv3.' });

  const activeWrp = c.wrp.filter((item) => item.enabled !== false);
  const ids = activeWrp.map((i) => String(i.instanceId));
  c.wrp.forEach((item, index) => {
    if (item.enabled === false) return;
    if (ids.indexOf(String(item.instanceId)) !== activeWrp.indexOf(item) && item.instanceId) push({ level: 'error', section: 'wrp', list: { id: 'wrp', index }, fieldId: 'instanceId', message: `Duplicate web reverse proxy instance ID "${item.instanceId}".` });
  });
  c.syslog.forEach((item, index) => {
    if (item.sysLogType === 'UDP') push({ level: 'info', section: 'monitoring', list: { id: 'syslog', index }, message: `Syslog server ${index + 1} uses UDP (unencrypted, unreliable) - prefer TLS.` });
  });
  const adminNames = c.adminUsers.map((item) => String(item.name).toLocaleLowerCase());
  c.adminUsers.forEach((item, index) => {
    if (adminNames.indexOf(String(item.name).toLocaleLowerCase()) !== index && item.name) {
      push({
        level: 'error',
        section: 'adminUsers',
        list: { id: 'adminUsers', index },
        fieldId: 'name',
        message: `Duplicate additional admin user name "${item.name}".`
      });
    }
  });
}

export function countBySection(issues: Issue[]): Record<SectionId, { error: number; warn: number; info: number }> {
  const out = {} as Record<SectionId, { error: number; warn: number; info: number }>;
  for (const section of SECTIONS) out[section.id] = { error: 0, warn: 0, info: 0 };
  for (const i of issues) out[i.section][i.level]++;
  return out;
}
