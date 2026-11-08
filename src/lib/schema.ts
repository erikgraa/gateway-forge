import { TLS_LEGACY_UNTIL, type Platform } from './versions';

export type Primitive = string | number | boolean;
export type Values = Record<string, Primitive>;

export type FieldType = 'text' | 'number' | 'bool' | 'select' | 'secret' | 'textarea';

export type Rule =
  | 'ipv4'
  | 'hostOrIp'
  | 'hostList'
  | 'ipList'
  | 'url'
  | 'httpsUrl'
  | 'urlList'
  | 'port'
  | 'thumbprints'
  | 'pemPath'
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
  | 'int';

export type SectionId = 'general' | 'network' | 'horizon' | 'tunnel' | 'wrp' | 'auth' | 'tls' | 'monitoring' | 'templates';

export type Target =
  | 'system'
  | 'deploy'
  | 'horizon'
  | 'airwatch'
  | 'wrp'
  | 'radius'
  | 'saml'
  | 'snmp'
  | 'syslog'
  | 'certs'
  | 'azure'
  | 'oidc'
  | 'securid'
  | 'certauth'
  | 'proxy'
  | 'cascade'
  | 'runtime';

export function deploymentNicCount(v: Values): 1 | 2 | 3 {
  const option = String(v.deploymentOption);
  if (option.startsWith('threenic')) return 3;
  if (option.startsWith('twonic')) return 2;
  return 1;
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
  help?: string;
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
  /** 1-based position in an ordered trustedCert1-trustedCert9 field family. */
  trustedCertIndex?: number;
  wide?: boolean;
  /** Emit to INI only when the user sets it (not when equal to the documented default). */
  omitDefault?: boolean;
  /** This field needs format-specific output rather than a direct INI entry. */
  customOutput?: boolean;
  /** Edit a string-backed, space-separated value as individually validated rows. */
  rows?: {
    itemLabel: string;
    rule: 'ipv4' | 'hostOrIp';
  };
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
  id: 'wrp' | 'syslog';
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
  { id: 'wrp', title: 'Web reverse proxy', icon: '🔀' },
  { id: 'auth', title: 'Authentication', icon: '🔐' },
  { id: 'tls', title: 'TLS & certs', icon: '🔒' },
  { id: 'monitoring', title: 'Syslog & SNMP', icon: '📈' },
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

export const AUTH_METHODS: Option[] = [
  { value: 'passthrough', label: 'Passthrough (username/password)' },
  { value: 'radius-auth', label: 'RADIUS' },
  { value: 'saml-auth', label: 'SAML' },
  { value: 'securid-auth', label: 'RSA SecurID' },
  { value: 'certificate-auth', label: 'X.509 certificate' },
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
        help: 'Needed when the inner UAG certificate is not from a trusted CA. Use the thumbprint helper under Horizon settings.'
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
        help: 'Up to 24 characters: A-Z, 0-9, minus and period; no spaces. Must match the VM name on Azure.'
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
        placeholder: 'C:\\ova\\euc-unified-access-gateway-26.09.0.0-xxxxxxxx_OVF10.ova',
        platforms: vsphereHyperv,
        help: 'vSphere: full path or URL of the .ova. Hyper-V: path of the .vhdx.'
      }),
      text('target', 'vCenter target', 'target', {
        wide: true,
        required: true,
        platforms: ['vsphere'],
        placeholder: 'vi://administrator@vsphere.local@vcenter.corp.local/DC1/host/Cluster1',
        help: 'OVF Tool locator. Must reference a vCenter host or cluster; deploying directly to an ESXi host is not supported.'
      }),
      text('folder', 'VM folder', 'folder', { platforms: ['vsphere'], help: 'VMs and Templates folder; must exist.' }),
      text('ds', 'Datastore', 'ds', { platforms: vsphereHyperv, required: true, placeholder: 'datastore1' }),
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
        help: 'NIC1 is the combined Backend + Management network for twonic; threenic uses it for Management traffic.'
      }),
      text('netBackendNetwork', 'Backend network (NIC2)', 'netBackendNetwork', {
        platforms: vsphereHyperv,
        required: true,
        showIf: (v) => deploymentNicCount(v) === 3,
        help: 'The dedicated Backend interface is available only with threenic.'
      }),
      text('ip0', 'NIC0 Internet IPv4 address', 'ip0', { rule: 'ipv4', platforms: vsphereHyperv, required: true, placeholder: '192.0.2.21' }),
      text('netmask0', 'NIC0 Internet netmask', 'netmask0', { rule: 'ipv4', platforms: vsphereHyperv, required: true, placeholder: '255.255.255.0' }),
      text('ip1', 'NIC1 Management / Backend IPv4 address', 'ip1', {
        rule: 'ipv4',
        platforms: vsphereHyperv,
        required: true,
        showIf: (v) => deploymentNicCount(v) >= 2
      }),
      text('netmask1', 'NIC1 Management / Backend netmask', 'netmask1', {
        rule: 'ipv4',
        platforms: vsphereHyperv,
        required: true,
        showIf: (v) => deploymentNicCount(v) >= 2
      }),
      text('ip2', 'NIC2 Backend IPv4 address', 'ip2', {
        rule: 'ipv4',
        platforms: vsphereHyperv,
        required: true,
        showIf: (v) => deploymentNicCount(v) === 3
      }),
      text('netmask2', 'NIC2 Backend netmask', 'netmask2', {
        rule: 'ipv4',
        platforms: vsphereHyperv,
        required: true,
        showIf: (v) => deploymentNicCount(v) === 3
      }),
      text('defaultGateway', 'Default gateway', 'defaultGateway', {
        rule: 'ipv4',
        platforms: vsphereHyperv,
        required: true,
        placeholder: '192.0.2.1',
        help: 'IPv4 gateway on the NIC0 Internet network.'
      }),
      text('routes0', 'NIC0 static routes', 'routes0', {
        rule: 'staticRoutes',
        platforms: vsphereHyperv,
        since: '2306',
        wide: true,
        placeholder: '10.108.172.32/32 10.108.172.253,192.168.20.0/24 10.0.0.1',
        help: 'Comma-separated CIDR-and-gateway pairs. Format: IPv4-network/prefix gateway-IPv4.'
      }),
      text('routes1', 'NIC1 static routes', 'routes1', {
        rule: 'staticRoutes',
        platforms: vsphereHyperv,
        since: '2306',
        wide: true,
        showIf: (v) => deploymentNicCount(v) >= 2,
        placeholder: '192.168.20.0/24 192.168.10.1',
        help: 'Available only on two- and three-NIC deployments; same comma-separated CIDR-and-gateway format as routes0.'
      }),
      text('routes2', 'NIC2 static routes', 'routes2', {
        rule: 'staticRoutes',
        platforms: vsphereHyperv,
        since: '2306',
        wide: true,
        showIf: (v) => deploymentNicCount(v) === 3,
        placeholder: '172.16.0.0/12 10.2.0.1',
        help: 'Available only on three-NIC deployments; same comma-separated CIDR-and-gateway format as routes0.'
      }),
      sel('ipmode0', 'NIC addressing mode (ipmode0)', 'ipmode0', [
        '',
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
      ], {
        platforms: vsphereHyperv,
        since: '2306',
        help: 'Omnissa documents one ipmode0 key and says it controls the selected NIC topology. No ipmode1/ipmode2 keys are documented.'
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
    id: 'runtime',
    title: 'Run-time options (uagdeploy.ps1)',
    section: 'network',
    target: 'runtime',
    iniSection: 'Runtime',
    help: 'Not INI settings: these are passed on the uagdeploy command line and only affect the PowerShell output. Gateway Forge never asks for or stores the UAG root or Admin UI passwords. Omnissa marks -rootPwd and -adminPwd as mandatory for headless deployment. It separately documents an immutable option without an Admin UI password: the appliance can be production-ready, but the Admin UI and API are unavailable, no user can be added later, and administrative recovery requires redeployment. This is not a passwordless appliance; assess console access, break-glass recovery, logging, rotation, and compliance before choosing that model.',
    fields: [
      bool('run_noSSLVerify', 'Skip SSL/TLS certificate verification (-noSSLVerify)', 'run_noSSLVerify', false, {
        wide: true,
        json: false,
        help: 'Disables SSL/TLS certificate verification in the deployment script. Use only in labs or with self-signed endpoints you trust.'
      }),
      bool('run_disableVerification', 'Skip OVA/OVF signature verification (-disableVerification)', 'run_disableVerification', false, {
        wide: true,
        json: false,
        platforms: ['vsphere'],
        help: 'vSphere only. Skips validating the digital signature and certificate chain embedded in the source OVA/OVF during import.'
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
      text('dnsSearch', 'DNS search domains', 'dnsSearch', { placeholder: 'corp.local', json: false }),
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
    id: 'azure',
    title: 'Azure deployment',
    section: 'network',
    target: 'azure',
    iniSection: 'Azure',
    platforms: ['azure'],
    help: 'The [Azure] section replaces the vSphere/Hyper-V network keys. Use uagdeployaz.ps1.',
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
      bool('tunnelEnabled', 'Enable tunnel (secure gateway)', 'tunnelEnabled', true),
      text('tunnelExternalUrl', 'Tunnel external URL', 'tunnelExternalUrl', {
        rule: 'httpsUrl',
        placeholder: 'https://vdi.example.com:443',
        showIf: (v) => v.tunnelEnabled === true,
        since: '2412'
      }),
      text('additionalTunnelExternalUrls', 'Additional tunnel external URLs', 'additionalTunnelExternalUrls', {
        rule: 'urlList',
        since: '2412',
        wide: true,
        showIf: (v) => v.tunnelEnabled === true,
        help: 'Comma-separated; hostnames must be unique.'
      }),
      bool('blastEnabled', 'Enable Blast', 'blastEnabled', true),
      text('blastExternalUrl', 'Blast external URL', 'blastExternalUrl', {
        rule: 'httpsUrl',
        placeholder: 'https://vdi.example.com:443',
        showIf: (v) => v.blastEnabled === true,
        help: 'Default TCP/UDP port is 8443 when omitted.'
      }),
      text('additionalBlastExternalUrls', 'Additional Blast external URLs', 'additionalBlastExternalUrls', {
        rule: 'urlList',
        since: '2412',
        wide: true,
        showIf: (v) => v.blastEnabled === true
      }),
      text('blastAllowedHostHeaderValues', 'Blast allowed Host header values', 'blastAllowedHostHeaderValues', {
        wide: true,
        showIf: (v) => v.blastEnabled === true,
        help: 'host[:port] list; use _empty_ to allow requests without a Host header.'
      }),
      bool('pcoipEnabled', 'Enable PCoIP', 'pcoipEnabled', false),
      text('pcoipExternalUrl', 'PCoIP external URL', 'pcoipExternalUrl', {
        rule: 'ipv4Port',
        placeholder: '192.0.2.21:4172',
        showIf: (v) => v.pcoipEnabled === true,
        help: 'Must contain an IPv4 address, not a hostname.'
      }),
      sel('clientEncryptionMode', 'Client encryption mode', 'clientEncryptionMode', ['ALLOWED', 'REQUIRED', 'DISABLED'], { default: 'ALLOWED' }),
      bool('hostRedirectionEnabled', 'Honor Connection Server redirect', 'hostRedirectionEnabled', false),
      bool('originCheckEnabled', 'Origin header check', 'originCheckEnabled', true, { since: '2503' }),
      bool('disableWebClient', 'Disable web client access', 'disableWebClient', false, { since: '2412' }),
      bool('windowsSSOEnabled', 'Windows SSO (RADIUS passcode = AD password)', 'windowsSSOEnabled', false, {
        showIf: (v) => v.authMethods === 'radius-auth'
      }),
      bool('matchWindowsUserName', 'Match Windows user name', 'matchWindowsUserName', false),
      bool('smartCardHintPrompt', 'Smart card hint prompt', 'smartCardHintPrompt', false, { showIf: (v) => v.authMethods === 'certificate-auth' }),
      bool('enableAuthOnRedirectedSite', 'Re-authenticate on home site (CPA)', 'enableAuthOnRedirectedSite', false, { since: '2406' }),
      text('radiusUsernameLabel', 'RADIUS username label', 'radiusUsernameLabel', {
        showIf: (v) => v.authMethods === 'radius-auth',
        placeholder: 'Username',
        help: 'Max 20 characters.'
      }),
      text('radiusPasscodeLabel', 'RADIUS passcode label', 'radiusPasscodeLabel', {
        showIf: (v) => v.authMethods === 'radius-auth',
        placeholder: 'Passcode',
        help: 'Max 20 characters.'
      }),
      text('samlSP', 'SAML service provider name', 'samlSP', { showIf: (v) => v.authMethods === 'saml-auth', help: 'Name of the SP metadata, or DEMO.' }),
      text('idpEntityID', 'SAML identity provider entity ID', 'idpEntityID', { since: '2603', showIf: (v) => v.authMethods === 'saml-auth', wide: true }),
      sel('idpBindingType', 'SAML binding', 'idpBindingType', ['POST', 'ARTIFACT'], { since: '2603', showIf: (v) => v.authMethods === 'saml-auth' }),
      text('allowedAudiences', 'SAML audiences', 'allowedAudiences', { showIf: (v) => v.authMethods === 'saml-auth', wide: true }),
      text('healthCheckUrl', 'Health check URI', 'healthCheckUrl', { rule: 'path', placeholder: '/favicon.ico' }),
      text('proxyPattern', 'Proxy pattern (regex)', 'proxyPattern', {
        wide: true,
        placeholder: '(/|/view-client(.*)|/portal(.*)|/appblast(.*))',
        help: 'Leave empty for the Horizon default.'
      })
    ]
  },
  {
    id: 'airwatch',
    title: 'Workspace ONE Tunnel gateway',
    section: 'tunnel',
    target: 'airwatch',
    iniSection: 'Airwatch',
    enabledBy: 'airwatch_enabled',
    platforms: ['vsphere', 'hyperv'],
    help: 'Configures the Workspace ONE Tunnel edge service through its documented [Airwatch] PowerShell INI section. This edge service is supported for UAG deployed on vSphere or Hyper-V. The settings JSON mapping is not documented, so this section is INI-only.',
    fields: [
      bool('airwatch_tunnelGatewayEnabled', 'Enable Tunnel gateway', 'tunnelGatewayEnabled', true, { json: false }),
      text('airwatch_apiServerUrl', 'Workspace ONE UEM API server URL', 'apiServerUrl', {
        rule: 'httpsUrl',
        required: true,
        wide: true,
        placeholder: 'https://as1234.awmdm.com',
        json: false,
        help: 'REST API URL from Groups & Settings > All Settings > Advanced > Site URLs in Workspace ONE UEM.'
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
      text('airwatch_hostEntry1', 'Host entries', 'hostEntry1', {
        rule: 'hostEntryList',
        wide: true,
        placeholder: '10.0.0.15 api.corp.local',
        json: false,
        help: 'Optional /etc/hosts entries: IP, hostname, optional alias, separated by spaces; separate entries with commas.'
      }),
      text('airwatch_trustedCert1', 'Trusted CA certificate (PEM path)', 'trustedCert1', {
        wide: true,
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
    help: 'Third-party IdP metadata for SAML authentication. Select SAML as the auth method on the Horizon edge service.',
    fields: [
      text('saml_entityID', 'IdP entity ID', 'entityID', { required: true, wide: true, placeholder: 'https://idp.example.com/metadata' }),
      text('saml_metadataXmlFile', 'IdP metadata XML file', 'metadataXmlFile', {
        wide: true,
        required: true,
        placeholder: 'C:\\uag\\idp-metadata.xml',
        json: false,
        help: 'Local path read by uagdeploy at deployment time.'
      }),
      bool('saml_forceAuthN', 'Force re-authentication', 'forceAuthN', false),
      bool('saml_allowUnencrypted', 'Allow unencrypted assertions', 'allowUnencrypted', false)
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
      text('cert_pemCerts', 'Internet-facing cert chain (PEM)', 'pemCerts', { wide: true, placeholder: 'C:\\certs\\uag-chain.pem', json: false }),
      text('cert_pemPrivKey', 'Internet-facing private key (PEM)', 'pemPrivKey', { wide: true, placeholder: 'C:\\certs\\uag-key.pem', json: false }),
      text('cert_pfxCerts', 'Or PFX file', 'pfxCerts', { wide: true, json: false }),
      text('cert_pfxCertAlias', 'PFX alias', 'pfxCertAlias', { json: false })
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
      text('hostEntry1', 'Host entry (/etc/hosts)', 'hostEntry1', { placeholder: '10.0.0.5 intranet.corp.local', wide: true }),
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
  horizon_enabled: true,
  radius_enabled: false,
  saml_enabled: false,
  snmp_enabled: false,
  oidc_enabled: false,
  securid_enabled: false,
  certauth_enabled: false,
  obp_enabled: false,
  airwatch_enabled: false
};

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
