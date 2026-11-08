import { GROUPS, LISTS, RUNTIME_FIELDS, type Field, type GroupDef, type ListDef, type Primitive, type Values } from './schema';
import { defaultConfig, newListItem, type Config } from './model';
import { SECRET_PLACEHOLDER, formatOriginHeaderDetails, parseOriginHeaderDetails } from './generate';
import { inVersion, isSupportedVersion } from './versions';
import { CASCADE_INSTANCE_ID, parseForwardRules } from './cascade';
import { compactConfigTrustedCerts, writeTrustedCertPaths } from './trusted-certs';
import { serializeListValue } from './listValue';

export interface Unmapped {
  where: string;
  key: string;
  value?: string;
}

export interface ImportResult {
  config: Config;
  format: 'ini' | 'json';
  warnings: string[];
  unmapped: Unmapped[];
  /** Number of fields that were populated from the input. */
  mapped: number;
  versionDetected?: boolean;
}

export type IniDoc = { section: string; entries: { key: string; value: string }[] }[];

export function parseIni(text: string): IniDoc {
  const doc: IniDoc = [];
  let cur: IniDoc[number] | null = null;
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const sec = /^\[([^\]]+)\]\s*$/.exec(line);
    if (sec) {
      cur = { section: sec[1].trim(), entries: [] };
      doc.push(cur);
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 1 || !cur) continue;
    cur.entries.push({ key: line.slice(0, eq).trim(), value: line.slice(eq + 1).trim() });
  }
  return doc;
}

function isRedacted(v: string): boolean {
  return v === SECRET_PLACEHOLDER || /^\*+$/.test(v) || v === '';
}

function coerce(f: Field, raw: unknown): Primitive {
  if (f.rows) return serializeListValue(Array.isArray(raw) ? raw : [raw]);
  if (Array.isArray(raw)) raw = raw.join(',');
  if (f.type === 'bool') return typeof raw === 'boolean' ? raw : /^(true|1|yes)$/i.test(String(raw));
  if (f.type === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) && String(raw).trim() !== '' ? n : String(raw);
  }
  return String(raw ?? '');
}

function setField(c: Config, values: Values, f: Field, raw: unknown, result: ImportResult, where: string): void {
  if (f.secret && typeof raw === 'string' && isRedacted(raw)) return;
  values[f.id] = coerce(f, raw);
  result.mapped++;
  if (!inVersion(c.version, f.since, f.until)) {
    result.warnings.push(`${where}: "${f.key}" is not available in UAG ${c.version}${f.since ? ` (introduced in ${f.since})` : ''}.`);
  }
}

/** Derive the UAG version from an image file name such as euc-unified-access-gateway-26.09.0.0-123_OVF10.ova. */
export function versionFromSource(source: string): string | undefined {
  const m = /gateway-(\d{2})\.(\d{2})\.\d+\.\d+/i.exec(source);
  if (!m) return undefined;
  const id = `${m[1]}${m[2]}`;
  return isSupportedVersion(id) ? id : undefined;
}

type IniIndex = Map<string, { group?: GroupDef; field: Field }[]>;
const iniIndex: IniIndex = new Map();
for (const g of GROUPS) for (const f of g.fields) {
  if (f.customOutput || f.ini === false) continue;
  for (const key of [f.key, ...(f.aliases ?? [])]) {
    const indexKey = `${g.iniSection}|${key}`.toLowerCase();
    const hits = iniIndex.get(indexKey) ?? [];
    hits.push({ group: g, field: f });
    iniIndex.set(indexKey, hits);
  }
}
for (const field of RUNTIME_FIELDS) {
  iniIndex.set(`runtime|${field.key}`.toLowerCase(), [{ field }]);
}

const listRe = (l: ListDef) => new RegExp(`^${l.iniSection(0).replace(/0$/, '')}(\\d+)$`, 'i');

/** Turn a Horizon-WRP reverse proxy (on a UAG without Horizon edge service) back into the outer cascade role. */
function detectCascade(c: Config): void {
  if (c.values.horizon_enabled === true) return;
  const i = c.wrp.findIndex((w) => String(w.instanceId).toLowerCase() === CASCADE_INSTANCE_ID.toLowerCase());
  if (i < 0) return;
  const [w] = c.wrp.splice(i, 1);
  c.values.cascade_role = 'outer';
  c.values.cascade_innerUrl = String(w.proxyDestinationUrl ?? '');
  c.values.cascade_innerThumbprints = String(w.proxyDestinationUrlThumbprints ?? '');
  const cascadeCertFields = GROUPS.find((g) => g.id === 'cascade')!.fields;
  writeTrustedCertPaths(c.values, cascadeCertFields, Array.from({ length: 9 }, (_, n) => String(w[`trustedCert${n + 1}`] ?? '')).filter(Boolean));
  c.values.cascade_opswat = String(w.proxyPattern ?? '').includes('/gateway/resources');
}

export function importIni(text: string, base?: Config): ImportResult {
  const c = base ? (JSON.parse(JSON.stringify(base)) as Config) : defaultConfig();
  c.values.horizon_enabled = false;
  c.values.airwatch_enabled = false;
  c.values.cascade_role = 'none';
  c.wrp = [];
  c.syslog = [];
  const result: ImportResult = { config: c, format: 'ini', warnings: [], unmapped: [], mapped: 0 };
  const doc = parseIni(text);
  if (doc.length === 0) {
    result.warnings.push('No INI sections found.');
    return result;
  }

  const general = doc.filter((s) => s.section.toLowerCase() === 'general').flatMap((s) => s.entries);
  const source = general.find((e) => e.key.toLowerCase() === 'source')?.value;
  const nutanixImage = doc.filter((s) => s.section.toLowerCase() === 'nutanix').flatMap((s) => s.entries).find((e) => e.key.toLowerCase() === 'image')?.value;
  const detected = versionFromSource(source || nutanixImage || '');
  if (detected) {
    c.version = detected;
    result.versionDetected = true;
  }
  if (doc.some((s) => s.section.toLowerCase() === 'azure')) c.platform = 'azure';
  else if (doc.some((s) => s.section.toLowerCase() === 'nutanix')) c.platform = 'nutanix';
  else if (doc.some((s) => s.section.toLowerCase() === 'openshift')) c.platform = 'openshift';
  else if (source && /\.vhdx?$/i.test(source)) c.platform = 'hyperv';

  const listItems: Record<string, Map<number, Values>> = { wrp: new Map(), syslog: new Map() };
  const originDetails: { index: number; origin: string; rewriteEnabled: boolean; autoGenerated: boolean }[] = [];
  const importedSshPublicKeys: { index: number; value: string }[] = [];

  for (const sec of doc) {
    const lower = sec.section.toLowerCase();
    const originMatch = /^originheaderdetails(\d+)$/.exec(lower);
    if (originMatch) {
      const origin = sec.entries.find((e) => e.key.toLowerCase() === 'origin')?.value;
      if (!origin) {
        result.warnings.push(`[${sec.section}]: origin is missing.`);
        continue;
      }
      originDetails.push({
        index: Number(originMatch[1]),
        origin,
        rewriteEnabled: /^true$/i.test(sec.entries.find((e) => e.key.toLowerCase() === 'rewriteenabled')?.value ?? ''),
        autoGenerated: /^true$/i.test(sec.entries.find((e) => e.key.toLowerCase() === 'autogenerated')?.value ?? '')
      });
      result.mapped += sec.entries.length;
      continue;
    }
    const list = LISTS.find((l) => listRe(l).test(sec.section));
    if (list) {
      const n = Number(listRe(list).exec(sec.section)![1]);
      const item = listItems[list.id].get(n) ?? { ...newListItem(list.id) };
      listItems[list.id].set(n, item);
      for (const e of sec.entries) {
        const f = list.fields.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
        if (!f) result.unmapped.push({ where: `[${sec.section}]`, key: e.key, value: e.value });
        else setField(c, item, f, e.value, result, `[${sec.section}]`);
      }
      continue;
    }
    if (lower === 'horizon') c.values.horizon_enabled = true;
    if (lower === 'airwatch') c.values.airwatch_enabled = true;
    if (lower === 'radiusauth') c.values.radius_enabled = true;
    if (lower === 'snmpsettings') c.values.snmp_enabled = true;
    if (lower === 'idpexternalmetadata1') c.values.saml_enabled = true;
    if (lower === 'oidcprovidersetting') c.values.oidc_enabled = true;
    if (lower === 'securidauth') c.values.securid_enabled = true;
    if (lower === 'certificateauth') c.values.certauth_enabled = true;
    if (lower === 'outboundproxysettings1') c.values.obp_enabled = true;
    for (const e of sec.entries) {
      if (lower === 'general' && e.key.toLowerCase() === 'forwardrules') {
        parseForwardRules(e.value, c.values);
        continue;
      }
      if (lower === 'general' && e.key.toLowerCase() === 'snmpenabled') {
        if (/^true$/i.test(e.value)) c.values.snmp_enabled = true;
        continue;
      }
      if (lower === 'general' && e.key.toLowerCase() === 'uagname') {
        const f = iniIndex.get('general|uagname')![0].field;
        setField(c, c.values, f, e.value, result, `[${sec.section}]`);
        continue;
      }
      if (lower === 'horizon' && e.key.toLowerCase() === 'originheaderdetailslist') continue;
      const sshKey = /^sshPublicKey(\d+)$/i.exec(e.key);
      if (lower === 'general' && sshKey) {
        importedSshPublicKeys.push({ index: Number(sshKey[1]), value: e.value });
        result.mapped++;
        continue;
      }
      const candidates = iniIndex.get(`${sec.section}|${e.key}`.toLowerCase());
      const hit = candidates?.find((candidate) =>
        (!candidate.group?.platforms || candidate.group.platforms.includes(c.platform)) &&
        (!candidate.field.platforms || candidate.field.platforms.includes(c.platform))
      ) ?? candidates?.find((candidate) => !candidate.group?.platforms && !candidate.field.platforms) ?? candidates?.[0];
      if (!hit) result.unmapped.push({ where: `[${sec.section}]`, key: e.key, value: e.value });
      else setField(c, c.values, hit.field, e.value, result, `[${sec.section}]`);
    }
  }

  c.wrp = [...listItems.wrp.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  c.syslog = [...listItems.syslog.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  if (originDetails.length) {
    c.values.origin = formatOriginHeaderDetails(originDetails.sort((a, b) => a.index - b.index));
  }
  if (importedSshPublicKeys.length) {
    c.values.sshPublicKeys = importedSshPublicKeys
      .sort((a, b) => a.index - b.index)
      .map((key) => key.value)
      .join('\n');
    result.warnings.push('SSH public-key file paths were imported. Pasted key material is not available in a deployment INI; replace paths with key contents when exporting settings JSON.');
  }
  detectCascade(c);
  compactConfigTrustedCerts(c);
  if (!c.values.name && c.values.uagName) c.values.name = c.values.uagName;
  return result;
}

type JsonIndex = Map<string, { group?: GroupDef; field: Field }>;

function buildJsonIndex(targets: string[]): JsonIndex {
  const idx: JsonIndex = new Map();
  for (const g of GROUPS) {
    if (!targets.includes(g.target)) continue;
    for (const f of g.fields) {
      if (f.json === false) continue;
      idx.set((f.json ?? f.key).toLowerCase(), { group: g, field: f });
    }
  }
  return idx;
}

function applyJsonObject(
  c: Config,
  obj: Record<string, unknown>,
  idx: JsonIndex,
  values: Values,
  where: string,
  result: ImportResult,
  skip: string[] = []
): void {
  for (const [k, v] of Object.entries(obj)) {
    if (skip.includes(k)) continue;
    const hit = idx.get(k.toLowerCase());
    if (!hit || v === null || typeof v === 'object' && !Array.isArray(v)) {
      result.unmapped.push({ where, key: k, value: typeof v === 'object' ? undefined : String(v) });
      continue;
    }
    setField(c, values, hit.field, v, result, where);
  }
}

function applyListJson(c: Config, l: ListDef, arr: unknown[], result: ImportResult, where: string): void {
  const idx: JsonIndex = new Map(l.fields.filter((f) => f.json !== false).map((f) => [String(f.json ?? f.key).toLowerCase(), { field: f }]));
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const item = { ...newListItem(l.id) };
    applyJsonObject(c, raw as Record<string, unknown>, idx, item, where, result, ['enabled', 'identifier', 'name']);
    c[l.id].push(item);
  }
}

export function importJson(text: string, base?: Config): ImportResult {
  const c = base ? (JSON.parse(JSON.stringify(base)) as Config) : defaultConfig();
  c.values.horizon_enabled = false;
  c.values.airwatch_enabled = false;
  c.values.cascade_role = 'none';
  c.wrp = [];
  c.syslog = [];
  const result: ImportResult = { config: c, format: 'json', warnings: [], unmapped: [], mapped: 0 };
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    result.warnings.push(`Invalid JSON: ${(e as Error).message}`);
    return result;
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    result.warnings.push('JSON root must be an object.');
    return result;
  }
  const root = doc as Record<string, unknown>;
  const asObj = (x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : undefined);
  const inner = (x: unknown, key: string): unknown[] => {
    const o = asObj(x);
    const v = o?.[key] ?? x;
    return Array.isArray(v) ? v : [];
  };

  for (const [top, val] of Object.entries(root)) {
    switch (top) {
      case 'systemSettings': {
        const o = asObj(val) ?? {};
        if (o.snmpEnabled === true) c.values.snmp_enabled = true;
        const publicKeys = o.sshPublicKeys;
        if (Array.isArray(publicKeys)) {
          const imported = publicKeys
            .filter((key): key is Record<string, unknown> => !!key && typeof key === 'object' && !Array.isArray(key))
            .filter((key) => typeof key.data === 'string' && key.data.trim().length > 0);
          if (imported.length !== publicKeys.length) {
            result.unmapped.push({ where: 'systemSettings.sshPublicKeys', key: 'invalid entry' });
          }
          c.values.sshPublicKeys = imported.map((key) => String(key.data).trim()).join('\n');
          c.values.sshPublicKeyNames = imported
            .map((key) => typeof key.name === 'string' ? key.name.trim() : '')
            .join('\n');
          result.mapped += imported.length;
        } else if (publicKeys !== undefined) {
          result.unmapped.push({ where: 'systemSettings', key: 'sshPublicKeys' });
        }
        applyJsonObject(c, o, buildJsonIndex(['system']), c.values, 'systemSettings', result, ['snmpEnabled', 'sshPublicKeys']);
        break;
      }
      case 'edgeServiceSettingsList': {
        for (const raw of inner(val, 'edgeServiceSettingsList')) {
          const e = asObj(raw);
          if (!e) continue;
          if (e.identifier === 'VIEW') {
            c.values.horizon_enabled = e.enabled !== false;
            if (Array.isArray(e.originHeaderDetailsList)) {
              c.values.origin = formatOriginHeaderDetails(parseOriginHeaderDetails(e.originHeaderDetailsList));
              result.mapped += e.originHeaderDetailsList.length;
            }
            applyJsonObject(c, e, buildJsonIndex(['horizon']), c.values, 'edgeService VIEW', result, ['identifier', 'enabled', 'originHeaderDetailsList']);
          } else if (e.identifier === 'WEB_REVERSE_PROXY') {
            applyListJson(c, LISTS.find((l) => l.id === 'wrp')!, [e], result, 'edgeService WEB_REVERSE_PROXY');
          } else {
            result.unmapped.push({ where: 'edgeServiceSettingsList', key: `identifier=${String(e.identifier)}` });
          }
        }
        break;
      }
      case 'authMethodSettingsList': {
        for (const raw of inner(val, 'authMethodSettingsList')) {
          const a = asObj(raw);
          if (!a) continue;
          if (a.name === 'radius-auth') {
            c.values.radius_enabled = a.enabled !== false;
            applyJsonObject(c, a, buildJsonIndex(['radius']), c.values, 'authMethod radius-auth', result, ['name', 'enabled']);
          } else result.unmapped.push({ where: 'authMethodSettingsList', key: `name=${String(a.name)}` });
        }
        break;
      }
      case 'idpExternalMetadataSettingsList': {
        const first = asObj(inner(val, 'idpExternalMetadataSettingsList')[0]);
        if (first) {
          c.values.saml_enabled = true;
          applyJsonObject(c, first, buildJsonIndex(['saml']), c.values, 'idpExternalMetadata', result);
        }
        break;
      }
      case 'snmpSettings': {
        c.values.snmp_enabled = true;
        applyJsonObject(c, asObj(val) ?? {}, buildJsonIndex(['snmp']), c.values, 'snmpSettings', result, ['enabled']);
        break;
      }
      case 'syslogSettings': {
        applyListJson(c, LISTS.find((l) => l.id === 'syslog')!, inner(val, 'syslogServerSettingsList'), result, 'syslogSettings');
        break;
      }
      default:
        result.unmapped.push({ where: 'root', key: top });
    }
  }
  detectCascade(c);
  compactConfigTrustedCerts(c);
  if (!c.values.name && c.values.uagName) c.values.name = c.values.uagName;
  return result;
}

export function importText(text: string, base?: Config): ImportResult {
  const t = text.trim();
  return t.startsWith('{') || t.startsWith('[') && !/^\[[A-Za-z]/.test(t) ? importJson(t, base) : importIni(t, base);
}
