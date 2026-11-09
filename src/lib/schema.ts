import { TLS_LEGACY_UNTIL, type Platform } from './versions';
import { certificateMode, type CertificateInput } from './certificate-input';

export type Primitive = string | number | boolean;
export type Values = Record<string, Primitive>;

export type FieldType = 'text' | 'number' | 'bool' | 'select' | 'secret' | 'textarea';

export type Rule =
  | 'ipv4'
  | 'netmask'
  | 'dnsDomain'
  | 'hostOrIp'
  | 'hostList'
  | 'hostPort'
  | 'ipList'
  | 'url'
  | 'httpsUrl'
  | 'httpsOrigin'
  | 'urlList'
  | 'port'
  | 'thumbprints'
  | 'pemPath'
  | 'pemKeyPath'
  | 'pfxPath'
  | 'sshPublicKeys'
  | 'uagName'
  | 'osLoginUsername'
  | 'ascii'
  | 'ipv4Port'
  | 'ipv6'
  | 'staticRoutes'
  | 'customConfig'
  | 'hostEntryList'
  | 'path'
  | 'int'
  | 'kubeName'
  | 'kubeNamespace'
  | 'hostPortList'
  | 'hostEntry'
  | 'redirectMappings'
  | 'sourceImage'
  | 'monitoringUserName';

export type SectionId = 'general' | 'adminUsers' | 'network' | 'horizon' | 'tunnel' | 'contentGateway' | 'wrp' | 'auth' | 'tls' | 'monitoring' | 'templates';

export type Target =
  | 'system'
  | 'deploy'
  | 'horizon'
  | 'airwatch'
  | 'airwatchContentGateway'
  | 'wrp'
  | 'radius'
  | 'saml'
  | 'snmp'
  | 'syslog'
  | 'certs'
  | 'adminUsers'
  | 'azure'
  | 'oidc'
  | 'securid'
  | 'certauth'
  | 'proxy'
  | 'cascade'
  | 'adminSaml';

export function deploymentNicCount(v: Values): 1 | 2 | 3 {
  const option = String(v.deploymentOption);
  if (option.startsWith('threenic')) return 3;
  if (option.startsWith('twonic')) return 2;
  return 1;
}

function usesStaticIpv4(v: Values, nic: 0 | 1 | 2): boolean {
  const mode = String(v[`ipmode${nic}`] ?? '');
  return mode === '' || mode.includes('STATICV4');
}

export interface Option {
  value: string;
  label?: string;
}

export interface Field {
  id: string;
  label: string;
  type: FieldType;
  /** INI key (case as documented by Omnissa). */
  key: string;
  /** JSON key in the settings document; defaults to `key`. `false` = not part of JSON. */
  json?: string | false;
  default?: Primitive;
  options?: Option[];
  help?: string | ((platform: Platform) => string);
  placeholder?: string;
  since?: string;
  until?: string;
  secret?: boolean;
  rule?: Rule;
  min?: number;
  max?: number;
  required?: boolean | ((v: Values) => boolean);
  showIf?: (v: Values) => boolean;
  platforms?: Platform[];
  /** Key or semantics require verification against the official source. */
  inferred?: boolean;
  /** Alternative INI spellings accepted during import (generation uses `key`). */
  aliases?: string[];
  /** 1-based position in an ordered trustedCert1-trustedCert9 field family. */
  trustedCertIndex?: number;
  hostEntryIndex?: number;
  certificateInput?: CertificateInput;
  wide?: boolean;
  maxLength?: number;
  /** Emit to INI only when the user sets it (not when equal to the documented default). */
  omitDefault?: boolean;
  /** A virtual deployment input that is used to build another artifact, not the INI. */
  ini?: false;
  /** For DHCP-capable platforms, emit this IPv4 input only when its NIC is STATICV4. */
  ipMode?: 0 | 1 | 2;
  /** This field needs format-specific output rather than a direct INI entry. */
  customOutput?: boolean;
  /** Edit a string-backed value as individually validated rows. */
  rows?: {
    itemLabel: string;
    rule: 'ipv4' | 'dnsDomain' | 'hostOrIp' | 'hostPort' | 'httpsUrl' | 'staticRoutes';
    separator?: 'space' | 'comma';
  };
}

export function fieldHelp(field: Field, platform: Platform): string | undefined {
  return typeof field.help === 'function' ? field.help(platform) : field.help;
}

export interface GroupDef {
  id: string;
  title: string;
  section: SectionId;
  target: Target;
  iniSection: string;
  help?: string;
  /** Boolean field id (virtual toggle) controlling whether the group is emitted. */
  enabledBy?: string;
  platforms?: Platform[];
  since?: string;
  fields: Field[];
}

export interface ListDef {
  id: 'wrp' | 'syslog' | 'adminUsers';
  title: string;
  itemLabel: string;
  section: SectionId;
  target: Target;
  iniSection: (n: number) => string;
  max: number;
  fields: Field[];
  help?: string;
}

export interface SectionDef {
  id: SectionId;
  title: string;
  icon: string;
}

export const SECTIONS: SectionDef[] = [
  { id: 'general', title: 'General', icon: '⚙' },
  { id: 'network', title: 'Network & deploy', icon: '🌐' },
  { id: 'horizon', title: 'Horizon', icon: '🖥' },
  { id: 'tunnel', title: 'Workspace ONE Tunnel', icon: '🚇' },
  { id: 'contentGateway', title: 'Workspace ONE Content Gateway', icon: '▣' },
  { id: 'wrp', title: 'Web reverse proxy', icon: '🔀' },
  { id: 'auth', title: 'Authentication', icon: '🔐' },
  { id: 'tls', title: 'TLS & certs', icon: '🔒' },
  { id: 'monitoring', title: 'Syslog & SNMP', icon: '📈' },
  { id: 'adminUsers', title: 'Additional admin users', icon: '👤' },
  { id: 'templates', title: 'Templates', icon: '📋' }
];

const bool = (id: string, label: string, key: string, def: boolean, extra: Partial<Field> = {}): Field => ({
  id,
  label,
  key,
  type: 'bool',
  default: def,
  ...extra
});
const text = (id: string, label: string, key: string, extra: Partial<Field> = {}): Field => ({
  id,
  label,
  key,
  type: 'text',
  ...extra
});
const num = (id: string, label: string, key: string, extra: Partial<Field> = {}): Field => ({
  id,
  label,
  key,
  type: 'number',
  ...extra
});
const sel = (id: string, label: string, key: string, options: (string | Option)[], extra: Partial<Field> = {}): Field => ({
  id,
  label,
  key,
  type: 'select',
  options: options.map((o) => (typeof o === 'string' ? { value: o } : o)),
  ...extra
});
const secret = (id: string, label: string, key: string, extra: Partial<Field> = {}): Field => ({
  id,
  label,
  key,
  type: 'secret',
  secret: true,
  ...extra
});

const usesRadius = (v: Values) => String(v.authMethods).startsWith('radius-auth') || v.authMethods === 'certificate-auth-and-radius-auth';
const usesSaml = (v: Values) => String(v.authMethods).startsWith('saml-auth') || v.authMethods === 'device-certificate-auth-and-saml-auth';
const usesSecurId = (v: Values) => String(v.authMethods).startsWith('securid-auth');
const usesCertificate = (v: Values) => String(v.authMethods).includes('certificate-auth');
const UAG_IP_MODES = [
  'STATICV4',
  'STATICV6',
  'DHCPV4',
  'DHCPV6',
  'AUTOV6',
  'STATICV4+STATICV6',
  'STATICV4+DHCPV6',
  'STATICV4+AUTOV6',
  'DHCPV4+STATICV6',
  'DHCPV4+DHCPV6',
  'DHCPV4+AUTOV6'
];

const trustedCertFields = (
  idFor: (index: number) => string,
  extra: Partial<Field> = {}
): Field[] =>
  Array.from({ length: 9 }, (_, offset) => {
    const index = offset + 1;
    return text(idFor(index), index === 1 ? 'Trusted CA certificate (PEM path)' : 'Additional trusted CA certificate (PEM path)', `trustedCert${index}`, {
      wide: true,
      json: false,
      rule: 'pemPath',
      trustedCertIndex: index,
      placeholder: index === 1 ? 'C:\\certs\\corp-root-ca.pem' : 'C:\\certs\\intermediate-ca.pem',
      ...extra
    });
  });

function certificateFields(
  prefix: string,
  label: string,
  keys: { cert: string; key: string; mode?: string; pfx?: string; alias?: string }
): Field[] {
  const selector = `${prefix}_mode`;
  const input: CertificateInput = {
    pemCert: `${prefix}_${keys.cert}`, pemKey: `${prefix}_${keys.key}`,
    ...(keys.pfx ? { pfx: `${prefix}_${keys.pfx}` } : {}),
    ...(keys.alias ? { alias: `${prefix}_${keys.alias}` } : {})
  };
  const mode = (v: Values) => certificateMode(v, selector, input);
  const pathStem = prefix === 'cert' ? 'internet-facing' : prefix === 'adminCert' ? 'management' : undefined;
  return [
    sel(selector, `${label} input mode`, keys.mode ?? selector, [
      { value: 'NONE', label: keys.mode ? 'No dedicated certificate' : 'Use appliance certificate' },
      { value: 'PEM', label: 'PEM certificate and private key' },
      ...(keys.pfx ? [{ value: 'PFX', label: 'PFX / PKCS#12 file' }] : [])
    ], {
      certificateInput: input, json: false, ...(keys.mode ? { omitDefault: true, default: 'NONE' } : { ini: false }),
      wide: true,
      help: keys.pfx
        ? 'Choose PEM or PFX, never both. Changing modes clears incompatible paths. The deployment script prompts interactively if the PFX is password-protected; no PFX password is stored or exported.'
        : 'The deployment script accepts PEM only for this dedicated SAML certificate. PFX is not supported. Metadata XML is configured separately.'
    }),
    text(input.pemCert, `${label} certificate chain (PEM path)`, keys.cert, {
      wide: true, rule: 'pemPath', json: false, showIf: (v) => mode(v) === 'PEM', required: (v) => mode(v) === 'PEM',
      ...(pathStem ? { placeholder: `C:\\certs\\${pathStem}-chain.pem` } : {})
    }),
    text(input.pemKey, `${label} private key (PEM path)`, keys.key, {
      wide: true, rule: 'pemKeyPath', json: false, showIf: (v) => mode(v) === 'PEM', required: (v) => mode(v) === 'PEM',
      ...(pathStem ? { placeholder: `C:\\certs\\${pathStem}-key.pem` } : {})
    }),
    ...(input.pfx && keys.pfx ? [
      text(input.pfx, `${label} PFX file`, keys.pfx, {
        wide: true, rule: 'pfxPath', json: false, showIf: (v) => mode(v) === 'PFX', required: (v) => mode(v) === 'PFX',
        ...(pathStem ? { placeholder: `C:\\certs\\${pathStem}.pfx` } : {})
      }),
      ...(input.alias && keys.alias ? [text(input.alias, `${label} PFX alias`, keys.alias, {
        json: false, showIf: (v) => mode(v) === 'PFX'
      })] : [])
    ] : [])
  ];
}

export const AUTH_METHODS: Option[] = [
  { value: 'passthrough', label: 'Passthrough (username/password)' },
  { value: 'radius-auth', label: 'RADIUS' },
  { value: 'radius-auth-and-unauthenticated', label: 'RADIUS and unauthenticated' },
  { value: 'saml-auth', label: 'SAML' },
  { value: 'saml-auth-and-passthrough', label: 'SAML and passthrough' },
  { value: 'saml-auth-and-unauthenticated', label: 'SAML and unauthenticated' },
  { value: 'securid-auth', label: 'RSA SecurID' },
  { value: 'securid-auth-and-unauthenticated', label: 'RSA SecurID and unauthenticated' },
  { value: 'certificate-auth', label: 'X.509 certificate' },
  { value: 'certificate-auth-and-passthrough', label: 'X.509 certificate or passthrough' },
  { value: 'certificate-auth-and-radius-auth', label: 'X.509 certificate or RADIUS' },
  { value: 'device-certificate-auth-and-passthrough', label: 'Device X.509 certificate and passthrough' },
  { value: 'device-certificate-auth-and-saml-auth', label: 'Device X.509 certificate and SAML' },
  { value: 'oidc-auth', label: 'OpenID Connect' }
];

const vsphereHyperv: Platform[] = ['vsphere', 'hyperv'];
export const GROUPS: GroupDef[] = [
  {
    id: 'cascade',
    title: 'Cascading (double DMZ)',
    section: 'horizon',
    target: 'cascade',
    iniSection: 'Cascade',
    help: 'For environments that mandate two DMZs: the OUTER UAG (DMZ 1) is only a web reverse proxy for the Horizon protocols and forwards to the INNER UAG (DMZ 2), which is a standard Horizon edge service. Create one config per appliance.',
    fields: [
      sel(
        'cascade_role',
        'This UAG is',
        'cascade_role',
        [
          { value: 'none', label: 'Standalone (single DMZ)' },
          { value: 'outer', label: 'Outer UAG - DMZ 1 (reverse proxy to inner UAG)' },
          { value: 'inner', label: 'Inner UAG - DMZ 2 (standard Horizon edge)' }
        ],
        { default: 'none', json: false }
      ),
      text('cascade_innerUrl', 'Inner UAG URL', 'cascade_innerUrl', {
        rule: 'httpsUrl',
        required: true,
        wide: true,
        placeholder: 'https://uag2-dmz.corp.local',
        showIf: (v) => v.cascade_role === 'outer',
        json: false,
        help: 'Address the outer UAG uses to reach the inner UAG (use the NAT address if NAT is in use between the DMZs).'
      }),
      text('cascade_innerThumbprints', 'Inner UAG thumbprint(s)', 'cascade_innerThumbprints', {
        rule: 'thumbprints',
        wide: true,
        showIf: (v) => v.cascade_role === 'outer',
        json: false,
        placeholder: 'sha256=ad:5c:f1:…',
        help: 'Needed when the inner UAG certificate is not from a trusted CA. Use the certificate or PowerShell method under Horizon settings.'
      }),
      ...trustedCertFields((n) => n === 1 ? 'cascade_innerTrustedCert' : `cascade_innerTrustedCert${n}`, {
        wide: true,
        showIf: (v) => v.cascade_role === 'outer',
        json: false,
        help: 'Alternative to the thumbprint: trust the CA that issued the inner UAG certificate. Up to nine ordered PEM paths are supported.'
      }),
      bool('cascade_opswat', 'Allow OPSWAT on-demand agent download (/gateway/resources)', 'cascade_opswat', false, {
        showIf: (v) => v.cascade_role === 'outer',
        wide: true,
        json: false,
        help: 'Only if OPSWAT endpoint compliance is configured on the inner UAG.'
      }),
      text('cascade_innerIp', 'Inner UAG IP (for forward rules)', 'cascade_innerIp', {
        rule: 'ipv4',
        placeholder: '192.168.2.101',
        showIf: (v) => v.cascade_role === 'outer',
        json: false,
        required: (v) => ['cascade_fwdBlastTcp', 'cascade_fwdBlastUdp', 'cascade_fwdUdpTunnel', 'cascade_fwdPcoipTcp', 'cascade_fwdPcoipUdp'].some((k) => v[k] === true)
      }),
      bool('cascade_fwdBlastTcp', 'Forward Blast TCP 8443', 'cascade_fwdBlastTcp', false, { showIf: (v) => v.cascade_role === 'outer', json: false }),
      bool('cascade_fwdBlastUdp', 'Forward Blast UDP 8443', 'cascade_fwdBlastUdp', false, { showIf: (v) => v.cascade_role === 'outer', json: false }),
      bool('cascade_fwdUdpTunnel', 'Forward UDP tunnel 443', 'cascade_fwdUdpTunnel', false, { showIf: (v) => v.cascade_role === 'outer', json: false }),
      bool('cascade_fwdPcoipTcp', 'Forward PCoIP TCP 4172', 'cascade_fwdPcoipTcp', false, { showIf: (v) => v.cascade_role === 'outer', json: false }),
      bool('cascade_fwdPcoipUdp', 'Forward PCoIP UDP 4172', 'cascade_fwdPcoipUdp', false, { showIf: (v) => v.cascade_role === 'outer', json: false })
    ]
  },
  {
    id: 'appliance',
    title: 'Appliance',
    section: 'general',
    target: 'system',
    iniSection: 'General',
    fields: [
      text('uagName', 'UAG name (OS hostname)', 'uagName', {
        rule: 'uagName',
        required: true,
        placeholder: 'uag-dmz-01',
        help: (platform) =>
          `Up to 24 characters: A-Z, 0-9, minus and period; no spaces.${platform === 'azure' ? ' Must match the VM name on Azure.' : ''}`
      }),
      bool('ceipEnabled', 'Join CEIP (Customer Experience Improvement Program)', 'ceipEnabled', false, {
        help: 'Sends telemetry to Omnissa from the appliance. Off by default in Gateway Forge.'
      }),
      bool('sshEnabled', 'Enable SSH', 'sshEnabled', false, { help: 'Not recommended; console access is normally sufficient.' }),
      num('sshPort', 'SSH port', 'sshPort', { default: 22, rule: 'port', showIf: (v) => v.sshEnabled === true }),
      sel('sshInterface', 'SSH interface', 'sshInterface', [
        '',
        { value: 'eth0', label: 'eth0 (NIC0)' },
        { value: 'eth1', label: 'eth1 (NIC1)' },
        { value: 'eth2', label: 'eth2 (NIC2)' }
      ], {
        showIf: (v) => v.sshEnabled === true,
        help: 'Empty enables SSH on all interfaces. The interface must exist in the selected deployment topology.'
      }),
      bool('sshPasswordAccessEnabled', 'SSH password access', 'sshPasswordAccessEnabled', false, { showIf: (v) => v.sshEnabled === true }),
      bool('sshKeyAccessEnabled', 'SSH key access', 'sshKeyAccessEnabled', true, { showIf: (v) => v.sshEnabled === true }),
      text('sshPublicKeys', 'SSH public keys', 'sshPublicKey1', {
        type: 'textarea',
        wide: true,
        rule: 'sshPublicKeys',
        json: 'sshPublicKeys',
        customOutput: true,
        required: (v) => v.sshEnabled === true && v.sshKeyAccessEnabled === true,
        showIf: (v) => v.sshEnabled === true && v.sshKeyAccessEnabled === true,
        placeholder: 'ssh-rsa AAAAB3NzaC1yc2E... administrator@workstation',
        help: 'Paste one OpenSSH RSA public key or existing .pub file path per line. INI uses numbered sshPublicKeyN file paths; PowerShell writes pasted keys as companion files.'
      }),
      text('sshLoginBannerText', 'Login banner text', 'sshLoginBannerText', {
        wide: true,
        rule: 'ascii',
        help: 'ASCII only. Use \\n for new lines.'
      }),
      text('osLoginUsername', 'High-privilege OS login user', 'osLoginUsername', {
        rule: 'osLoginUsername',
        help: 'a-z, 0-9, underscore, hyphen (max 32). When set, root login is disabled.'
      }),
      num('osMaxLoginLimit', 'High-privilege console login limit', 'osMaxLoginLimit', {
        default: 10,
        min: 1,
        omitDefault: true,
        showIf: (v) => String(v.osLoginUsername ?? '') !== '',
        help: 'Applies only when a high-privilege non-root login user is configured.'
      }),
      bool('dsComplianceOS', 'DISA STIG OS compliance', 'dsComplianceOS', false, { help: 'Use with the FIPS appliance when STIG compliance is required.' }),
      sel('secureRandomSource', 'Java secure random source', 'secureRandomSource', ['', '/dev/random', '/dev/urandom'], {
        json: false,
        wide: true,
        help: 'Deployment-only. Leave empty for the UAG/FIPS appliance default; changing it takes effect only during deployment.'
      }),
      text('headersToBeLogged', 'Headers to be logged', 'headersToBeLogged', {
        since: '2312',
        placeholder: 'X-Forwarded-For,host',
        help: 'Comma-separated list. Default is X-Forwarded-For.'
      }),
      bool('unrecognizedSessionsMonitoringEnabled', 'Monitor unrecognized sessions', 'unrecognizedSessionsMonitoringEnabled', true, {
        since: '2406'
      }),
      bool('tlsPortSharingEnabled', 'TLS port sharing', 'tlsPortSharingEnabled', true, { omitDefault: true })
    ]
  },
  {
    id: 'timeouts',
    title: 'Sessions & password policy',
    section: 'general',
    target: 'system',
    iniSection: 'General',
    fields: [
      num('sessionTimeout', 'Session timeout (ms)', 'sessionTimeout', { default: 36000000, min: 1, omitDefault: true }),
      num('adminSessionIdleTimeoutMinutes', 'Admin UI idle timeout (min)', 'adminSessionIdleTimeoutMinutes', { default: 10, min: 0, max: 1440 }),
      num('adminMaxConcurrentSessions', 'Admin max concurrent sessions', 'adminMaxConcurrentSessions', { default: 5, min: 1, max: 50, omitDefault: true }),
      num('adminPasswordExpirationDays', 'Admin password expiry (days)', 'adminpasswordExpirationDays', { default: 90, min: 0, max: 999, since: '2506', omitDefault: true }),
      num('adminPasswordPolicyMinLen', 'Admin password min length', 'adminpasswordPolicyMinLen', { default: 8, min: 8, max: 64, omitDefault: true }),
      num('adminPasswordPolicyFailedLockoutCount', 'Admin lockout after failed logins', 'adminpasswordPolicyFailedLockoutCount', { default: 3, min: 0, max: 10, omitDefault: true }),
      num('adminPasswordPolicyUnlockTime', 'Admin unlock time (min)', 'adminpasswordPolicyUnlockTime', { default: 5, min: 1, max: 9999, omitDefault: true }),
      num('rootPasswordExpirationDays', 'Root password expiry (days)', 'rootPasswordExpirationDays', { default: 365, min: 0, omitDefault: true }),
      num('rootSessionIdleTimeoutSeconds', 'Console idle timeout (s)', 'rootSessionIdleTimeoutSeconds', { default: 300, min: 0, max: 3600, omitDefault: true }),
      num('passwordPolicyMinLen', 'OS password min length', 'passwordPolicyMinLen', { default: 6, min: 6, max: 64, omitDefault: true }),
      num('passwordPolicyMinClass', 'OS password character classes', 'passwordPolicyMinClass', { default: 1, min: 1, max: 4, omitDefault: true }),
      num('passwordPolicyFailedLockout', 'OS lockout after failed logins', 'passwordPolicyFailedLockout', { default: 3, min: 0, max: 10, omitDefault: true }),
      num('passwordPolicyUnlockTime', 'OS unlock time (s)', 'passwordPolicyUnlockTime', { default: 900, min: 0, max: 3600, omitDefault: true, help: '0 permanently locks the console until an administrator unlocks it.' })
    ]
  },
  {
    id: 'deploy',
    title: 'Deployment',
    section: 'network',
    target: 'deploy',
    iniSection: 'General',
    help: 'Deployment-time values read by the uagdeploy scripts. They are not part of the settings JSON.',
    fields: [
      text('name', 'VM name', 'name', { required: true, placeholder: 'uag-dmz-01', rule: 'uagName', json: false }),
      sel(
        'deploymentOption',
        'Deployment option',
        'deploymentoption',
        [
          { value: 'onenic', label: 'onenic (2 vCPU / 4 GB)' },
          { value: 'twonic', label: 'twonic (2 vCPU / 4 GB)' },
          { value: 'threenic', label: 'threenic (2 vCPU / 4 GB)' },
          { value: 'onenic-large', label: 'onenic-large (4 vCPU / 8 GB)' },
          { value: 'twonic-large', label: 'twonic-large (4 vCPU / 8 GB)' },
          { value: 'threenic-large', label: 'threenic-large (4 vCPU / 8 GB)' },
          { value: 'onenic-XL', label: 'onenic-XL (8 vCPU / 32 GB)' },
          { value: 'twonic-XL', label: 'twonic-XL (8 vCPU / 32 GB)' },
          { value: 'threenic-XL', label: 'threenic-XL (8 vCPU / 32 GB)' }
        ],
        { default: 'twonic', required: true, json: false }
      ),
      text('source', 'Source image', 'source', {
        wide: true,
        required: true,
        rule: 'sourceImage',
        placeholder: 'C:\\ova\\euc-unified-access-gateway-26.09.0.0-xxxxxxxx_OVF10.ova',
        platforms: vsphereHyperv,
        help: (platform) => platform === 'hyperv'
          ? 'Local Hyper-V .vhdx path. URLs and VMware .ova files are not supported.'
          : 'Local .ova path or HTTP(S) URL ending in .ova.'
      }),
      text('target', 'vCenter target', 'target', {
        wide: true,
        required: true,
        platforms: ['vsphere'],
        placeholder: 'vi://administrator@vsphere.local@vcenter.corp.local/DC1/host/Cluster1',
        help: 'OVF Tool locator. Must reference a vCenter host or cluster; deploying directly to an ESXi host is not supported.'
      }),
      text('folder', 'VM folder', 'folder', { platforms: ['vsphere'], help: 'VMs and Templates folder; must exist.' }),
      text('ds', 'Datastore', 'ds', { platforms: vsphereHyperv, required: true, placeholder: 'datastore1' })
    ]
  },
  {
    id: 'networking',
    title: 'Networking',
    section: 'network',
    target: 'deploy',
    iniSection: 'General',
    platforms: vsphereHyperv,
    help: 'Virtual network mappings, IP addressing, routes and per-interface overrides for VMware and Hyper-V deployments.',
    fields: [
      text('netInternet', 'Internet network (NIC0)', 'netInternet', {
        platforms: vsphereHyperv,
        required: true,
        placeholder: 'DMZ-Internet',
        help: 'Connects the appliance Internet-facing interface.'
      }),
      text('netManagementNetwork', 'Management / Backend network (NIC1)', 'netManagementNetwork', {
        platforms: vsphereHyperv,
        required: true,
        showIf: (v) => deploymentNicCount(v) >= 2,
        help: 'Two NICs: NIC1 carries management and backend traffic. Three NICs: NIC1 is management-only; NIC2 is backend-only.'
      }),
      text('netBackendNetwork', 'Backend network (NIC2)', 'netBackendNetwork', {
        platforms: vsphereHyperv,
        required: true,
        showIf: (v) => deploymentNicCount(v) === 3,
        help: 'The dedicated Backend interface is available only with threenic.'
      }),
      text('ip0', 'NIC0 Internet IPv4 address', 'ip0', {
        rule: 'ipv4',
        platforms: vsphereHyperv,
        required: (v) => usesStaticIpv4(v, 0),
        showIf: (v) => usesStaticIpv4(v, 0),
        placeholder: '192.0.2.21'
      }),
      text('netmask0', 'NIC0 Internet netmask', 'netmask0', {
        rule: 'netmask',
        platforms: vsphereHyperv,
        required: (v) => usesStaticIpv4(v, 0),
        showIf: (v) => usesStaticIpv4(v, 0),
        placeholder: '255.255.255.0'
      }),
      text('ip1', 'NIC1 Management / Backend IPv4 address', 'ip1', {
        rule: 'ipv4',
        platforms: vsphereHyperv,
        required: (v) => usesStaticIpv4(v, 1),
        showIf: (v) => deploymentNicCount(v) >= 2 && usesStaticIpv4(v, 1),
        placeholder: '10.20.10.21'
      }),
      text('netmask1', 'NIC1 Management / Backend netmask', 'netmask1', {
        rule: 'netmask',
        platforms: vsphereHyperv,
        required: (v) => usesStaticIpv4(v, 1),
        showIf: (v) => deploymentNicCount(v) >= 2 && usesStaticIpv4(v, 1),
        placeholder: '255.255.255.0'
      }),
      text('ip2', 'NIC2 Backend IPv4 address', 'ip2', {
        rule: 'ipv4',
        platforms: vsphereHyperv,
        required: (v) => usesStaticIpv4(v, 2),
        showIf: (v) => deploymentNicCount(v) === 3 && usesStaticIpv4(v, 2),
        placeholder: '172.16.10.21'
      }),
      text('netmask2', 'NIC2 Backend netmask', 'netmask2', {
        rule: 'netmask',
        platforms: vsphereHyperv,
        required: (v) => usesStaticIpv4(v, 2),
        showIf: (v) => deploymentNicCount(v) === 3 && usesStaticIpv4(v, 2),
        placeholder: '255.255.255.0'
      }),
      text('defaultGateway', 'Default gateway', 'defaultGateway', {
        rule: 'ipv4',
        platforms: vsphereHyperv,
        required: (v) => usesStaticIpv4(v, 0),
        showIf: (v) => usesStaticIpv4(v, 0),
        placeholder: '192.0.2.1',
        help: 'IPv4 gateway on the NIC0 Internet network.'
      }),
      text('routes0', 'NIC0 static routes', 'routes0', {
        rule: 'staticRoutes',
        rows: { itemLabel: 'Static route', rule: 'staticRoutes', separator: 'comma' },
        platforms: vsphereHyperv,
        since: '2306',
        wide: true,
        placeholder: '10.108.172.32/32 10.108.172.253,192.168.20.0/24 10.0.0.1',
        help: 'Comma-separated CIDR-and-gateway pairs. Format: IPv4-network/prefix gateway-IPv4.'
      }),
      text('routes1', 'NIC1 static routes', 'routes1', {
        rule: 'staticRoutes',
        rows: { itemLabel: 'Static route', rule: 'staticRoutes', separator: 'comma' },
        platforms: vsphereHyperv,
        since: '2306',
        wide: true,
        showIf: (v) => deploymentNicCount(v) >= 2,
        placeholder: '192.168.20.0/24 192.168.10.1',
        help: 'Available only on two- and three-NIC deployments; same comma-separated CIDR-and-gateway format as routes0.'
      }),
      text('routes2', 'NIC2 static routes', 'routes2', {
        rule: 'staticRoutes',
        rows: { itemLabel: 'Static route', rule: 'staticRoutes', separator: 'comma' },
        platforms: vsphereHyperv,
        since: '2306',
        wide: true,
        showIf: (v) => deploymentNicCount(v) === 3,
        placeholder: '172.16.0.0/12 10.2.0.1',
        help: 'Available only on three-NIC deployments; same comma-separated CIDR-and-gateway format as routes0.'
      }),
      sel('ipmode0', 'NIC0 addressing mode', 'ipmode0', UAG_IP_MODES, {
        default: 'STATICV4',
        required: true,
        platforms: vsphereHyperv,
        since: '2306',
        help: 'Addressing mode for NIC0 / eth0.'
      }),
      sel('ipmode1', 'NIC1 addressing mode', 'ipmode1', UAG_IP_MODES, {
        default: 'STATICV4',
        required: (v) => deploymentNicCount(v) >= 2,
        platforms: vsphereHyperv,
        since: '2306',
        showIf: (v) => deploymentNicCount(v) >= 2,
        help: 'Addressing mode for NIC1 / eth1.'
      }),
      sel('ipmode2', 'NIC2 addressing mode', 'ipmode2', UAG_IP_MODES, {
        default: 'STATICV4',
        required: (v) => deploymentNicCount(v) === 3,
        platforms: vsphereHyperv,
        since: '2306',
        showIf: (v) => deploymentNicCount(v) === 3,
        help: 'Addressing mode for NIC2 / eth2.'
      }),
      text('v6ip0', 'NIC0 IPv6 address', 'v6ip0', {
        rule: 'ipv6',
        platforms: vsphereHyperv,
        since: '2506',
        placeholder: '2402:740:2:209::5',
        help: 'Only NIC0 IPv6 keys are documented; NIC1/NIC2 IPv6 keys are intentionally not inferred.'
      }),
      num('v6ipprefix0', 'NIC0 IPv6 prefix length', 'v6ipprefix0', {
        platforms: vsphereHyperv,
        since: '2506',
        min: 0,
        max: 128,
        placeholder: '64'
      }),
      text('v6DefaultGateway', 'IPv6 default gateway', 'v6DefaultGateway', {
        rule: 'ipv6',
        platforms: vsphereHyperv,
        since: '2506',
        placeholder: '2402:740:2:209::253'
      }),
      text('eth0CustomConfig', 'NIC0 systemd.network overrides', 'eth0CustomConfig', {
        rule: 'customConfig',
        platforms: vsphereHyperv,
        since: '2306',
        wide: true,
        placeholder: 'DHCP^UseDNS=false',
        help: 'Semicolon-separated Section^Parameter=Value entries. Use only documented systemd.network overrides.'
      }),
      text('eth1CustomConfig', 'NIC1 systemd.network overrides', 'eth1CustomConfig', {
        rule: 'customConfig',
        platforms: vsphereHyperv,
        since: '2306',
        showIf: (v) => deploymentNicCount(v) >= 2,
        wide: true,
        placeholder: 'DHCP^UseDomains=false'
      }),
      text('eth2CustomConfig', 'NIC2 systemd.network overrides', 'eth2CustomConfig', {
        rule: 'customConfig',
        platforms: vsphereHyperv,
        since: '2306',
        showIf: (v) => deploymentNicCount(v) === 3,
        wide: true,
        placeholder: 'Network^Domains=~.'
      })
    ]
  },
  {
    id: 'native-ipv4',
    title: 'QCOW2 platform networking',
    section: 'network',
    target: 'deploy',
    iniSection: 'General',
    platforms: ['nutanix', 'openshift'],
    help: 'Nutanix and OpenShift use the shared numeric ipModeN/ipN/netmaskN convention. DHCP suppresses stale static values; STATICV4 requires an address and netmask for that NIC.',
    fields: [
      sel('ipMode0', 'NIC0 IP mode', 'ipMode0', ['DHCPV4', 'STATICV4'], {
        default: 'STATICV4',
        required: true,
        json: false,
        help: 'NIC0 maps to eth0 and the first subnet/NAD.'
      }),
      text('ip0', 'NIC0 / eth0 IPv4 address', 'ip0', {
        rule: 'ipv4',
        placeholder: '192.0.2.21',
        ipMode: 0,
        required: (v) => v.ipMode0 === 'STATICV4',
        json: false
      }),
      text('netmask0', 'NIC0 / eth0 netmask', 'netmask0', {
        rule: 'netmask',
        placeholder: '255.255.255.0',
        ipMode: 0,
        required: (v) => v.ipMode0 === 'STATICV4',
        json: false
      }),
      text('defaultGateway', 'Default gateway', 'defaultGateway', {
        rule: 'ipv4',
        placeholder: '192.0.2.1',
        ipMode: 0,
        json: false
      }),
      sel('ipMode1', 'NIC1 IP mode', 'ipMode1', ['DHCPV4', 'STATICV4'], {
        default: 'STATICV4',
        showIf: (v) => deploymentNicCount(v) >= 2,
        required: (v) => deploymentNicCount(v) >= 2,
        json: false,
        help: 'NIC1 maps to eth1 and subnet1/NAD1.'
      }),
      text('ip1', 'NIC1 / eth1 IPv4 address', 'ip1', {
        rule: 'ipv4',
        placeholder: '10.20.10.21',
        showIf: (v) => deploymentNicCount(v) >= 2,
        ipMode: 1,
        required: (v) => v.ipMode1 === 'STATICV4',
        json: false
      }),
      text('netmask1', 'NIC1 / eth1 netmask', 'netmask1', {
        rule: 'netmask',
        placeholder: '255.255.255.0',
        showIf: (v) => deploymentNicCount(v) >= 2,
        ipMode: 1,
        required: (v) => v.ipMode1 === 'STATICV4',
        json: false
      }),
      sel('ipMode2', 'NIC2 IP mode', 'ipMode2', ['DHCPV4', 'STATICV4'], {
        default: 'STATICV4',
        showIf: (v) => deploymentNicCount(v) === 3,
        required: (v) => deploymentNicCount(v) === 3,
        json: false,
        help: 'NIC2 maps to eth2 and subnet2/NAD2.'
      }),
      text('ip2', 'NIC2 / eth2 IPv4 address', 'ip2', {
        rule: 'ipv4',
        placeholder: '172.16.10.21',
        showIf: (v) => deploymentNicCount(v) === 3,
        ipMode: 2,
        required: (v) => v.ipMode2 === 'STATICV4',
        json: false
      }),
      text('netmask2', 'NIC2 / eth2 netmask', 'netmask2', {
        rule: 'netmask',
        placeholder: '255.255.255.0',
        showIf: (v) => deploymentNicCount(v) === 3,
        ipMode: 2,
        required: (v) => v.ipMode2 === 'STATICV4',
        json: false
      })
    ]
  },
  {
    id: 'dns',
    title: 'DNS & time',
    section: 'network',
    target: 'system',
    iniSection: 'General',
    fields: [
      text('dns', 'DNS servers', 'dns', {
        rule: 'ipList',
        rows: { itemLabel: 'DNS server', rule: 'ipv4' },
        placeholder: '10.0.0.10',
        required: true,
        json: false,
        help: 'Add each IPv4 address on its own row.'
      }),
      text('dnsSearch', 'DNS search domains', 'dnsSearch', {
        rows: { itemLabel: 'DNS search domain', rule: 'dnsDomain' },
        placeholder: 'corp.local',
        json: false,
        help: 'Add each DNS search domain on its own row.'
      }),
      text('ntpServers', 'NTP servers', 'ntpServers', {
        rule: 'hostList',
        rows: { itemLabel: 'NTP server', rule: 'hostOrIp' },
        placeholder: 'pool.ntp.org',
        help: 'Add each hostname or IP address on its own row.'
      }),
      text('fallBackNtpServers', 'Fallback NTP servers', 'fallBackNtpServers', {
        rule: 'hostList',
        rows: { itemLabel: 'Fallback NTP server', rule: 'hostOrIp' }
      })
    ]
  },
  {
    id: 'nutanix',
    title: 'Nutanix AHV deployment',
    section: 'network',
    target: 'deploy',
    iniSection: 'Nutanix',
    platforms: ['nutanix'],
    since: '2606',
    help: 'The QCOW2 image must already be uploaded to Prism Central. Subnets and the target cluster must already exist. A VM with the same name is deleted and recreated by the official script.',
    fields: [
      text('ntnx_prismCentralUserName', 'Prism Central username', 'prismCentralUserName', { required: true, placeholder: 'user@domain.example', json: false }),
      text('ntnx_prismCentralAddress', 'Prism Central address', 'prismCentralAddress', { required: true, rule: 'hostOrIp', placeholder: 'prism.corp.local', json: false }),
      text('ntnx_cluster', 'Cluster', 'cluster', { required: true, placeholder: 'cluster1', json: false }),
      text('ntnx_image', 'Uploaded QCOW2 image name', 'image', { required: true, wide: true, placeholder: 'uag-2609.qcow2', json: false, help: 'Name of the image uploaded in Prism Central, not a local file path.' }),
      text('ntnx_subnet0', 'NIC0 / eth0 subnet', 'subnet0', { required: true, placeholder: 'dmz-internet', json: false }),
      text('ntnx_subnet1', 'NIC1 / eth1 subnet', 'subnet1', {
        required: (v) => !String(v.deploymentOption).startsWith('onenic'),
        showIf: (v) => !String(v.deploymentOption).startsWith('onenic'),
        placeholder: 'dmz-management',
        json: false
      }),
      text('ntnx_subnet2', 'NIC2 / eth2 subnet', 'subnet2', {
        required: (v) => String(v.deploymentOption).startsWith('threenic'),
        showIf: (v) => String(v.deploymentOption).startsWith('threenic'),
        placeholder: 'dmz-backend',
        json: false
      })
    ]
  },
  {
    id: 'openshift',
    title: 'Red Hat OpenShift Virtualization deployment',
    section: 'network',
    target: 'deploy',
    iniSection: 'OpenShift',
    platforms: ['openshift'],
    since: '2609',
    help: 'Limited Availability: request access from Omnissa. The target namespace, storage class, NADs and RBAC permissions must already exist. Gateway Forge generates the bootable-volume manifest and deployment INI; local QCOW2 uploads must be prepared through the OpenShift console.',
    fields: [
      text('ocp_openShiftUserName', 'OpenShift user / service account', 'openShiftUserName', { required: (v) => !v.ocp_bearerToken, placeholder: 'admin', json: false }),
      text('ocp_openShiftEndpoint', 'OpenShift API endpoint', 'openShiftEndpoint', { required: true, rule: 'httpsOrigin', wide: true, placeholder: 'https://api.cluster.example.com:6443', json: false }),
      text('ocp_namespace', 'Namespace / project', 'namespace', { required: true, rule: 'kubeNamespace', placeholder: 'uag-dmz', json: false }),
      text('ocp_instanceType', 'Instance type / profile', 'instanceType', { required: true, placeholder: 'uag-medium', help: 'Must provide at least 2 vCPU and 4 GB RAM; Omnissa does not enumerate accepted profile names.' , json: false }),
      text('ocp_storageClass', 'Storage class', 'storageClass', { required: true, rule: 'kubeName', placeholder: 'uag-rwx', json: false }),
      num('ocp_diskSizeGi', 'Root disk size (GiB)', 'diskSizeGi', { required: true, default: 20, min: 20, json: false }),
      text('ocp_volume', 'Bootable volume name', 'volume', { required: true, rule: 'kubeName', placeholder: 'uag-bootable-volume', json: false }),
      sel('ocp_volumeSourceMode', 'Bootable volume preparation', 'volumeSourceMode', [
        { value: 'url', label: 'Generate a manifest for a cluster-reachable HTTP(S) QCOW2 URL' },
        { value: 'console', label: 'Manual console upload for a local QCOW2 file (runbook mode)' }
      ], {
        default: 'url',
        required: true,
        json: false,
        ini: false,
        wide: true,
        help: 'The official console upload path is intentionally runbook-only because Gateway Forge cannot upload a local file to your cluster.'
      }),
      text('ocp_qcow2Url', 'Cluster-reachable QCOW2 URL', 'qcow2Url', {
        required: (v) => v.ocp_volumeSourceMode === 'url',
        rule: 'url',
        wide: true,
        placeholder: 'https://images.corp.local/uag-2609.qcow2',
        showIf: (v) => v.ocp_volumeSourceMode === 'url',
        json: false,
        ini: false,
        help: 'HTTP(S) URL reachable from the OpenShift cluster.'
      }),
      text('ocp_nadName0', 'NIC0 / eth0 NAD', 'nadName0', { required: true, rule: 'kubeName', placeholder: 'uag-external-network', json: false }),
      text('ocp_nadName1', 'NIC1 / eth1 NAD', 'nadName1', {
        required: (v) => !String(v.deploymentOption).startsWith('onenic'),
        rule: 'kubeName',
        showIf: (v) => !String(v.deploymentOption).startsWith('onenic'),
        placeholder: 'uag-management-network',
        json: false
      }),
      text('ocp_nadName2', 'NIC2 / eth2 NAD', 'nadName2', {
        required: (v) => String(v.deploymentOption).startsWith('threenic'),
        rule: 'kubeName',
        showIf: (v) => String(v.deploymentOption).startsWith('threenic'),
        placeholder: 'uag-backend-network',
        json: false
      }),
      text('ocp_networkPolicies', 'NetworkPolicy names', 'networkPolicies', { placeholder: 'uag-ingress,uag-egress', help: 'Comma-separated existing NetworkPolicy names.' , json: false }),
      text('ocp_labels', 'VM and pod labels', 'labels', { wide: true, placeholder: 'env=prod,app=uag', help: 'Comma-separated key=value labels; NetworkPolicies match these through podSelector.', json: false }),
      secret('ocp_bearerToken', 'OpenShift bearer token (optional)', 'bearerToken', {
        wide: true,
        placeholder: 'not stored',
        json: false,
        help: 'When set, the official script uses token authentication instead of an OpenShift password.'
      })
    ]
  },
  {
    id: 'azure',
    title: 'Azure deployment',
    section: 'network',
    target: 'azure',
    iniSection: 'Azure',
    platforms: ['azure'],
    help: 'The [Azure] section replaces the VMware/Hyper-V network keys. Use uagdeployaz.ps1.',
    fields: [
      text('az_subscriptionID', 'Subscription ID', 'subscriptionID', { required: true, placeholder: '12345678-1234-1234-1234-123456788901', json: false }),
      text('az_resourceGroupName', 'Resource group', 'resourceGroupName', { required: true, json: false }),
      text('az_location', 'Location', 'location', { required: true, placeholder: 'uksouth', json: false }),
      text('az_managedImageName', 'Managed image name', 'managedImageName', { required: true, json: false }),
      text('az_vmSize', 'VM size', 'vmSize', { default: 'Standard_A2_v2', json: false }),
      text('az_virtualNetworkName', 'Virtual network', 'virtualNetworkName', { required: true, json: false }),
      text('az_zone', 'Zone', 'zone', { json: false }),
      text('az_subnetName0', 'eth0 subnet', 'subnetName0', { json: false }),
      text('az_subnetName1', 'eth1 subnet', 'subnetName1', { json: false }),
      text('az_subnetName2', 'eth2 subnet', 'subnetName2', { json: false }),
      text('az_networkSecurityGroupName0', 'eth0 network security group', 'networkSecurityGroupName0', { json: false }),
      text('az_networkSecurityGroupName1', 'eth1 network security group', 'networkSecurityGroupName1', { json: false }),
      text('az_publicIpAddrResourceGroupName', 'eth0 public IP object', 'publicIpAddrResourceGroupName', { json: false })
    ]
  },
  {
    id: 'horizon',
    title: 'Horizon edge service',
    section: 'horizon',
    target: 'horizon',
    iniSection: 'Horizon',
    enabledBy: 'horizon_enabled',
    fields: [
      text('proxyDestinationUrl', 'Connection Server URL', 'proxyDestinationUrl', {
        rule: 'httpsUrl',
        required: true,
        wide: true,
        placeholder: 'https://cs01.corp.local',
        help: 'Use at least two UAGs targeting different Connection Servers (or a load balancer) for high availability.'
      }),
      text('proxyDestinationUrlThumbprints', 'Connection Server thumbprint(s)', 'proxyDestinationUrlThumbprints', {
        rule: 'thumbprints',
        wide: true,
        placeholder: 'sha256=ad:5c:f1:…',
        help: 'Only needed when the CS certificate is not issued by a trusted CA - or add that CA under Trusted CA certificate below instead. Format [alg=]xx:xx… (sha1/sha256/sha384/sha512), comma-separated.'
      }),
      ...trustedCertFields((n) => `trustedCert${n}`, {
        help: 'Alternative to a thumbprint: add the CA that issued the Connection Server certificate to the trust store (Admin UI: Horizon settings > More > Trusted Certificates). File path read by uagdeploy at deployment time.'
      }),
      sel('minSHAHashSize', 'Minimum SHA hash size', 'minSHAHashSize', ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'], {
        since: '2312',
        default: 'SHA-256',
        help: 'Minimum thumbprint algorithm accepted for Horizon connections. SHA-1 is not recommended.'
      }),
      sel('authMethods', 'Auth method', 'authMethods', AUTH_METHODS, {
        default: 'passthrough',
        help: 'Authentication method presented to Horizon Clients. RADIUS/SAML must be configured under Authentication.'
      }),
      sel('gatewayLocation', 'Gateway location', 'gatewayLocation', ['external', 'internal'], { default: 'external' }),
      sel('proxyDestinationIPSupport', 'Connection Server IP mode', 'proxyDestinationIPSupport', ['IPV4', 'IPV6', 'IPV4+IPV6'], { default: 'IPV4', omitDefault: true }),
      bool('tunnelEnabled', 'Enable tunnel (secure gateway)', 'tunnelEnabled', false),
      text('tunnelExternalUrl', 'Tunnel external URL', 'tunnelExternalUrl', {
        rule: 'httpsUrl',
        placeholder: 'https://vdi.example.com:443',
        showIf: (v) => v.tunnelEnabled === true,
        since: '2412'
      }),
      text('additionalTunnelExternalUrls', 'Additional tunnel external URLs', 'additionalTunnelExternalUrls', {
        rule: 'urlList',
        aliases: ['tunnelUrls'],
        since: '2412',
        wide: true,
        showIf: (v) => v.tunnelEnabled === true,
        help: 'Comma-separated; hostnames must be unique.'
      }),
      bool('blastEnabled', 'Enable Blast', 'blastEnabled', false),
      text('blastExternalUrl', 'Blast external URL', 'blastExternalUrl', {
        rule: 'httpsUrl',
        placeholder: 'https://vdi.example.com:443',
        showIf: (v) => v.blastEnabled === true,
        help: 'Default TCP/UDP port is 8443 when omitted.'
      }),
      text('additionalBlastExternalUrls', 'Additional Blast external URLs', 'additionalBlastExternalUrls', {
        rule: 'urlList',
        rows: { itemLabel: 'Blast external URL', rule: 'httpsUrl', separator: 'comma' },
        aliases: ['blastUrls'],
        since: '2412',
        wide: true,
        showIf: (v) => v.blastEnabled === true
      }),
      text('blastAllowedHostHeaderValues', 'Blast allowed Host header values', 'blastAllowedHostHeaderValues', {
        rows: { itemLabel: 'Allowed host header', rule: 'hostPort', separator: 'comma' },
        placeholder: 'uag.example.com:8443',
        wide: true,
        showIf: (v) => v.blastEnabled === true,
        help: 'Add one host[:port] value per row; use _empty_ to allow requests without a Host header.'
      }),
      bool('pcoipEnabled', 'Enable PCoIP', 'pcoipEnabled', false),
      bool('pcoipDisableLegacyCertificate', 'Use appliance certificate for PCoIP', 'pcoipDisableLegacyCertificate', false, {
        since: '2506',
        showIf: (v) => v.pcoipEnabled === true,
        help: 'Disables the legacy PCoIP certificate. Legacy PCoIP clients cannot connect.'
      }),
      text('pcoipExternalUrl', 'PCoIP external URL', 'pcoipExternalUrl', {
        rule: 'ipv4Port',
        placeholder: '192.0.2.21:4172',
        showIf: (v) => v.pcoipEnabled === true,
        help: 'Must contain an IPv4 address, not a hostname.'
      }),
      sel('clientEncryptionMode', 'Client encryption mode', 'clientEncryptionMode', ['ALLOWED', 'REQUIRED', 'DISABLED'], { default: 'ALLOWED' }),
      bool('hostRedirectionEnabled', 'Honor Connection Server redirect', 'hostRedirectionEnabled', false),
      bool('originCheckEnabled', 'Origin header check', 'originCheckEnabled', true, { since: '2503' }),
      text('origin', 'Allowed origins', 'origin', {
        type: 'textarea',
        since: '2503',
        wide: true,
        showIf: (v) => v.originCheckEnabled === true,
        help: 'One origin per line. Optional details: origin | rewriteEnabled | autoGenerated. URLs and hostnames are accepted.',
        aliases: ['originHeaderDetailsList']
      }),
      bool('disableWebClient', 'Disable web client access', 'disableWebClient', false, { since: '2412' }),
      bool('windowsSSOEnabled', 'Windows SSO (RADIUS passcode = AD password)', 'windowsSSOEnabled', false, {
        showIf: usesRadius
      }),
      text('radiusClassAttributeList', 'RADIUS class attributes', 'radiusClassAttributeList', {
        since: '2506',
        wide: true,
        showIf: usesRadius,
        help: 'Comma-separated class attributes used for additional authorization.'
      }),
      text('disclaimerText', 'Horizon disclaimer text', 'disclaimerText', { wide: true }),
      bool('proxyDestinationPreLoginMessageEnabled', 'Show Connection Server pre-login message', 'proxyDestinationPreLoginMessageEnabled', true, {
        since: '2609',
        help: 'Controls whether a pre-login message configured on Connection Server is shown.'
      }),
      bool('matchWindowsUserName', 'Match Windows user name', 'matchWindowsUserName', false, {
        showIf: (v) => usesSecurId(v) || usesRadius(v)
      }),
      bool('smartCardHintPrompt', 'Smart card hint prompt', 'smartCardHintPrompt', false, { showIf: usesCertificate }),
      bool('logoutOnCertRemoval', 'Log out when certificate is removed', 'logoutOnCertRemoval', false, {
        since: '2506',
        showIf: usesCertificate
      }),
      bool('enableAuthOnRedirectedSite', 'Re-authenticate on home site (CPA)', 'enableAuthOnRedirectedSite', false, {
        since: '2406',
        showIf: (v) => [
          'radius-auth',
          'radius-auth-and-unauthenticated',
          'securid-auth',
          'securid-auth-and-unauthenticated',
          'certificate-auth',
          'certificate-auth-and-passthrough',
          'certificate-auth-and-radius-auth',
          'device-certificate-auth-and-passthrough'
        ].includes(String(v.authMethods))
      }),
      text('radiusUsernameLabel', 'RADIUS username label', 'radiusUsernameLabel', {
        showIf: usesRadius,
        placeholder: 'Username',
        maxLength: 20,
        help: 'Max 20 characters.'
      }),
      text('radiusPasscodeLabel', 'RADIUS passcode label', 'radiusPasscodeLabel', {
        showIf: usesRadius,
        placeholder: 'Passcode',
        maxLength: 20,
        help: 'Max 20 characters.'
      }),
      text('horizon_oidcConfigurationId', 'OIDC configuration ID', 'oidcConfigurationId', {
        since: '2506',
        showIf: (v) => v.authMethods === 'oidc-auth',
        required: (v) => v.authMethods === 'oidc-auth',
        help: 'Name of a configured OIDC provider.'
      }),
      text('samlSP', 'SAML service provider name', 'samlSP', { showIf: usesSaml, help: 'Name of the SP metadata, or DEMO.' }),
      text('idpEntityID', 'SAML identity provider entity ID', 'idpEntityID', { since: '2603', showIf: usesSaml, wide: true }),
      sel('idpBindingType', 'SAML binding', 'idpBindingType', ['POST', 'ARTIFACT'], { since: '2603', showIf: usesSaml }),
      text('allowedAudiences', 'SAML audiences', 'allowedAudiences', { showIf: usesSaml, wide: true }),
      text('samlUnauthUsernameAttribute', 'SAML unauthenticated username attribute', 'samlUnauthUsernameAttribute', {
        since: '2506',
        showIf: (v) => v.authMethods === 'saml-auth-and-unauthenticated'
      }),
      text('defaultUnauthUsername', 'Default unauthenticated username', 'defaultUnauthUsername', {
        since: '2506',
        showIf: (v) => String(v.authMethods).includes('unauthenticated')
      }),
      bool('udpTunnelServerEnabled', 'Enable UDP tunnel server', 'udpTunnelServerEnabled', true, {
        since: '2506',
        help: 'Disable when Connection Server must receive the client source IP instead of 127.0.0.1.'
      }),
      num('queryBrokerInterval', 'Connection Server query interval (s)', 'queryBrokerInterval', {
        since: '2609',
        default: 300,
        min: 1
      }),
      text('proxyBlastPemCert', 'Blast proxy certificate (PEM path)', 'proxyBlastPemCert', {
        since: '2506',
        wide: true,
        json: false
      }),
      text('proxyTunnelPemCert', 'Tunnel proxy certificate (PEM path)', 'proxyTunnelPemCert', {
        since: '2506',
        wide: true,
        json: false
      }),
      text('endpointComplianceCheckProvider', 'Endpoint compliance provider', 'endpointComplianceCheckProvider', {
        wide: true,
        help: 'Exact name of a provider configured in Advanced Settings; blank means none.'
      }),
      bool('complianceCheckOnAuthentication', 'Check compliance on authentication', 'complianceCheckOnAuthentication', true, {
        showIf: (v) => Boolean(v.endpointComplianceCheckProvider)
      }),
      bool('canonicalizationEnabled', 'Canonicalize paths before proxy-pattern match', 'canonicalizationEnabled', true, {
        since: '2506'
      }),
      text('healthCheckUrl', 'Health check URI', 'healthCheckUrl', { rule: 'path', placeholder: '/favicon.ico' }),
      text('proxyPattern', 'Proxy pattern (regex)', 'proxyPattern', {
        wide: true,
        placeholder: '(/|/view-client(.*)|/portal(.*)|/appblast(.*))',
        help: 'Leave empty for the Horizon default.'
      }),
      text('redirectHostPortMappingList', 'Host/port redirect mappings', 'redirectHostPortMappingList', {
        since: '2506',
        rule: 'redirectMappings',
        wide: true,
        help: 'Comma-separated source_host:port_redirect_host:port mappings; default port is 443.'
      }),
      text('securityHeaders', 'Response security headers', 'securityHeaders', {
        since: '2506',
        type: 'textarea',
        wide: true,
        json: false,
        help: 'INI serialization copied from an appliance export. JSON object shape is not documented and is intentionally not exported.'
      }),
      ...Array.from({ length: 6 }, (_, i) => text(`hostEntry${i + 1}`, `Host entry ${i + 1}`, `hostEntry${i + 1}`, {
        rule: 'hostEntry',
        hostEntryIndex: i + 1,
        json: false,
        wide: true,
        placeholder: '10.192.168.1 cs1.corp.local cs1',
        help: 'IP address, hostname, and optional alias, separated by spaces.'
      }))
    ]
  },
  {
    id: 'airwatch',
    title: 'Workspace ONE UEM gateway',
    section: 'tunnel',
    target: 'airwatch',
    iniSection: 'Airwatch',
    enabledBy: 'airwatch_enabled',
    help: 'Configures the shared [Airwatch] UEM settings used by Tunnel and, when selected in Content Gateway, a shared Content Gateway service. The shared section is INI-only.',
    fields: [
      bool('airwatch_tunnelGatewayEnabled', 'Enable Tunnel gateway', 'tunnelGatewayEnabled', true, { json: false }),
      text('airwatch_apiServerUrl', 'Workspace ONE UEM API server URL', 'apiServerUrl', {
        rule: 'httpsOrigin',
        required: true,
        wide: true,
        placeholder: 'https://as1234.awmdm.com',
        json: false,
        help: 'REST API origin from Groups & Settings > All Settings > Advanced > Site URLs in Workspace ONE UEM. Enter only the HTTPS host (and optional port), without a path, query, or fragment.'
      }),
      text('airwatch_apiServerUsername', 'Workspace ONE UEM API user', 'apiServerUsername', {
        required: true,
        placeholder: 'domain\\svc-uag',
        json: false,
        help: 'Console admin account used for initial configuration; Console Administrator privileges are required at minimum.'
      }),
      secret('airwatch_apiServerPassword', 'Workspace ONE UEM API password', 'apiServerPassword', {
        required: true,
        json: false,
        help: 'Used to save the initial Tunnel service configuration. It is not retained in Gateway Forge drafts.'
      }),
      text('airwatch_organizationGroupCode', 'Organization Group ID', 'organizationGroupCode', {
        placeholder: 'CORP',
        json: false,
        help: 'Optional when Workspace ONE UEM supports multiple Tunnel configurations.'
      }),
      text('airwatch_tunnelConfigurationId', 'Tunnel Configuration ID', 'tunnelConfigurationId', {
        since: '2306',
        json: false,
        help: 'Optional. Use the ID configured in Workspace ONE UEM; when blank, UAG fetches the default configuration for the organization group.'
      }),
      text('airwatch_airwatchServerHostname', 'Tunnel server hostname', 'airwatchServerHostname', {
        rule: 'hostOrIp',
        required: true,
        wide: true,
        placeholder: 'tunnel.example.com',
        json: false,
        help: 'Must exactly match the external hostname in the Workspace ONE UEM Tunnel configuration.'
      }),
      bool('airwatch_disableAutoConfigUpdate', 'Lock configuration (disable UEM auto-update)', 'disableAutoConfigUpdate', false, {
        since: '2303',
        omitDefault: true,
        json: false,
        help: 'Prevents configuration, authentication, certificate and networking auto-updates from Workspace ONE UEM.'
      }),
      text('airwatch_outboundProxyHost', 'Outbound proxy host', 'outboundProxyHost', { rule: 'hostOrIp', json: false }),
      num('airwatch_outboundProxyPort', 'Outbound proxy port', 'outboundProxyPort', {
        rule: 'port',
        required: (v) => String(v.airwatch_outboundProxyHost ?? '').trim() !== '',
        json: false
      }),
      text('airwatch_outboundProxyUsername', 'Outbound proxy user', 'outboundProxyUsername', { json: false }),
      secret('airwatch_outboundProxyPassword', 'Outbound proxy password', 'outboundProxyPassword', { json: false }),
      bool('airwatch_ntlmAuthentication', 'Use NTLM for outbound proxy', 'ntlmAuthentication', false, { omitDefault: true, json: false }),
      ...Array.from({ length: 6 }, (_, i) => text(`airwatch_hostEntry${i + 1}`, `Host entry ${i + 1}`, `hostEntry${i + 1}`, {
        rule: 'hostEntry',
        hostEntryIndex: i + 1,
        wide: true,
        placeholder: '10.0.0.15 api.corp.local',
        json: false,
        help: 'IP address, hostname, and optional alias, separated by spaces.'
      })),
      ...trustedCertFields((n) => `airwatch_trustedCert${n}`, {
        placeholder: 'C:\\certs\\workspace-one-ca.pem',
        json: false,
        help: 'PEM certificate file added to the UAG trust store by the deployment script.'
      }),
      bool('airwatch_reinitializeGatewayProcess', 'Reinitialize gateway process', 'reinitializeGatewayProcess', false, {
        omitDefault: true,
        json: false,
        inferred: true,
        help: 'Present in the official sample INI, but Omnissa does not describe its semantics on the reference page. Leave false unless an appliance export or support guidance requires it.'
      }),
      text('airwatch_healthCheckUrl', 'Health check path', 'healthCheckUrl', {
        rule: 'path',
        default: '/favicon.ico',
        json: false,
        inferred: true,
        help: 'Present in the official sample INI; the reference page does not state how this path is used.'
      }),
      text('airwatch_proxyDestinationUrl', 'Proxy destination URL', 'proxyDestinationUrl', {
        rule: 'url',
        wide: true,
        json: false,
        inferred: true,
        help: 'Present in the official sample INI; its role is not described in the 2609 reference. Leave empty unless required by an exported appliance configuration.'
      }),
      text('airwatch_pacFilePath', 'PAC file path', 'pacFilePath', {
        wide: true,
        json: false,
        inferred: true,
        help: 'Present in the official sample INI; expected file format and location are not documented there.'
      }),
      text('airwatch_pacFileURL', 'PAC file URL', 'pacFileURL', {
        rule: 'url',
        wide: true,
        json: false,
        inferred: true,
        help: 'Present in the official sample INI; interaction with pacFilePath is not documented.'
      }),
      text('airwatch_credentialFilePath', 'Credential file path', 'credentialFilePath', {
        wide: true,
        json: false,
        inferred: true,
        help: 'Present in the official sample INI; contents and deployment behavior are not documented in the reference.'
      }),
      bool('airwatch_airwatchOutboundProxy', 'Use AirWatch outbound proxy (legacy)', 'airwatchOutboundProxy', false, {
        until: '2303',
        omitDefault: true,
        json: false,
        inferred: true,
        help: 'Documented in the UAG 2212 sample and replaced in later samples. Verify against the target release export.'
      }),
      bool('airwatch_tunnelProxyEnabled', 'Enable Tunnel proxy (legacy)', 'tunnelProxyEnabled', false, {
        until: '2303',
        omitDefault: true,
        json: false,
        inferred: true,
        help: 'Documented in the UAG 2212 sample and absent from the UAG 2303+ sample. Verify against the target release export.'
      })
    ]
  },
  {
    id: 'contentGateway',
    title: 'Workspace ONE Content Gateway',
    section: 'contentGateway',
    target: 'airwatchContentGateway',
    iniSection: 'AirwatchContentGateway',
    enabledBy: 'contentGateway_enabled',
    help: 'Configures the CONTENT_GATEWAY edge service. Standalone mode emits [AirwatchContentGateway]; shared mode adds contentGatewayEnabled=true to the existing [Airwatch] section and reuses its UEM settings.',
    fields: [
      sel('contentGateway_mode', 'Configuration mode', 'configurationMode', [
        { value: 'standalone', label: 'Standalone [AirwatchContentGateway]' },
        { value: 'shared', label: 'Shared [Airwatch] section' }
      ], {
        default: 'standalone',
        ini: false,
        json: false,
        help: 'Use standalone for a dedicated Content Gateway UEM connection. Shared mode reuses the common values from Workspace ONE Tunnel.'
      }),
      text('contentGateway_cgConfigId', 'Content Gateway Configuration ID', 'cgConfigId', {
        json: 'cgConfigurationId',
        placeholder: 'content-gateway-production',
        wide: true,
        help: 'Optional UEM Content Gateway configuration ID. The vendor script maps this INI key to cgConfigurationId.'
      }),
      text('contentGateway_apiServerUrl', 'Workspace ONE UEM API server URL', 'apiServerUrl', {
        rule: 'httpsOrigin',
        required: (v) => v.contentGateway_mode === 'standalone',
        showIf: (v) => v.contentGateway_mode === 'standalone',
        wide: true,
        placeholder: 'https://as1234.awmdm.com',
        help: 'HTTPS API origin from Workspace ONE UEM Site URLs; do not include a path, query or fragment.'
      }),
      text('contentGateway_apiServerUsername', 'Workspace ONE UEM API user', 'apiServerUsername', {
        required: (v) => v.contentGateway_mode === 'standalone',
        showIf: (v) => v.contentGateway_mode === 'standalone',
        placeholder: 'domain\\svc-uag-content',
        help: 'A populated username selects the standalone [AirwatchContentGateway] section in the vendor module. The API password is supplied at deployment time.'
      }),
      text('contentGateway_organizationGroupCode', 'Organization Group ID', 'organizationGroupCode', {
        showIf: (v) => v.contentGateway_mode === 'standalone',
        placeholder: 'CORP'
      }),
      text('contentGateway_airwatchServerHostname', 'Content Gateway hostname', 'airwatchServerHostname', {
        rule: 'hostOrIp',
        required: (v) => v.contentGateway_mode === 'standalone',
        showIf: (v) => v.contentGateway_mode === 'standalone',
        wide: true,
        placeholder: 'content.example.com',
        help: 'External hostname configured for the Content Gateway service.'
      }),
      bool('contentGateway_disableAutoConfigUpdate', 'Lock configuration (disable UEM auto-update)', 'disableAutoConfigUpdate', false, {
        showIf: (v) => v.contentGateway_mode === 'standalone',
        omitDefault: true,
        help: 'Prevents Content Gateway configuration auto-updates from Workspace ONE UEM.'
      }),
      bool('contentGateway_airwatchOutboundProxy', 'Use outbound proxy for UEM connections', 'airwatchOutboundProxy', false, {
        showIf: (v) => v.contentGateway_mode === 'standalone',
        omitDefault: true,
        help: 'Sets airwatchOutboundProxy=true. Configure the proxy host and port below when required.'
      }),
      text('contentGateway_outboundProxyHost', 'Outbound proxy host', 'outboundProxyHost', {
        rule: 'hostOrIp',
        showIf: (v) => v.contentGateway_mode === 'standalone'
      }),
      num('contentGateway_outboundProxyPort', 'Outbound proxy port', 'outboundProxyPort', {
        rule: 'port',
        required: (v) => v.contentGateway_mode === 'standalone' && String(v.contentGateway_outboundProxyHost ?? '').trim() !== '',
        showIf: (v) => v.contentGateway_mode === 'standalone'
      }),
      text('contentGateway_outboundProxyUsername', 'Outbound proxy user', 'outboundProxyUsername', {
        showIf: (v) => v.contentGateway_mode === 'standalone',
        help: 'When set, the vendor script prompts for the proxy password; it is not stored or exported by Gateway Forge.'
      }),
      bool('contentGateway_reinitializeGatewayProcess', 'Reinitialize gateway process', 'reinitializeGatewayProcess', false, {
        showIf: (v) => v.contentGateway_mode === 'standalone',
        omitDefault: true,
        help: 'Ask the vendor module to reinitialize the Content Gateway process after configuration.'
      }),
      ...Array.from({ length: 6 }, (_, i) => text(`contentGateway_hostEntry${i + 1}`, `Host entry ${i + 1}`, `hostEntry${i + 1}`, {
        rule: 'hostEntry',
        hostEntryIndex: i + 1,
        showIf: (v) => v.contentGateway_mode === 'standalone',
        wide: true,
        placeholder: '10.0.0.30 content-api.corp.local',
        json: false,
        help: 'IP address, hostname, and optional alias, separated by spaces.'
      })),
      ...Array.from({ length: 9 }, (_, i) => text(`contentGateway_trustedCert${i + 1}`, `Trusted CA certificate ${i + 1} (PEM path)`, `trustedCert${i + 1}`, {
        rule: 'pemPath',
        trustedCertIndex: i + 1,
        showIf: (v) => v.contentGateway_mode === 'standalone',
        wide: true,
        placeholder: 'C:\\certs\\content-gateway-ca.pem',
        json: false,
        help: 'PEM certificate file read by uagdeploy and added to the appliance trust store.'
      }))
    ]
  },
  {
    id: 'radius',
    title: 'RADIUS',
    section: 'auth',
    target: 'radius',
    iniSection: 'RADIUSAuth',
    enabledBy: 'radius_enabled',
    help: 'Configure the RADIUS server, then select RADIUS as the auth method on the Horizon edge service.',
    fields: [
      text('radius_hostName', 'Primary server', 'hostName', { rule: 'hostOrIp', required: true, placeholder: 'radius01.corp.local' }),
      num('radius_authPort', 'Authentication port', 'authPort', { default: 1812, rule: 'port' }),
      sel('radius_authType', 'Authentication type', 'authType', ['PAP', 'CHAP', 'MSCHAP1', 'MSCHAP2'], { default: 'PAP' }),
      secret('radius_sharedSecret', 'Shared secret', 'sharedSecret', { required: true }),
      num('radius_numAttempts', 'Attempts', 'numAttempts', { default: 3, min: 1, max: 10 }),
      num('radius_serverTimeout', 'Server timeout (s)', 'serverTimeout', { default: 5, min: 1, max: 120 }),
      text('radius_radiusDisplayHint', 'Login page passphrase hint', 'radiusDisplayHint', { placeholder: 'RADIUS', wide: true }),
      bool('radius_enabledAux', 'Secondary server', 'enabledAux', false),
      text('radius_hostName_2', 'Secondary server', 'hostName_2', {
        rule: 'hostOrIp',
        inferred: true,
        showIf: (v) => v.radius_enabledAux === true,
        help: 'Key name follows the documented authPort_2/authType_2 pattern; verify against an exported INI.'
      }),
      num('radius_authPort_2', 'Secondary port', 'authPort_2', { default: 1812, rule: 'port', showIf: (v) => v.radius_enabledAux === true }),
      sel('radius_authType_2', 'Secondary auth type', 'authType_2', ['PAP', 'CHAP', 'MSCHAP1', 'MSCHAP2'], {
        default: 'PAP',
        showIf: (v) => v.radius_enabledAux === true
      }),
      secret('radius_sharedSecret_2', 'Secondary shared secret', 'sharedSecret_2', {
        inferred: true,
        showIf: (v) => v.radius_enabledAux === true
      })
    ]
  },
  {
    id: 'saml',
    title: 'SAML identity provider',
    section: 'auth',
    target: 'saml',
    iniSection: 'IDPExternalMetadata1',
    enabledBy: 'saml_enabled',
    help: 'Third-party IdP metadata for Horizon or administrator SAML authentication. Select SAML on Horizon or enable Administrator SAML access below.',
    fields: [
      text('saml_entityID', 'IdP entity ID', 'entityID', { required: true, wide: true, placeholder: 'https://idp.example.com/metadata' }),
      text('saml_metadataXmlFile', 'IdP metadata XML file', 'metadataXmlFile', {
        wide: true,
        required: true,
        placeholder: 'C:\\uag\\idp-metadata.xml',
        json: false,
        help: 'Local metadata XML path read by uagdeploy at deployment time. This is not a PEM/PFX certificate input. Signing and encryption use the dedicated PEM-only controls below.'
      }),
      bool('saml_forceAuthN', 'Force re-authentication', 'forceAuthN', false),
      bool('saml_allowUnencrypted', 'Allow unencrypted assertions', 'allowUnencrypted', false),
      text('saml_idpUrlThumbprints', 'IdP URL thumbprints (optional)', 'idpUrlThumbprints', {
        rule: 'thumbprints', wide: true, json: false,
        help: 'Optional comma-separated SHA thumbprints for the metadata Artifact Resolution Service URL. Values such as sha1:xx xx ... are preserved. Trusted CA rows do not require a thumbprint. INI-only: uagdeploy derives idpURL from the metadata XML.'
      }),
      ...trustedCertFields((n) => `saml_trustedCert${n}`, {
        help: 'CA PEM path trusted for the IdP metadata Artifact Resolution Service URL. Maximum nine; uagdeploy reads the files at deployment time. Paths are INI-only, not JSON certificate content.'
      }),
      ...certificateFields('samlSigning', 'SAML signing', {
        cert: 'signingCertChainPem', key: 'signingPrivateKeyPem', mode: 'signingCertificateType'
      }),
      ...certificateFields('samlEncryption', 'SAML encryption', {
        cert: 'certChainPem', key: 'privateKeyPem', mode: 'encryptionCertificateType'
      })
    ]
  },
  {
    id: 'oidc',
    title: 'OpenID Connect',
    section: 'auth',
    target: 'oidc',
    iniSection: 'OidcProviderSetting',
    enabledBy: 'oidc_enabled',
    since: '2506',
    help: 'OIDC provider for Horizon. Select OpenID Connect as the auth method on the Horizon edge service and set the OIDC configuration ID there. INI only; not emitted to JSON.',
    fields: [
      text('oidc_oidcConfigurationId', 'Configuration ID', 'oidcConfigurationId', { required: true, placeholder: 'entra-horizon', json: false }),
      text('oidc_oidcConfigUrl', 'Discovery (config) URL', 'oidcConfigUrl', { rule: 'httpsUrl', required: true, wide: true, placeholder: 'https://login.example.com/.well-known/openid-configuration', json: false }),
      text('oidc_oidcClientId', 'Client ID', 'oidcClientId', { required: true, json: false }),
      bool('oidc_oidcForceAuthPrompt', 'Force authentication prompt', 'oidcForceAuthPrompt', false, { json: false }),
      num('oidc_oidcTimeoutSeconds', 'Timeout (s)', 'oidcTimeoutSeconds', { min: 1, json: false })
    ]
  },
  {
    id: 'securid',
    title: 'RSA SecurID',
    section: 'auth',
    target: 'securid',
    iniSection: 'SecurIDAuth',
    enabledBy: 'securid_enabled',
    since: '2506',
    help: 'RSA Authentication Manager REST settings. INI only; not emitted to JSON.',
    fields: [
      text('securid_serverHostname', 'Server host name', 'serverHostname', { rule: 'hostOrIp', required: true, json: false }),
      num('securid_serverPort', 'Server port', 'serverPort', { default: 5555, rule: 'port', json: false }),
      secret('securid_accessKey', 'Access key', 'accessKey', { required: true, json: false }),
      num('securid_authenticationTimeout', 'Authentication timeout (s)', 'authenticationTimeout', { min: 1, json: false }),
      text('securid_pemCerts', 'Server CA cert (PEM path)', 'pemCerts', { wide: true, json: false })
    ]
  },
  {
    id: 'certauth',
    title: 'Certificate (X.509 / smart card) authentication',
    section: 'auth',
    target: 'certauth',
    iniSection: 'CertificateAuth',
    enabledBy: 'certauth_enabled',
    since: '2506',
    help: 'Client-certificate authentication. INI only; not emitted to JSON.',
    fields: [
      text('certauth_pemCerts', 'CA certificates (PEM path)', 'pemCerts', { wide: true, required: true, placeholder: 'C:\\certs\\ca-chain.pem', json: false }),
      bool('certauth_enableCertRevocation', 'Enable certificate revocation', 'enableCertRevocation', false, { json: false }),
      bool('certauth_enableCertCRL', 'Use CRL', 'enableCertCRL', false, { json: false }),
      text('certauth_crlLocation', 'CRL location', 'crlLocation', {
        rule: 'url',
        wide: true,
        showIf: (v) => v.certauth_enableCertCRL === true,
        json: false
      }),
      bool('certauth_enableOCSP', 'Use OCSP', 'enableOCSP', false, { json: false }),
      bool('certauth_enableOCSPCRLFailover', 'OCSP to CRL failover', 'enableOCSPCRLFailover', false, { json: false }),
      text('certauth_userIdSource', 'User ID source', 'userIdSource', { json: false, help: 'Certificate field used as the user ID, e.g. the UPN.' }),
      bool('certauth_validateUpn', 'Validate UPN', 'validateUpn', false, { json: false }),
      num('certauth_requestTimeout', 'Request timeout (s)', 'requestTimeout', { min: 1, json: false }),
      bool('certauth_enableStrictCertificateValidation', 'Strict certificate validation', 'enableStrictCertificateValidation', false, { since: '2609', json: false })
    ]
  },
  {
    id: 'outboundproxy',
    title: 'Outbound proxy',
    section: 'network',
    target: 'proxy',
    iniSection: 'OutboundProxySettings1',
    enabledBy: 'obp_enabled',
    help: 'Route selected outbound UAG traffic through an HTTP(S) proxy. INI only; not emitted to JSON.',
    fields: [
      text('obp_name', 'Name', 'name', { required: true, placeholder: 'corp-proxy', json: false }),
      text('obp_proxyUrl', 'Proxy URL', 'proxyUrl', { rule: 'url', required: true, wide: true, placeholder: 'http://proxy.corp.local:3128', json: false }),
      sel('obp_proxyType', 'Proxy type', 'proxyType', ['HTTP', 'HTTPS'], { default: 'HTTP', json: false }),
      text('obp_includedHosts1', 'Included hosts', 'includedHosts1', { wide: true, placeholder: 'api.example.com', json: false }),
      ...trustedCertFields((n) => `obp_trustedCert${n}`, {
        help: 'CA certificates trusted for the outbound HTTPS proxy. File paths are deployment-time values.'
      })
    ]
  },
  {
    id: 'tls',
    title: 'TLS protocols & ciphers',
    section: 'tls',
    target: 'system',
    iniSection: 'General',
    fields: [
      bool('tls12Enabled', 'TLS 1.2', 'tls12Enabled', true),
      bool('tls13Enabled', 'TLS 1.3', 'tls13Enabled', true, { since: '2412' }),
      bool('tls11Enabled', 'TLS 1.1 (insecure)', 'tls11Enabled', false, { until: TLS_LEGACY_UNTIL }),
      bool('tls10Enabled', 'TLS 1.0 (insecure)', 'tls10Enabled', false, { until: TLS_LEGACY_UNTIL }),
      sel('sslProvider', 'SSL provider', 'sslProvider', ['OPENSSL', 'JDK'], {
        default: 'OPENSSL',
        omitDefault: true,
        help: 'JDK is required to configure named groups and signature schemes.'
      }),
      text('cipherSuites', 'TLS server cipher suites', 'cipherSuites', { wide: true, help: 'Comma-separated; empty = appliance defaults.' }),
      text('outboundCipherSuites', 'TLS client cipher suites', 'outboundCipherSuites', { wide: true }),
      text('tlsNamedGroups', 'TLS named groups', 'tlsNamedGroups', {
        showIf: (v) => v.sslProvider === 'JDK',
        placeholder: 'secp256r1,secp384r1'
      }),
      text('tlsSignatureSchemes', 'TLS signature schemes', 'tlsSignatureSchemes', {
        showIf: (v) => v.sslProvider === 'JDK',
        wide: true
      })
    ]
  },
  {
    id: 'certs',
    title: 'Server certificates',
    section: 'tls',
    target: 'certs',
    iniSection: 'SSLCert',
    help: 'File paths read by uagdeploy at deployment time (PEM, RSA key in PKCS#1 format). Certificate content is never stored by Gateway Forge.',
    fields: [
      ...certificateFields('cert', 'Internet-facing TLS', { cert: 'pemCerts', key: 'pemPrivKey', pfx: 'pfxCerts', alias: 'pfxCertAlias' })
    ]
  },
  {
    id: 'saml-idp-certs',
    title: 'SAML identity-provider signing certificate',
    section: 'auth',
    target: 'certs',
    iniSection: 'SAMLIdentityProviderMetadata',
    help: 'Optional dedicated SAML IdP signing certificate, separate from external IdP metadata and TLS. PEM only; the private-key file must contain an RSA private key. With no custom pair, UAG generates a self-signed pair. File paths are INI-only.',
    fields: certificateFields('samlIdp', 'SAML IdP signing', { cert: 'pemCerts', key: 'pemPrivKey' })
  },
  {
    id: 'admin-saml',
    title: 'Administrator SAML access',
    section: 'auth',
    target: 'adminSaml',
    iniSection: 'adminSAMLSettings',
    enabledBy: 'adminSaml_enable',
    since: '2609',
    help: 'Administrator authentication, separate from Horizon SAML. Configure the matching IdP metadata under SAML identity provider.',
    fields: [
      bool('adminSaml_enable', 'Enable administrator SAML', 'enable', false),
      text('adminSaml_entityId', 'Administrator IdP entity ID', 'entityId', { required: true, wide: true }),
      text('adminSaml_spEntityId', 'Administrator SP entity ID', 'spEntityId', { wide: true }),
      bool('adminSaml_signAuthNRequest', 'Sign authentication requests with admin certificate', 'signAuthNRequestWithAdminCert', false)
    ]
  },
  {
    id: 'admin-certs',
    title: 'Management / Admin UI certificates',
    section: 'tls',
    target: 'certs',
    iniSection: 'SSLCertAdmin',
    help: 'Deployment-time file paths for the management listener on port 9443. Paths are INI-only; settings JSON requires actual certificate content, not file paths.',
    fields: [
      ...certificateFields('adminCert', 'Admin TLS', { cert: 'pemCerts', key: 'pemPrivKey', pfx: 'pfxCerts', alias: 'pfxCertAlias' })
    ]
  },
  {
    id: 'snmp',
    title: 'SNMP',
    section: 'monitoring',
    target: 'snmp',
    iniSection: 'SnmpSettings',
    enabledBy: 'snmp_enabled',
    fields: [
      sel('snmp_version', 'Version', 'version', ['V1+V2c', 'v3'], { default: 'V1+V2c' }),
      secret('snmp_communityName', 'Community name', 'communityName', {
        since: '2312',
        showIf: (v) => v.snmp_version === 'V1+V2c',
        help: 'Case-sensitive. Defaults to "public" when empty - change it.'
      }),
      text('snmp_usmUser', 'SNMPv3 USM user', 'usmUser', { showIf: (v) => v.snmp_version === 'v3' }),
      text('snmp_engineID', 'SNMP engine ID', 'engineID', { showIf: (v) => v.snmp_version === 'v3', help: 'Max 27 characters; unique per appliance.' }),
      text('snmp_securityLevel', 'Security level', 'securityLevel', {
        showIf: (v) => v.snmp_version === 'v3',
        help: 'Copy the exact token from an Admin-UI exported INI (no-auth/auth/auth+priv).'
      }),
      sel('snmp_authAlgorithm', 'Auth algorithm', 'authAlgorithm', ['', 'SHA-224', 'SHA-256', 'SHA-384', 'SHA-512', 'SHA', 'MD5'], {
        showIf: (v) => v.snmp_version === 'v3'
      }),
      secret('snmp_authPassword', 'Auth password', 'authPassword', { showIf: (v) => v.snmp_version === 'v3', help: 'Min 8 characters.' }),
      sel('snmp_privacyAlgorithm', 'Privacy algorithm', 'privacyAlgorithm', ['', 'AES', 'DES'], { showIf: (v) => v.snmp_version === 'v3' }),
      secret('snmp_privacyPassword', 'Privacy password', 'privacyPassword', { showIf: (v) => v.snmp_version === 'v3', help: 'Min 8 characters.' })
    ]
  }
];

export const LISTS: ListDef[] = [
  {
    id: 'adminUsers',
    title: 'Additional admin and API users',
    itemLabel: 'Admin user',
    section: 'adminUsers',
    target: 'adminUsers',
    iniSection: (n) => `AdminUser${n}`,
    max: 99,
    help: 'Creates additional UAG Admin UI / API users with the vendor-managed ROLE_MONITORING role. Usernames and flags are written to INI; passwords are supplied at deployment time and are never stored in the browser or exported.',
    fields: [
      text('name', 'User name', 'name', {
        rule: 'monitoringUserName',
        required: true,
        maxLength: 35,
        placeholder: 'MonitorUser1',
        help: '1-35 letters, numbers, combining marks, underscores, or backslashes; no spaces.'
      }),
      bool('enabled', 'Enabled', 'enabled', true, {
        help: 'Disabled users are created but cannot authenticate until enabled.'
      }),
      bool('adminMonitoringPasswordPreExpired', 'Require password change on first sign-in', 'adminMonitoringPasswordPreExpired', false, {
        help: 'Marks the runtime-supplied password as pre-expired for the monitoring user.'
      })
    ]
  },
  {
    id: 'wrp',
    title: 'Web reverse proxy instances',
    itemLabel: 'Web reverse proxy',
    section: 'wrp',
    target: 'wrp',
    iniSection: (n) => `WebReverseProxy${n}`,
    max: 9,
    help: 'Publish internal web applications (or Omnissa Access) through the UAG.',
    fields: [
      text('instanceId', 'Instance ID', 'instanceId', { required: true, placeholder: 'intranet', help: 'Unique name for this proxy instance.' }),
      text('proxyDestinationUrl', 'Proxy destination URL', 'proxyDestinationUrl', { rule: 'httpsUrl', required: true, wide: true, placeholder: 'https://intranet.corp.local' }),
      text('proxyDestinationUrlThumbprints', 'Destination thumbprint(s)', 'proxyDestinationUrlThumbprints', { rule: 'thumbprints', wide: true }),
      text('proxyPattern', 'Proxy pattern (regex)', 'proxyPattern', { required: true, default: '/(.*)', wide: true }),
      sel('authMethods', 'Auth method', 'authMethods', AUTH_METHODS, { default: 'passthrough' }),
      text('healthCheckUrl', 'Health check URI', 'healthCheckUrl', { rule: 'path', placeholder: '/favicon.ico' }),
      text('landingPagePath', 'Landing page path', 'landingPagePath', { rule: 'path', default: '/' }),
      text('userNameHeader', 'User name header', 'userNameHeader', { placeholder: 'AccessPoint-User-ID' }),
      ...Array.from({ length: 6 }, (_, i) => text(`hostEntry${i + 1}`, `Host entry ${i + 1}`, `hostEntry${i + 1}`, {
        rule: 'hostEntry',
        hostEntryIndex: i + 1,
        json: false,
        wide: true,
        placeholder: '10.0.0.5 intranet.corp.local',
        help: 'IP address, hostname, and optional alias, separated by spaces.'
      })),
      ...trustedCertFields((n) => `trustedCert${n}`, {
        help: 'CA certificates trusted when connecting to this proxy destination. File paths are deployment-time values.'
      })
    ]
  },
  {
    id: 'syslog',
    title: 'Syslog servers',
    itemLabel: 'Syslog server',
    section: 'monitoring',
    target: 'syslog',
    iniSection: (n) => `SyslogServerSettings${n}`,
    max: 5,
    help: 'Forward appliance and edge-service events to a log collector.',
    fields: [
      sel('sysLogType', 'Protocol', 'sysLogType', ['UDP', 'TCP', 'TLS', 'MQTT'], { default: 'TLS', required: true }),
      sel('syslogCategory', 'Category', 'syslogCategory', ['ALL', 'AUDIT'], { default: 'ALL', help: 'ALL = all events; AUDIT = audit events only.' }),
      sel('syslogFormat', 'Format', 'syslogFormat', ['TEXT'], { default: 'TEXT' }),
      text('syslogUrl', 'Server URL / host[:port]', 'syslogUrl', {
        rule: 'hostOrIp',
        showIf: (v) => v.sysLogType !== 'TLS',
        required: (v) => v.sysLogType !== 'TLS',
        placeholder: 'syslog.corp.local:514'
      }),
      text('hostname', 'Host name', 'hostname', { rule: 'hostOrIp', showIf: (v) => v.sysLogType === 'TLS', required: (v) => v.sysLogType === 'TLS' }),
      num('port', 'Port', 'port', { rule: 'port', default: 6514, showIf: (v) => v.sysLogType === 'TLS' }),
      bool('syslogSystemMessagesEnabledV2', 'Include system messages', 'syslogSystemMessagesEnabledV2', false),
      text('syslogSettingName', 'Setting name', 'syslogSettingName', { placeholder: 'siem-primary' }),
      text('syslogServerCACertPemV2', 'Server CA cert (PEM path)', 'syslogServerCACertPemV2', { wide: true, json: false, showIf: (v) => v.sysLogType === 'TLS' }),
      text('syslogClientCertPemV2', 'Client cert (PEM path)', 'syslogClientCertPemV2', { wide: true, json: false, showIf: (v) => v.sysLogType === 'TLS' }),
      text('syslogClientCertKeyPemV2', 'Client key (PEM path)', 'syslogClientCertKeyPemV2', { wide: true, json: false, showIf: (v) => v.sysLogType === 'TLS' }),
      text('mqttTopic', 'MQTT topic', 'mqttTopic', { showIf: (v) => v.sysLogType === 'MQTT' })
    ]
  }
];

/** Virtual (non-INI) toggles and settings that live in `values` next to real fields. */
export const VIRTUAL_DEFAULTS: Values = {
  horizon_enabled: false,
  radius_enabled: false,
  saml_enabled: false,
  snmp_enabled: false,
  oidc_enabled: false,
  securid_enabled: false,
  certauth_enabled: false,
  obp_enabled: false,
  airwatch_enabled: false,
  contentGateway_enabled: false,
  run_noSSLVerify: false,
  run_disableVerification: false
};

/** Legacy runtime-only INI fields retained for draft/import compatibility, but not rendered in the form or INI/JSON output. */
export const RUNTIME_FIELDS: Field[] = [
  bool('run_noSSLVerify', 'Skip SSL/TLS certificate verification (-noSSLVerify)', 'run_noSSLVerify', false, {
    json: false,
    platforms: ['vsphere', 'hyperv', 'azure', 'nutanix']
  }),
  bool('run_disableVerification', 'Skip OVA/OVF signature verification (-disableVerification)', 'run_disableVerification', false, {
    json: false,
    platforms: ['vsphere']
  })
];

export function allGroupFields(): { group: GroupDef; field: Field }[] {
  return GROUPS.flatMap((group) => group.fields.map((field) => ({ group, field })));
}

export const GROUP_BY_ID: Record<string, GroupDef> = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

export function fieldDefaults(fields: Field[]): Values {
  const out: Values = {};
  for (const f of fields) {
    if (f.default !== undefined) out[f.id] = f.default;
    else if (f.type === 'bool') out[f.id] = false;
    else out[f.id] = '';
  }
  return out;
}
