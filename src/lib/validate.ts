import { GROUPS, LISTS, deploymentNicCount, type Field, type Rule, type SectionId, type Values } from './schema';
import { fieldAvailable, groupEnabled, isEmpty, type Config } from './model';
import { cascadeRole } from './cascade';
import { TLS_LEGACY_UNTIL, VERSIONS, cmpVersion } from './versions';
import { parseOriginHeaderDetails } from './generate';
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
const DNS_DOMAIN = /^(?=.{1,253}\.?$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*\.?$/;

export const isIpv4 = (s: string) => IPV4.test(s);

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
    case 'dnsDomain':
      return DNS_DOMAIN.test(s) && !IPV4.test(s.replace(/\.$/, '')) ? null : 'Not a valid DNS search domain';
    case 'hostOrIp':
      return hostPort(s) ? null : 'Not a valid host name, IP address or host:port';
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
      return /^[\x20-\x7e]*$/.test(s) ? null : 'ASCII characters only; use literal \\n for line breaks';
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
  if (f.maxLength !== undefined && String(v).length > f.maxLength) return `${f.label} must be at most ${f.maxLength} characters`;
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

  if (v.airwatch_enabled === true) {
    if (v.airwatch_tunnelGatewayEnabled !== true) push({ level: 'error', section: 'tunnel', fieldId: 'airwatch_tunnelGatewayEnabled', message: 'Tunnel gateway must be enabled for the [Airwatch] section to configure an active Tunnel service.' });
    if (v.airwatch_outboundProxyHost && isEmpty(v.airwatch_outboundProxyPort)) push({ level: 'error', section: 'tunnel', fieldId: 'airwatch_outboundProxyPort', message: 'Outbound proxy port is required when an outbound proxy host is set.' });
    if (!!v.airwatch_outboundProxyUsername !== !!v.airwatch_outboundProxyPassword) push({ level: 'warn', section: 'tunnel', fieldId: 'airwatch_outboundProxyPassword', message: 'Outbound proxy user and password should be configured together.' });
    if (v.airwatch_tunnelProxyEnabled === true || v.airwatch_airwatchOutboundProxy === true) push({ level: 'info', section: 'tunnel', message: 'Legacy 2212 proxy switches are present only for historical imports; current UAG releases do not document them.' });
    if (v.airwatch_pacFilePath && v.airwatch_pacFileURL) push({ level: 'warn', section: 'tunnel', fieldId: 'airwatch_pacFileURL', message: 'Both PAC file path and URL are set; the 2609 reference does not document how they interact.' });
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
  if (latest && c.version !== latest.id) push({ level: 'info', section: 'general', message: `UAG ${latest.id} is available; you are targeting ${c.version}. Stay current for security fixes.` });

  if (String(v.deploymentOption).startsWith('onenic') && v.gatewayLocation === 'external' && horizon) push({ level: 'info', section: 'network', fieldId: 'deploymentOption', message: 'Single-NIC deployment: for DMZ use consider twonic/threenic to separate Internet, management and backend traffic.' });

  const ip0 = String(v.ip0 ?? '');
  const activeIpIds = ['ip0', 'ip1', 'ip2'].slice(0, deploymentNicCount(v));
  const ips = activeIpIds.map((k) => String(v[k] ?? '')).filter(Boolean);
  if ((c.platform === 'vsphere' || c.platform === 'hyperv') && new Set(ips).size !== ips.length) {
    push({ level: 'error', section: 'network', message: 'Two applicable NICs share the same IP address.' });
  }
  if ((c.platform === 'vsphere' || c.platform === 'hyperv') && ip0 && nonEmpty('netmask0') && nonEmpty('defaultGateway')) {
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
      if (!validUrl(detail.origin, true) && !HOST.test(detail.origin)) push({ level: 'error', section: 'horizon', fieldId: 'origin', message: `Allowed origin ${index + 1} must be an https:// URL or hostname.` });
    }
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
  for (const s of ['general', 'network', 'horizon', 'tunnel', 'wrp', 'auth', 'tls', 'monitoring', 'templates'] as SectionId[]) out[s] = { error: 0, warn: 0, info: 0 };
  for (const i of issues) out[i.section][i.level]++;
  return out;
}
