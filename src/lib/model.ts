import {
  GROUPS,
  LISTS,
  VIRTUAL_DEFAULTS,
  fieldDefaults,
  type Field,
  type GroupDef,
  type ListDef,
  type SectionId,
  type Values
} from './schema';
import { DEFAULT_VERSION, inVersion, type Platform } from './versions';
import { compactConfigTrustedCerts } from './trusted-certs';
import { normalizeHostEntries } from './host-entries';

export interface Config {
  version: string;
  platform: Platform;
  values: Values;
  wrp: Values[];
  syslog: Values[];
  adminUsers: Values[];
  jwt: Values[];
  jwtIssuers: Values[];
  oidc: Values[];
}

export type SelectableService = 'horizon' | 'tunnel' | 'contentGateway' | 'seg' | 'wrp';

export function activeWrpItems(c: Config): Values[] {
  return c.wrp.filter((item) => item.enabled !== false);
}

export function setServiceSelected(c: Config, service: SelectableService, selected: boolean): void {
  if (service === 'horizon') c.values.horizon_enabled = selected;
  else if (service === 'tunnel') c.values.airwatch_enabled = selected;
  else if (service === 'contentGateway') c.values.contentGateway_enabled = selected;
  else if (service === 'seg') c.values.seg_enabled = selected;
  else if (selected) {
    if (c.wrp.length === 0) c.wrp.push(newListItem('wrp'));
    c.wrp.forEach((item) => { item.enabled = true; });
  } else {
    c.wrp.forEach((item) => { item.enabled = false; });
  }
}

export function sectionSelected(c: Config, section: SectionId): boolean {
  if (section === 'ha') return c.values.ha_enabled === true;
  if (section === 'horizon') return c.values.horizon_enabled === true;
  if (section === 'tunnel') return c.values.airwatch_enabled === true;
  if (section === 'contentGateway') return c.values.contentGateway_enabled === true;
  if (section === 'seg') return c.values.seg_enabled === true;
  if (section === 'wrp') return activeWrpItems(c).length > 0;
  if (section === 'auth') {
    return c.jwt.length > 0 || c.jwtIssuers.length > 0 || GROUPS.some((group) =>
      group.section === 'auth'
      && !!group.enabledBy
      && c.values[group.enabledBy] === true
    );
  }
  if (section === 'monitoring') return c.values.snmp_enabled === true || c.syslog.length > 0;
  if (section === 'adminUsers') return c.adminUsers.length > 0;
  return true;
}

export function listDef(id: ListDef['id']): ListDef {
  return LISTS.find((l) => l.id === id)!;
}

export function newListItem(id: ListDef['id']): Values {
  return fieldDefaults(listDef(id).fields);
}

export function defaultConfig(): Config {
  const values: Values = { ...VIRTUAL_DEFAULTS };
  for (const g of GROUPS) Object.assign(values, fieldDefaults(g.fields));
  return {
    version: DEFAULT_VERSION,
    platform: 'vsphere',
    values,
    wrp: [],
    syslog: [],
    adminUsers: [],
    jwt: [],
    jwtIssuers: [],
    oidc: []
  };
}

export function cloneConfig(c: Config): Config {
  return JSON.parse(JSON.stringify(c)) as Config;
}

export function fieldAvailable(f: Field, version: string, platform: Platform, v: Values): boolean {
  if (!inVersion(version, f.since, f.until)) return false;
  if (f.platforms && !f.platforms.includes(platform)) return false;
  if (f.ipMode !== undefined && (platform === 'nutanix' || platform === 'openshift') && v[`ipMode${f.ipMode}`] !== 'STATICV4') return false;
  if (f.showIf && !f.showIf(v)) return false;
  return true;
}

export function groupAvailable(g: GroupDef, version: string, platform: Platform): boolean {
  if (g.platforms && !g.platforms.includes(platform)) return false;
  return inVersion(version, g.since);
}

export function listEnabled(list: ListDef, c: Config): boolean {
  return inVersion(c.version, list.since) && (!list.enabledBy || c.values[list.enabledBy] === true);
}

export function groupEnabled(g: GroupDef, c: Config): boolean {
  if (!groupAvailable(g, c.version, c.platform)) return false;
  if (g.target === 'horizon' && c.values.cascade_role === 'outer') return false;
  if (g.enabledBy) return c.values[g.enabledBy] === true;
  return true;
}

export function nicUsesStaticIpv4(c: Config, nic: 0 | 1 | 2): boolean {
  if (c.platform === 'vsphere' || c.platform === 'hyperv') return true;
  if (c.platform === 'nutanix' || c.platform === 'openshift') return c.values[`ipMode${nic}`] === 'STATICV4';
  return false;
}

export function isEmpty(x: unknown): boolean {
  return x === undefined || x === null || x === '';
}

export function isDefault(f: Field, value: unknown): boolean {
  return f.default !== undefined && String(f.default) === String(value);
}

export function unsafeSegJwtValue(key: string, value: unknown): boolean {
  if (/password|passwd|pwd$|token|credential|privateKeyPem|pfxKeystore|jsonWebKeySet|jwtSigning/i.test(key)) return true;
  if (typeof value !== 'string') return value !== null && typeof value === 'object';
  if (/-----BEGIN[^-]*(?:PRIVATE KEY|PUBLIC KEY|CERTIFICATE)-----|"(?:d|k|privateKeyPem|pfxKeystore)"\s*:|\beyJ[\w-]+\.[\w-]+\.[\w-]+/i.test(value)) return true;
  if (/^(?:seg_)?(?:pemPrivKey|pemCerts|pfxCerts|trustedCert\d+|publicKey\d+|encryptionPublicKey)$/i.test(key)) {
    return !!value.trim() && (/[\r\n]/.test(value) || !/\.(?:pem|key|crt|cer|pfx|p12)$/i.test(value.trim()));
  }
  if (/url$/i.test(key) && /:\/\/[^/]*@|[?&](?:access_token|token|password|api_key|apikey|secret)=/i.test(value)) return true;
  return false;
}

/** Replace every secret value with an empty string (used before persisting a draft). */
export function stripSecrets(c: Config): Config {
  const out = cloneConfig(c);
  for (const g of GROUPS) for (const f of g.fields) if (f.secret) out.values[f.id] = '';
  for (const key of ['rootPwd', 'adminPwd', 'rootPassword', 'adminPassword', 'UAG_ROOT_PASSWORD', 'UAG_ADMIN_PASSWORD']) {
    delete out.values[key];
  }
  for (const id of ['jwt', 'jwtIssuers'] as const) {
    const allowed = new Set(listDef(id).fields.map((f) => f.id));
    out[id] = (out[id] ?? []).map((item) => Object.fromEntries(Object.entries(item).filter(([key, value]) => allowed.has(key) && !unsafeSegJwtValue(key, value))));
  }
  const segFields = new Set(GROUPS.find((g) => g.id === 'seg')!.fields.map((f) => f.id));
  for (const key of Object.keys(out.values)) {
    if (/^(?:seg|jwt|UAG_SEG_|awSEG)/i.test(key)
      && (!segFields.has(key) && key !== 'seg_enabled' || unsafeSegJwtValue(key, out.values[key]))) delete out.values[key];
  }
  const adminFields = new Set(listDef('adminUsers').fields.map((field) => field.id));
  out.adminUsers = out.adminUsers.map((item) => Object.fromEntries(
    Object.entries(item).filter(([key]) => adminFields.has(key))
  ));
  const oidcFields = new Set(listDef('oidc').fields.map((field) => field.id));
  out.oidc = (out.oidc ?? []).map((item) => Object.fromEntries(Object.entries(item).filter(([key]) => oidcFields.has(key))));
  compactConfigTrustedCerts(out);
  return out;
}

/** Merge a partial config onto a base, ignoring unknown keys. */
export function applyPatch(base: Config, patch: Partial<Omit<Config, 'values'>> & { values?: Values }): Config {
  const out = cloneConfig(base);
  if (patch.version) out.version = patch.version;
  if (patch.platform) out.platform = patch.platform;
  if (patch.values) Object.assign(out.values, patch.values);
  for (const group of GROUPS) normalizeHostEntries(out.values, group.fields);
  if (patch.wrp) out.wrp = patch.wrp.map((item) => {
    const values = { ...newListItem('wrp'), ...item };
    normalizeHostEntries(values, listDef('wrp').fields);
    return values;
  });
  if (patch.syslog) out.syslog = patch.syslog.map((item) => ({ ...newListItem('syslog'), ...item }));
  for (const id of ['jwt', 'jwtIssuers'] as const) {
    if (patch[id]) out[id] = patch[id].map((item) => ({ ...newListItem(id), ...item }));
    else out[id] ??= [];
  }
  const oidcFields = listDef('oidc').fields.map((field) => field.id);
  if (patch.oidc) out.oidc = patch.oidc.map((item) => ({ ...newListItem('oidc'), ...Object.fromEntries(oidcFields.filter((key) => key in item).map((key) => [key, item[key]])) }));
  else out.oidc ??= [];
  if (patch.adminUsers) {
    const fields = listDef('adminUsers').fields.map((field) => field.id);
    out.adminUsers = patch.adminUsers.map((item) => ({
      ...newListItem('adminUsers'),
      ...Object.fromEntries(fields.filter((key) => key in item).map((key) => [key, item[key]]))
    }));
  }
  compactConfigTrustedCerts(out);
  return out;
}
