import {
  GROUPS,
  LISTS,
  VIRTUAL_DEFAULTS,
  fieldDefaults,
  type Field,
  type GroupDef,
  type ListDef,
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
    syslog: []
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

/** Replace every secret value with an empty string (used before persisting a draft). */
export function stripSecrets(c: Config): Config {
  const out = cloneConfig(c);
  for (const g of GROUPS) for (const f of g.fields) if (f.secret) out.values[f.id] = '';
  for (const key of ['rootPwd', 'adminPwd', 'rootPassword', 'adminPassword', 'UAG_ROOT_PASSWORD', 'UAG_ADMIN_PASSWORD']) {
    delete out.values[key];
  }
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
  compactConfigTrustedCerts(out);
  return out;
}
