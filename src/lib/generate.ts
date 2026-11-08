import {
  GROUPS,
  LISTS,
  type Field,
  type Primitive,
  type Target,
  type Values
} from './schema';
import { fieldAvailable, groupEnabled, isDefault, isEmpty, type Config } from './model';
import { CASCADE_INSTANCE_ID, CASCADE_PATTERN, CASCADE_PATTERN_OPSWAT, cascadeRole, forwardRules } from './cascade';
import { platformDef } from './versions';

export type SecretMode = 'placeholder' | 'omit' | 'include';
export const SECRET_PLACEHOLDER = '<REDACTED>';

export interface Entry {
  key: string;
  jsonKey: string | false;
  value: Primitive;
  field: Field;
  secret: boolean;
}

export interface Block {
  /** INI section name. */
  section: string;
  target: Target;
  /** 1-based index for list blocks. */
  index?: number;
  entries: Entry[];
}

export interface GenerateOptions {
  secrets: SecretMode;
}

const SECTION_ORDER = ['General', 'Azure', 'Horizon', 'WebReverseProxy', 'RADIUSAuth', 'SecurIDAuth', 'CertificateAuth', 'OidcProviderSetting', 'IDPExternalMetadata1', 'OutboundProxySettings', 'SSLCert', 'SnmpSettings', 'SyslogServerSettings'];

function sectionRank(name: string): number {
  const i = SECTION_ORDER.findIndex((s) => name.startsWith(s));
  return i === -1 ? SECTION_ORDER.length : i;
}

function entryFor(f: Field, values: Values, mode: SecretMode): Entry | null {
  const raw = values[f.id];
  if (isEmpty(raw)) return null;
  if (f.omitDefault && isDefault(f, raw)) return null;
  let value = raw as Primitive;
  if (f.secret) {
    if (mode === 'omit') return null;
    if (mode === 'placeholder') value = SECRET_PLACEHOLDER;
  }
  return { key: f.key, jsonKey: f.json === undefined ? f.key : f.json, value, field: f, secret: !!f.secret };
}

/** Resolve a config into ordered INI blocks, applying version/platform/visibility rules. */
export function collectBlocks(c: Config, opts: GenerateOptions = { secrets: 'placeholder' }): Block[] {
  const blocks = new Map<string, Block>();
  const get = (section: string, target: Target, index?: number): Block => {
    let b = blocks.get(section);
    if (!b) {
      b = { section, target, index, entries: [] };
      blocks.set(section, b);
    }
    return b;
  };

  for (const g of GROUPS) {
    if (g.target === 'cascade' || g.target === 'runtime') continue;
    if (!groupEnabled(g, c)) continue;
    if (g.target === 'horizon' && c.values.horizon_enabled !== true) continue;
    const entries: Entry[] = [];
    for (const f of g.fields) {
      if (!fieldAvailable(f, c.version, c.platform, c.values)) continue;
      if (f.ini === false) continue;
      const e = entryFor(f, c.values, opts.secrets);
      if (e) entries.push(g.target === 'deploy' ? { ...e, jsonKey: false } : e);
    }
    if (g.target === 'snmp' && c.values.snmp_enabled === true) {
      const sys = get('General', 'system');
      sys.entries.push({
        key: 'snmpEnabled',
        jsonKey: 'snmpEnabled',
        value: true,
        field: { id: 'snmpEnabled', label: 'SNMP enabled', type: 'bool', key: 'snmpEnabled' },
        secret: false
      });
    }
    if (entries.length === 0) continue;
    // 'General' holds both deploy-time and system keys; JSON only uses entries with a json key.
    get(g.iniSection, g.target === 'deploy' ? 'system' : g.target).entries.push(...entries);
  }

  const outer = cascadeRole(c.values) === 'outer';
  if (outer) {
    const f = (key: string): Field => ({ id: key, label: key, type: 'text', key });
    const v = c.values;
    const wrp: Entry[] = [
      [ 'instanceId', CASCADE_INSTANCE_ID ],
      [ 'proxyDestinationUrl', String(v.cascade_innerUrl ?? '') ],
      [ 'proxyDestinationUrlThumbprints', String(v.cascade_innerThumbprints ?? '') ],
      [ 'trustedCert1', String(v.cascade_innerTrustedCert ?? '') ],
      [ 'proxyPattern', v.cascade_opswat === true ? CASCADE_PATTERN_OPSWAT : CASCADE_PATTERN ]
    ]
      .filter(([, val]) => val !== '')
      .map(([key, val]) => ({ key, jsonKey: key, value: val, field: f(key), secret: false }));
    if (wrp.length) get('WebReverseProxy1', 'wrp', 1).entries.push(...wrp);
    const rules = forwardRules(v);
    if (rules) get('General', 'system').entries.push({ key: 'forwardrules', jsonKey: false, value: rules, field: f('forwardrules'), secret: false });
  }

  for (const l of LISTS) {
    const items = c[l.id];
    const offset = outer && l.id === 'wrp' ? 1 : 0;
    items.forEach((item, i) => {
      const entries: Entry[] = [];
      for (const f of l.fields) {
        if (!fieldAvailable(f, c.version, c.platform, item)) continue;
        const e = entryFor(f, item, opts.secrets);
        if (e) entries.push(e);
      }
      if (entries.length) get(l.iniSection(i + 1 + offset), l.target, i + 1 + offset).entries.push(...entries);
    });
  }

  return [...blocks.values()].sort((a, b) => sectionRank(a.section) - sectionRank(b.section) || a.section.localeCompare(b.section, 'en', { numeric: true }));
}

export function formatIniValue(v: Primitive): string {
  return typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
}

export function generateIni(c: Config, opts: GenerateOptions = { secrets: 'placeholder' }): string {
  const blocks = collectBlocks(c, opts);
  const lines: string[] = [
    `# Generated by Gateway Forge for Omnissa Unified Access Gateway ${c.version}`,
    `# Deploy: ${deploymentCommand(c)}`,
    ''
  ];
  for (const b of blocks) {
    lines.push(`[${b.section}]`);
    for (const e of b.entries) lines.push(`${e.key}=${formatIniValue(e.value)}`);
    lines.push('');
  }
  return lines.join('\n').replace(/\n+$/, '\n');
}

export function platformScript(c: Config): string {
  return platformDef(c.platform).script;
}

export function deploymentCommand(c: Config, switches = ''): string {
  const file = `.\\${iniFileName(c)}`;
  const script = `.\\${platformScript(c)}`;
  if (c.platform === 'nutanix' || c.platform === 'azure') return `${script} ${file}${switches}`;
  return `${script} -iniFile ${file}${switches}`;
}

export function iniFileName(c: Config): string {
  const n = String(c.values.name || c.values.uagName || 'uag').replace(/[^A-Za-z0-9._-]/g, '_');
  return `${n}.ini`;
}

export function jsonFileName(c: Config): string {
  return iniFileName(c).replace(/\.ini$/, '.json');
}

/** Settings JSON keys whose value is an array in the admin-UI export format. */
export const JSON_ARRAY_KEYS = new Set([
  'cipherSuites',
  'outboundCipherSuites',
  'tlsNamedGroups',
  'tlsSignatureSchemes',
  'additionalBlastExternalUrls',
  'additionalTunnelExternalUrls',
  'allowedAudiences',
  'blastAllowedHostHeaderValues'
]);

export function toJsonValue(key: string, value: Primitive): unknown {
  if (JSON_ARRAY_KEYS.has(key) && typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return value;
}

function objectFrom(entries: Entry[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const e of entries) {
    if (e.jsonKey === false) continue;
    o[e.jsonKey] = toJsonValue(e.jsonKey, e.value);
  }
  return o;
}

/**
 * Settings document for the admin UI "Import settings" / PUT /rest/v1/config/settings.
 * The structure mirrors the admin-UI JSON export (systemSettings, edgeServiceSettingsList,
 * authMethodSettingsList, ...). Validate by importing into a non-production appliance first.
 */
export function generateJsonObject(c: Config, opts: GenerateOptions = { secrets: 'placeholder' }): Record<string, unknown> {
  const blocks = collectBlocks(c, opts);
  const doc: Record<string, unknown> = {};

  const system: Record<string, unknown> = {};
  for (const b of blocks.filter((x) => x.section === 'General')) Object.assign(system, objectFrom(b.entries));
  if (Object.keys(system).length) doc.systemSettings = system;

  const edge: Record<string, unknown>[] = [];
  for (const b of blocks) {
    if (b.target === 'horizon') edge.push({ identifier: 'VIEW', enabled: true, ...objectFrom(b.entries) });
    if (b.target === 'wrp') edge.push({ identifier: 'WEB_REVERSE_PROXY', enabled: true, ...objectFrom(b.entries) });
  }
  if (edge.length) doc.edgeServiceSettingsList = { edgeServiceSettingsList: edge };

  const radius = blocks.find((b) => b.target === 'radius');
  if (radius) doc.authMethodSettingsList = { authMethodSettingsList: [{ name: 'radius-auth', enabled: true, ...objectFrom(radius.entries) }] };

  const saml = blocks.find((b) => b.target === 'saml');
  if (saml) doc.idpExternalMetadataSettingsList = { idpExternalMetadataSettingsList: [objectFrom(saml.entries)] };

  const snmp = blocks.find((b) => b.target === 'snmp');
  if (snmp) doc.snmpSettings = objectFrom(snmp.entries);

  const syslog = blocks.filter((b) => b.target === 'syslog').map((b) => objectFrom(b.entries));
  if (syslog.length) doc.syslogSettings = { syslogServerSettingsList: syslog };

  return doc;
}

export function generateJson(c: Config, opts: GenerateOptions = { secrets: 'placeholder' }): string {
  return JSON.stringify(generateJsonObject(c, opts), null, 2) + '\n';
}

export function manifestFileName(c: Config): string {
  const base = String(c.values.ocp_volume || 'uag-bootable-volume').replace(/[^a-z0-9.-]/gi, '-');
  return `${base}.${c.values.ocp_volumeSourceMode === 'console' ? 'md' : 'yaml'}`;
}

/** CDI DataVolume + DataSource manifest used as the OpenShift bootable-volume preparation artifact. */
export function generateBootableVolumeManifest(c: Config): string {
  if (c.platform !== 'openshift') return '# OpenShift bootable-volume manifest: select the OpenShift platform first.\n';
  const v = c.values;
  if (v.ocp_volumeSourceMode === 'console') {
    return [
      '# OpenShift bootable-volume preparation runbook',
      '',
      'Gateway Forge cannot upload a local QCOW2 file to an OpenShift cluster, so this mode intentionally emits no Kubernetes manifest.',
      '',
      `1. In the OpenShift web console, select the **${v.ocp_namespace || '<destination-project>'}** project.`,
      '2. Open Virtualization > Bootable volumes and start the local image upload flow.',
      `3. Use **${v.ocp_volume || '<volume-name>'}** as the volume name and select storage class **${v.ocp_storageClass || '<storage-class>'}**.`,
      `4. Allocate at least **${v.ocp_diskSizeGi || 20} GiB** and complete the upload.`,
      `5. Verify the DataVolume/PVC/DataSource named **${v.ocp_volume || '<volume-name>'}** report the expected Succeeded/Bound state.`,
      '6. Continue with the generated OpenShift deployment PowerShell command.',
      '',
      'The namespace, StorageClass, NADs, RBAC, NetworkPolicies and cluster capacity must already exist.',
      ''
    ].join('\n');
  }
  const q = (x: unknown) => JSON.stringify(String(x ?? ''));
  const volume = String(v.ocp_volume || '<volume-name>');
  const namespace = String(v.ocp_namespace || '<destination-project>');
  const disk = Number(v.ocp_diskSizeGi) || 20;
  return [
    'apiVersion: cdi.kubevirt.io/v1beta1',
    'kind: DataVolume',
    'metadata:',
    `  name: ${q(volume)}`,
    `  namespace: ${q(namespace)}`,
    '  annotations:',
    `    description: "UAG bootable volume generated by Gateway Forge"`,
    'spec:',
    '  source:',
    '    http:',
    `      url: ${q(v.ocp_qcow2Url || '<cluster-reachable-qcow2-url>')}`,
    '  storage:',
    '    accessModes:',
    '      - ReadWriteMany',
    '    volumeMode: Filesystem',
    '    resources:',
    '      requests:',
    `        storage: "${disk}Gi"`,
    `    storageClassName: ${q(v.ocp_storageClass || '<rwx-storage-class>')}`,
    '---',
    'apiVersion: cdi.kubevirt.io/v1beta1',
    'kind: DataSource',
    'metadata:',
    `  name: ${q(volume)}`,
    `  namespace: ${q(namespace)}`,
    '  labels:',
    '    instancetype.kubevirt.io/default-preference: linux',
    '  annotations:',
    '    vm.kubevirt.io/os: "linux"',
    '    description: "UAG bootable volume generated by Gateway Forge"',
    'spec:',
    '  source:',
    '    pvc:',
    `      name: ${q(volume)}`,
    `      namespace: ${q(namespace)}`,
    ''
  ].join('\n');
}
