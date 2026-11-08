import { GROUPS, LISTS, type Field, type Rule, type SectionId, type Values } from './schema';
import { fieldAvailable, groupEnabled, isEmpty, type Config } from './model';
import { cascadeRole } from './cascade';
import { TLS_LEGACY_UNTIL, VERSIONS, cmpVersion } from './versions';
import { sshPublicKeyValidationError } from './ssh';
import { parseListValue } from './listValue';

export type Level = 'error' | 'warn' | 'info';

export interface Issue {
  id: string;
  level: Level;
  section: SectionId;
  message: string;
  fieldId?: string;
  /** For list items: list id and 0-based index. */
  list?: { id: 'wrp' | 'syslog'; index: number };
  /** For a row within a string-backed multi-value field. */
  rowIndex?: number;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HOST = /^(?=.{1,253}$)([A-Za-z0-9_]([A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?)(\.[A-Za-z0-9_]([A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?)*$/;

export const isIpv4 = (s: string) => IPV4.test(s);

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

const HASH_LEN: Record<string, number> = { sha1: 40, sha256: 64, sha384: 96, sha512: 128 };

export function parseThumbprint(entry: string): { alg: string; hex: string } | null {
  const m = /^\s*(?:(sha1|sha256|sha384|sha512)\s*=\s*)?(.+?)\s*$/i.exec(entry);
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
  for (const entry of s.split(',').filter((e) => e.trim())) {
    const t = parseThumbprint(entry);
    if (!t) return `"${entry.trim()}" is not a valid thumbprint ([alg=]xx:xx:…)`;
    if (t.hex.length !== HASH_LEN[t.alg]) return `${t.alg} thumbprint must be ${HASH_LEN[t.alg] / 2} bytes (got ${t.hex.length / 2})`;
  }
  return null;
}

export function checkRule(rule: Rule, raw: string): string | null {
  const s = raw.trim();
  switch (rule) {
    case 'ipv4':
      return IPV4.test(s) ? null : 'Not a valid IPv4 address';
    case 'hostOrIp':
      return hostPort(s) ? null : 'Not a valid host name, IP address or host:port';
    case 'hostList':
      return s.split(/[\s,]+/).filter(Boolean).every(hostPort) ? null : 'Contains an invalid host name or IP address';
    case 'ipList':
      return s.split(/[\s,]+/).filter(Boolean).every((x) => IPV4.test(x)) ? null : 'Contains an invalid IPv4 address';
    case 'url':
      return validUrl(s, false) ? null : 'Not a valid http(s) URL';
    case 'httpsUrl':
      return validUrl(s, true) ? null : 'Must be a valid https:// URL';
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
    case 'ipv4Port': {
      const [ip, port] = s.split(':');
      return IPV4.test(ip) && (port === undefined || (Number(port) >= 1 && Number(port) <= 65535)) ? null : 'Must be an IPv4 address with optional :port';
    }
    case 'path':
      return s.startsWith('/') ? null : 'Must start with "/"';
    case 'pemPath': {
      const absolute = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(s);
      if (!absolute) return 'Must be an absolute local path (Windows, UNC, or Unix)';
      if (!/\.pem$/i.test(s)) return 'Must point to a .pem file';
      return null;
    }
    case 'int':
      return /^-?\d+$/.test(s) ? null : 'Must be an integer';
  }
}

function checkField(f: Field, values: Values): string | null {
  const v = values[f.id];
  const required = typeof f.required === 'function' ? f.required(values) : f.required;
  if (isEmpty(v)) return required ? `${f.label} is required` : null;
  if (f.type === 'number') {
    const n = Number(v);
    if (!Number.isFinite(n)) return `${f.label} must be a number`;
    if (f.min !== undefined && n < f.min) return `${f.label} must be ≥ ${f.min}`;
    if (f.max !== undefined && n > f.max) return `${f.label} must be ≤ ${f.max}`;
  }
  if (f.rule && f.type !== 'bool') {
    const err = checkRule(f.rule, String(v));
    if (err) return `${f.label}: ${err}`;
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

  for (const g of GROUPS) {
    if (!groupEnabled(g, c)) continue;
    for (const f of g.fields) {
      if (!fieldAvailable(f, c.version, c.platform, v)) continue;
      if (f.rows) {
        const rows = parseListValue(v[f.id]);
        if (rows.length === 0) {
          const required = typeof f.required === 'function' ? f.required(v) : f.required;
          if (required) push({ level: 'error', section: g.section, fieldId: f.id, message: `${f.label} is required` });
          continue;
        }
        rows.forEach((row, index) => {
          const error = checkRule(f.rows!.rule, row);
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
      const msg = checkField(f, v);
      if (msg) push({ level: 'error', section: g.section, fieldId: f.id, message: msg });
    }
  }
  for (const l of LISTS) {
    c[l.id].forEach((item, index) => {
      for (const f of l.fields) {
        if (!fieldAvailable(f, c.version, c.platform, item)) continue;
        const msg = checkField(f, item);
        if (msg) push({ level: 'error', section: l.section, fieldId: f.id, message: `${l.itemLabel} ${index + 1}: ${msg}`, list: { id: l.id, index } });
      }
    });
  }

  lint(c, push);
  return issues;
}

type Push = (i: Omit<Issue, 'id'>) => void;

function lint(c: Config, push: Push): void {
  const v = c.values;
  const role = cascadeRole(v);
  const horizon = v.horizon_enabled === true && role !== 'outer';
  const nonEmpty = (k: string) => !isEmpty(v[k]);

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

  if (c.syslog.length === 0) push({ level: 'warn', section: 'monitoring', message: 'No syslog server configured - events stay on the appliance.' });
  if (!nonEmpty('ntpServers')) push({ level: 'warn', section: 'network', fieldId: 'ntpServers', message: 'No NTP server configured - clock drift breaks TLS, RADIUS and SAML.' });

  if (cmpVersion(c.version, TLS_LEGACY_UNTIL) < 0 && (v.tls10Enabled === true || v.tls11Enabled === true)) push({ level: 'warn', section: 'tls', fieldId: 'tls11Enabled', message: 'TLS 1.0/1.1 are enabled - disable them.' });
  if (v.tls12Enabled !== true && (v.tls13Enabled !== true || c.version < '2412')) push({ level: 'error', section: 'tls', fieldId: 'tls12Enabled', message: 'No modern TLS version enabled (TLS 1.2 or 1.3 required).' });
  if (!nonEmpty('cert_pemCerts') && !nonEmpty('cert_pfxCerts')) push({ level: 'info', section: 'tls', message: 'No server certificate configured - the appliance keeps its self-signed certificate. Use a CA-signed cert in production.' });

  if (v.sshEnabled === true) {
    push({ level: 'warn', section: 'general', fieldId: 'sshEnabled', message: 'SSH is enabled - restrict TCP/22 to admin source IPs or use console access.' });
    if (v.sshPasswordAccessEnabled === true) push({ level: 'warn', section: 'general', fieldId: 'sshPasswordAccessEnabled', message: 'SSH password authentication is enabled - prefer key-based access.' });
  }
  if (v.run_noSSLVerify === true) push({ level: 'warn', section: 'network', fieldId: 'run_noSSLVerify', message: '-noSSLVerify is on: the deployment script will not verify SSL/TLS certificates. Avoid in production.' });
  if (c.platform === 'vsphere' && v.run_disableVerification === true) push({ level: 'warn', section: 'network', fieldId: 'run_disableVerification', message: '-disableVerification is on: the OVA/OVF signature and certificate chain are not validated. Only use with an image you downloaded from Omnissa and verified yourself.' });
  if (v.ceipEnabled === true) push({ level: 'info', section: 'general', fieldId: 'ceipEnabled', message: 'CEIP is enabled - the appliance sends telemetry to Omnissa.' });

  const latest = VERSIONS.find((x) => x.latest);
  if (latest && c.version !== latest.id) push({ level: 'info', section: 'general', message: `UAG ${latest.id} is available; you are targeting ${c.version}. Stay current for security fixes.` });

  if (String(v.deploymentOption).startsWith('onenic') && v.gatewayLocation === 'external' && horizon) push({ level: 'info', section: 'network', fieldId: 'deploymentOption', message: 'Single-NIC deployment: for DMZ use consider twonic/threenic to separate Internet, management and backend traffic.' });

  const ip0 = String(v.ip0 ?? '');
  const ips = ['ip0', 'ip1', 'ip2'].map((k) => String(v[k] ?? '')).filter(Boolean);
  if (new Set(ips).size !== ips.length) push({ level: 'error', section: 'network', message: 'Two NICs share the same IP address.' });
  if (ip0 && nonEmpty('netmask0') && nonEmpty('defaultGateway')) {
    const a = netOf(ip0, String(v.netmask0));
    const b = netOf(String(v.defaultGateway), String(v.netmask0));
    if (a !== null && b !== null && a !== b) push({ level: 'warn', section: 'network', fieldId: 'defaultGateway', message: 'Default gateway is not in the NIC0 subnet.' });
  }

  if (horizon) {
    const url = String(v.proxyDestinationUrl ?? '');
    if (url && validUrl(url, true) && !nonEmpty('proxyDestinationUrlThumbprints') && !Array.from({ length: 9 }, (_, i) => `trustedCert${i + 1}`).some(nonEmpty)) push({ level: 'info', section: 'horizon', fieldId: 'trustedCert1', message: 'No Connection Server thumbprint or trusted CA certificate: one of them is required if its certificate is self-signed or from a private CA.' });
    const tp = String(v.proxyDestinationUrlThumbprints ?? '');
    if (tp && tp.split(',').some((e) => parseThumbprint(e)?.alg === 'sha1')) push({ level: 'warn', section: 'horizon', fieldId: 'proxyDestinationUrlThumbprints', message: 'SHA-1 thumbprint in use - prefer SHA-256 or stronger.' });
    if (v.minSHAHashSize === 'SHA-1' && c.version >= '2312') push({ level: 'warn', section: 'horizon', fieldId: 'minSHAHashSize', message: 'Minimum SHA hash size is SHA-1, which is not recommended.' });
    if (v.blastEnabled === true && !nonEmpty('blastExternalUrl')) push({ level: 'warn', section: 'horizon', fieldId: 'blastExternalUrl', message: 'Blast is enabled without an external URL - clients are sent the appliance IP instead of your public FQDN.' });
    if (v.tunnelEnabled === true && c.version >= '2412' && !nonEmpty('tunnelExternalUrl')) push({ level: 'info', section: 'horizon', fieldId: 'tunnelExternalUrl', message: 'Tunnel external URL is not set.' });
    if (v.pcoipEnabled === true && !nonEmpty('pcoipExternalUrl')) push({ level: 'warn', section: 'horizon', fieldId: 'pcoipExternalUrl', message: 'PCoIP is enabled without an external URL (IPv4:4172).' });
    if (v.authMethods === 'passthrough' && v.gatewayLocation === 'external') push({ level: 'warn', section: 'horizon', fieldId: 'authMethods', message: 'External gateway with passthrough authentication - no MFA in the DMZ. Consider RADIUS or SAML.' });
    if (v.authMethods === 'radius-auth' && v.radius_enabled !== true) push({ level: 'error', section: 'auth', message: 'Horizon uses RADIUS authentication but RADIUS is not configured.' });
    if (v.authMethods === 'saml-auth' && v.saml_enabled !== true) push({ level: 'error', section: 'auth', message: 'Horizon uses SAML authentication but no SAML identity provider is configured.' });
    if (v.authMethods === 'oidc-auth' && v.oidc_enabled !== true) push({ level: 'error', section: 'auth', message: 'Horizon uses OpenID Connect authentication but no OIDC provider is configured.' });
    if (v.authMethods === 'securid-auth' && v.securid_enabled !== true) push({ level: 'error', section: 'auth', message: 'Horizon uses RSA SecurID authentication but RSA SecurID is not configured.' });
    if (v.authMethods === 'certificate-auth' && v.certauth_enabled !== true) push({ level: 'error', section: 'auth', message: 'Horizon uses certificate authentication but it is not configured.' });
    if (v.originCheckEnabled === false) push({ level: 'warn', section: 'horizon', fieldId: 'originCheckEnabled', message: 'Origin header check is disabled - leaves Horizon web access open to cross-origin requests.' });
    if (v.clientEncryptionMode === 'DISABLED') push({ level: 'warn', section: 'horizon', fieldId: 'clientEncryptionMode', message: 'Client encryption mode is DISABLED.' });
    const extra = String(v.additionalBlastExternalUrls ?? '').split(',').map((x) => hostOf(x.trim())).filter(Boolean);
    const all = [hostOf(String(v.blastExternalUrl ?? '')), ...extra].filter(Boolean);
    if (new Set(all).size !== all.length) push({ level: 'error', section: 'horizon', fieldId: 'additionalBlastExternalUrls', message: 'Blast external URLs must be unique by host name.' });
  }

  if (v.radius_enabled === true) {
    if (v.radius_authType === 'PAP') push({ level: 'info', section: 'auth', fieldId: 'radius_authType', message: 'PAP sends the passcode obscured only by the shared secret - use a strong secret (or MSCHAP2 where supported).' });
    const mult = v.radius_enabledAux === true ? 2 : 1;
    if (mult * Number(v.radius_numAttempts) * Number(v.radius_serverTimeout) > 120) push({ level: 'error', section: 'auth', fieldId: 'radius_serverTimeout', message: `Attempts × timeout${mult === 2 ? ' × 2 servers' : ''} must not exceed 120 seconds.` });
    if (horizon && v.authMethods !== 'radius-auth') push({ level: 'info', section: 'auth', message: 'RADIUS is configured but the Horizon edge service does not use it.' });
  }
  if (v.snmp_enabled === true && v.snmp_version === 'V1+V2c' && (!nonEmpty('snmp_communityName') || String(v.snmp_communityName).toLowerCase() === 'public')) push({ level: 'warn', section: 'monitoring', fieldId: 'snmp_communityName', message: 'SNMP v1/v2c uses the default "public" community - set a custom one or use SNMPv3.' });

  const ids = c.wrp.map((i) => String(i.instanceId));
  c.wrp.forEach((item, index) => {
    if (ids.indexOf(String(item.instanceId)) !== index && item.instanceId) push({ level: 'error', section: 'wrp', list: { id: 'wrp', index }, fieldId: 'instanceId', message: `Duplicate web reverse proxy instance ID "${item.instanceId}".` });
  });
  c.syslog.forEach((item, index) => {
    if (item.sysLogType === 'UDP') push({ level: 'info', section: 'monitoring', list: { id: 'syslog', index }, message: `Syslog server ${index + 1} uses UDP (unencrypted, unreliable) - prefer TLS.` });
  });
}

export function countBySection(issues: Issue[]): Record<SectionId, { error: number; warn: number; info: number }> {
  const out = {} as Record<SectionId, { error: number; warn: number; info: number }>;
  for (const s of ['general', 'network', 'horizon', 'wrp', 'auth', 'tls', 'monitoring', 'templates'] as SectionId[]) out[s] = { error: 0, warn: 0, info: 0 };
  for (const i of issues) out[i.section][i.level]++;
  return out;
}
