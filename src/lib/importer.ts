import { GROUPS, LISTS, RUNTIME_FIELDS, fieldDefaults, type Field, type GroupDef, type ListDef, type Primitive, type Values } from './schema';
import { defaultConfig, newListItem, unsafeSegJwtValue, type Config } from './model';
import { SECRET_PLACEHOLDER, formatOriginHeaderDetails, parseOriginHeaderDetails } from './generate';
import { inVersion, isSupportedVersion } from './versions';
import { CASCADE_INSTANCE_ID, parseForwardRules } from './cascade';
import { compactConfigTrustedCerts, writeTrustedCertPaths } from './trusted-certs';
import { serializeListValue } from './listValue';
import { normalizeHostEntries } from './host-entries';

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

const opaqueIniKeys = new Set(['target', ...[...GROUPS.flatMap(g => g.fields), ...LISTS.flatMap(l => l.fields)].filter(f => f.secret || f.type === 'secret' || f.type === 'textarea' && !f.rows || f.certificateInput).flatMap(f => [f.key, ...(f.aliases ?? [])]).map(key => key.toLowerCase())]);

export function parseIni(text: string, preserveUnknown = false): IniDoc {
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
    const key = line.slice(0, eq).trim();
    const rawValue = rawLine.slice(rawLine.indexOf('=') + 1);
    const recognized = [...GROUPS.flatMap(g => g.fields), ...LISTS.flatMap(l => l.fields), ...RUNTIME_FIELDS].some(f => [f.key, ...(f.aliases ?? [])].some(k => k.toLowerCase() === key.toLowerCase()));
    cur.entries.push({ key, value: preserveUnknown && !recognized || opaqueIniKeys.has(key.toLowerCase()) ? rawValue : line.slice(eq + 1).trim() });
  }
  return doc;
}

function isRedacted(v: string): boolean {
  return v === SECRET_PLACEHOLDER || /^\*+$/.test(v) || v === '';
}

function coerce(f: Field, raw: unknown): Primitive {
  if (f.rows) return serializeListValue(Array.isArray(raw) ? raw : [raw], f.rows.separator);
  if (Array.isArray(raw)) raw = raw.join(',');
  if (f.type === 'bool' && (f.id === 'quiesceMode' || f.id.startsWith('seg_'))) {
    return typeof raw === 'boolean' ? raw : /^(true|false)$/i.test(String(raw)) ? /^true$/i.test(String(raw)) : String(raw);
  }
  if (f.type === 'bool') return typeof raw === 'boolean' ? raw : /^(true|1|yes)$/i.test(String(raw));
  if (f.type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n) || String(raw).trim() === '') return String(raw);
    return f.exportScale ? n / f.exportScale : n;
  }
  return String(raw ?? '');
}

function setField(c: Config, values: Values, f: Field, raw: unknown, result: ImportResult, where: string): void {
  if (f.secret && typeof raw === 'string' && isRedacted(raw)) return;
  if ((f.id.startsWith('seg_') || /JWT|jwtSettingsList|jwtIssuerSettingsList/.test(where)) && unsafeSegJwtValue(f.id, raw)) {
    result.unmapped.push({ where, key: f.key });
    result.warnings.push(`${where}: credential/material contents were not imported; supply deployment-host file references.`);
    return;
  }
  const coerced = coerce(f, raw);
  values[f.id] = f.escapeNewlines && typeof coerced === 'string'
    ? coerced.replace(/\\n/g, '\n')
    : coerced;
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
  c.oidc = [];
  c.jwt = [];
  c.jwtIssuers = [];
  c.values.seg_enabled = false;
  c.values.ha_enabled = false;
  c.values.horizon_enabled = false;
  c.values.airwatch_enabled = false;
  c.values.contentGateway_enabled = false;
  c.values.cascade_role = 'none';
  c.wrp = [];
  c.syslog = [];
  c.adminUsers = [];
  const result: ImportResult = { config: c, format: 'ini', warnings: [], unmapped: [], mapped: 0 };
  const doc = parseIni(text, true);
  let safetySection = '';
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    const section = /^\[([^\]]+)\]\s*$/.exec(line);
    if (section) { safetySection = section[1].trim(); return; }
    if (/^(?:AirwatchSecureEmailGateway|JWT(?:Issuer)?Settings\d+)$/i.test(safetySection)
      && line && !/^[#;]/.test(line) && line.indexOf('=') < 1) {
      result.unmapped.push({ where: `[${safetySection}]`, key: `malformed line ${index + 1}` });
      result.warnings.push(`[${safetySection}]: line ${index + 1} must use key=value; contents are not shown.`);
    }
  });
  if (doc.length === 0) {
    result.warnings.push('No INI sections found.');
    return result;
  }

  if (doc.some((s) => s.section.toLowerCase() === 'airwatchsecureemailgateway')) {
    Object.assign(c.values, fieldDefaults(GROUPS.find((g) => g.id === 'seg')!.fields));
  }
  const horizonSections = doc.filter((s) => s.section.toLowerCase() === 'horizon');
  if (horizonSections.length && !horizonSections.some((s) => s.entries.some((e) => e.key.toLowerCase() === 'authmethods'))) {
    c.values.authMethods = 'passthrough';
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
  else if (source && /\.vhdx$/i.test(source.split(/[?#]/, 1)[0])) c.platform = 'hyperv';

  if (doc.some((section) => section.section.toLowerCase() === 'highavailability')) {
    c.values.ha_enabled = true;
    c.values.ha_groupId = '';
    c.values.ha_virtualIPAddress = '';
    if (c.platform === 'azure') result.warnings.push('[HighAvailability]: native HA is not supported on Azure; values are retained but not emitted.');
  }

  const listItems: Record<string, Map<number, Values>> = Object.fromEntries(LISTS.map((l) => [l.id, new Map<number, Values>()]));
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
      if ((list.id === 'jwt' || list.id === 'jwtIssuers' || list.id === 'oidc') && (n < 1 || n > list.max)) {
        result.unmapped.push({ where: `[${sec.section}]`, key: 'profile index' });
        result.warnings.push(`[${sec.section}]: supported ${list.id === 'oidc' ? 'OIDC provider' : 'JWT profile'} indices are 1–99.`);
        continue;
      }
      if (list.id === 'oidc') c.values.oidc_enabled = true;
      const item = listItems[list.id].get(n) ?? { ...newListItem(list.id) };
      listItems[list.id].set(n, item);
      for (const e of sec.entries) {
        if ((list.id === 'jwt' || list.id === 'jwtIssuers') && unsafeSegJwtValue(e.key, e.value)) {
          result.unmapped.push({ where: `[${sec.section}]`, key: e.key });
          result.warnings.push(`[${sec.section}]: credential/material contents were not imported; supply deployment-host file references.`);
          continue;
        }
        const f = list.fields.find((x) => x.ini !== false && x.key.toLowerCase() === e.key.toLowerCase());
        if (!f) result.unmapped.push({ where: `[${sec.section}]`, key: e.key, value: list.id === 'jwt' || list.id === 'jwtIssuers' ? undefined : e.value });
        else setField(c, item, f, e.value, result, `[${sec.section}]`);
      }
      continue;
    }
    if (/^JWT(?:Issuer)?Settings/i.test(sec.section)) {
      result.unmapped.push({ where: `[${sec.section}]`, key: 'profile section' });
      result.warnings.push('JWT sections must use [JWTSettingsN] or [JWTIssuerSettingsN], with N from 1 to 99.');
      continue;
    }
    if (/^AdminUser$/i.test(sec.section)) {
      const adminList = LISTS.find((candidate) => candidate.id === 'adminUsers')!;
      const item = listItems.adminUsers.get(0) ?? { ...newListItem('adminUsers') };
      listItems.adminUsers.set(0, item);
      for (const e of sec.entries) {
        const f = adminList.fields.find((field) => field.key.toLowerCase() === e.key.toLowerCase());
        if (!f) result.unmapped.push({ where: `[${sec.section}]`, key: e.key, value: e.value });
        else setField(c, item, f, e.value, result, `[${sec.section}]`);
      }
      continue;
    }
    if (lower === 'horizon') c.values.horizon_enabled = true;
    if (lower === 'airwatch') {
      c.values.airwatch_enabled = true;
      if (!sec.entries.some((entry) => entry.key.toLowerCase() === 'tunnelgatewayenabled')) {
        c.values.airwatch_tunnelGatewayEnabled = false;
      }
    }
    if (lower === 'airwatchsecureemailgateway') c.values.seg_enabled = true;
    if (lower === 'airwatchcontentgateway') {
      c.values.contentGateway_enabled = true;
      c.values.contentGateway_mode = 'standalone';
    }
    if (lower === 'radiusauth') c.values.radius_enabled = true;
    if (lower === 'snmpsettings') c.values.snmp_enabled = true;
    if (lower === 'idpexternalmetadata1') c.values.saml_enabled = true;
    if (lower === 'oidcprovidersetting') c.values.oidc_enabled = true;
    if (lower === 'securidauth') c.values.securid_enabled = true;
    if (lower === 'certificateauth') c.values.certauth_enabled = true;
    if (lower === 'outboundproxysettings1') c.values.obp_enabled = true;
    for (const e of sec.entries) {
      if (/^(?:UAG_SEG_|awSEG)/i.test(e.key) || lower === 'airwatch' && sec.entries.some((entry) => entry.key.toLowerCase() === 'secureemailgatewayenabled') && unsafeSegJwtValue(e.key, e.value)) {
        result.unmapped.push({ where: `[${sec.section}]`, key: e.key });
        result.warnings.push(`[${sec.section}]: runtime SEG credentials/material were not imported.`);
        continue;
      }
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
      if (lower === 'airwatch' && ['secureemailgatewayenabled', 'memconfigurationid'].includes(e.key.toLowerCase())) {
        result.unmapped.push({ where: `[${sec.section}]`, key: e.key, value: e.value });
        result.warnings.push('Shared [Airwatch] SEG requires package review and is not converted to standalone SEG. Only [AirwatchSecureEmailGateway] is supported.');
        continue;
      }
      if (lower === 'airwatchsecureemailgateway' && unsafeSegJwtValue(e.key, e.value)) {
        result.unmapped.push({ where: `[${sec.section}]`, key: e.key });
        result.warnings.push(`[${sec.section}]: "${e.key}" is a runtime secret or material content and was not imported.`);
        continue;
      }
      if (lower === 'airwatch' && e.key.toLowerCase() === 'contentgatewayenabled') {
        c.values.contentGateway_enabled = /^true$/i.test(e.value);
        c.values.contentGateway_mode = 'shared';
        result.mapped++;
        continue;
      }
      if (lower === 'airwatch' && e.key.toLowerCase() === 'cgconfigid') {
        const f = GROUPS.find((group) => group.id === 'contentGateway')!.fields.find((field) => field.key === 'cgConfigId')!;
        setField(c, c.values, f, e.value, result, `[${sec.section}]`);
        continue;
      }
      if (
        (lower === 'airwatchcontentgateway' && ['apiserverpassword', 'outboundproxypassword'].includes(e.key.toLowerCase()))
        || (lower === 'airwatch' && e.key.toLowerCase() === 'apiserverpassword')
      ) {
        result.warnings.push(`[${sec.section}]: "${e.key}" is a runtime secret and was not imported.`);
        continue;
      }
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
      if (!hit) result.unmapped.push({ where: `[${sec.section}]`, key: e.key, value: lower === 'airwatchsecureemailgateway' ? undefined : e.value });
      else setField(c, c.values, hit.field, e.value, result, `[${sec.section}]`);
    }
  }

  c.wrp = [...listItems.wrp.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  c.syslog = [...listItems.syslog.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  c.adminUsers = [...listItems.adminUsers.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  c.oidc = [...listItems.oidc.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  if (c.oidc.length && !doc.some((section) => section.section.toLowerCase() === 'oidcprovidersetting')) {
    const first = c.oidc.shift()!;
    for (const field of LISTS.find((list) => list.id === 'oidc')!.fields) c.values[`oidc_${field.id}`] = first[field.id];
    result.warnings.push('Numbered-only OIDC providers were normalized to start with [OidcProviderSetting] for deployment-module compatibility. Configuration IDs and provider values are retained.');
  }
  for (const id of ['jwt', 'jwtIssuers'] as const) c[id] = [...listItems[id].entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  for (const item of c.jwtIssuers) {
    item.signingMode = item.pemCerts || !item.pfxCerts ? 'PEM' : 'PFX';
    if (item.pemCerts && item.pfxCerts) result.warnings.push('JWT producer contains PEM and PFX references. The pinned vendor module prefers PEM; both references are retained for review.');
  }
  for (const item of c.wrp) normalizeHostEntries(item, LISTS.find((list) => list.id === 'wrp')!.fields);
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
  c.iniExtras = result.unmapped.filter(e => e.value !== undefined && !/^pfxPassword$/i.test(e.key) && /^\[[^\]]+\]$/.test(e.where)).map(e => ({ section: e.where.slice(1, -1), key: e.key, value: e.value! }));
  detectCascade(c);
  compactConfigTrustedCerts(c);
  for (const group of GROUPS) normalizeHostEntries(c.values, group.fields);
  if (!c.values.name && c.values.uagName) c.values.name = c.values.uagName;
  return result;
}

type JsonIndex = Map<string, { group?: GroupDef; field: Field }>;

function buildJsonIndex(targets: string[]): JsonIndex {
  const idx: JsonIndex = new Map();
  for (const g of GROUPS) {
    if (!targets.includes(g.target)) continue;
    for (const f of g.fields) {
      if (f.json === false && f.hostEntryIndex === undefined) continue;
      if (f.hostEntryIndex !== undefined) {
        idx.set(f.key.toLowerCase(), { group: g, field: f });
        continue;
      }
      if (f.json !== false) idx.set((f.json ?? f.key).toLowerCase(), { group: g, field: f });
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
    if (!hit || v === null || typeof v === 'object' && (!Array.isArray(v) || where === 'edgeService SEG')) {
      result.unmapped.push({ where, key: k, value: where === 'edgeService SEG' || typeof v === 'object' ? undefined : String(v) });
      continue;
    }
    setField(c, values, hit.field, v, result, where);
  }
}

function applyListJson(c: Config, l: ListDef, arr: unknown[], result: ImportResult, where: string): void {
  const idx: JsonIndex = new Map(l.fields.filter((f) => f.json !== false && f.hostEntryIndex === undefined).map((f) => [String(f.json ?? f.key).toLowerCase(), { field: f }]));
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const item = { ...newListItem(l.id) };
    const obj = raw as Record<string, unknown>;
    if (l.id === 'wrp') item.enabled = obj.enabled !== false;
    const hostFields = l.fields.filter((field) => field.hostEntryIndex !== undefined);
    if (Array.isArray(obj.hostEntries)) {
      const hostEntries = obj.hostEntries;
      hostFields.forEach((field, index) => {
        item[field.id] = typeof hostEntries[index] === 'string' ? hostEntries[index] : '';
      });
      result.mapped += Math.min(hostEntries.length, hostFields.length);
      hostEntries.slice(hostFields.length).forEach((value, index) => {
        result.unmapped.push({ where: `${where}.hostEntries`, key: String(hostFields.length + index + 1), value: String(value) });
      });
    } else {
      for (const field of hostFields) {
        if (obj[field.key] === undefined) continue;
        setField(c, item, field, obj[field.key], result, where);
      }
    }
    applyJsonObject(c, obj, idx, item, where, result, ['enabled', 'identifier', 'name', 'hostEntries', ...hostFields.map((field) => field.key)]);
    normalizeHostEntries(item, l.fields);
    c[l.id].push(item);
  }
}

export function importJson(text: string, base?: Config): ImportResult {
  const c = base ? (JSON.parse(JSON.stringify(base)) as Config) : defaultConfig();
  c.oidc ??= [];
  c.jwt = [];
  c.jwtIssuers = [];
  c.values.seg_enabled = false;
  c.values.ha_enabled = false;
  c.values.horizon_enabled = false;
  c.values.airwatch_enabled = false;
  c.values.contentGateway_enabled = false;
  c.values.cascade_role = 'none';
  c.wrp = [];
  c.syslog = [];
  c.adminUsers = [];
  const result: ImportResult = { config: c, format: 'json', warnings: [], unmapped: [], mapped: 0 };
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    result.warnings.push('Invalid JSON: check the input syntax. Input excerpts are not shown because they may contain credentials.');
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
            if (Array.isArray(e.hostEntries)) {
              const hostEntries = e.hostEntries;
              const fields = GROUPS.filter((g) => g.target === 'horizon').flatMap((g) => g.fields).filter((f) => f.hostEntryIndex !== undefined);
              fields.forEach((f, i) => { c.values[f.id] = typeof hostEntries[i] === 'string' ? hostEntries[i] : ''; });
              result.mapped += Math.min(hostEntries.length, fields.length);
              hostEntries.slice(fields.length).forEach((value, i) => {
                result.unmapped.push({ where: 'edgeService VIEW.hostEntries', key: String(fields.length + i + 1), value: String(value) });
              });
            }
            if (Array.isArray(e.originHeaderDetailsList)) {
              c.values.origin = formatOriginHeaderDetails(parseOriginHeaderDetails(e.originHeaderDetailsList));
              result.mapped += e.originHeaderDetailsList.length;
            }
            applyJsonObject(c, e, buildJsonIndex(['horizon']), c.values, 'edgeService VIEW', result, ['identifier', 'enabled', 'originHeaderDetailsList', 'hostEntries']);
          } else if (e.identifier === 'WEB_REVERSE_PROXY') {
            applyListJson(c, LISTS.find((l) => l.id === 'wrp')!, [e], result, 'edgeService WEB_REVERSE_PROXY');
          } else if (e.identifier === 'SEG') {
            const fields = GROUPS.find((g) => g.id === 'seg')!.fields;
            Object.assign(c.values, fieldDefaults(fields));
            c.values.seg_enabled = e.enabled === undefined || e.enabled === true;
            if (e.enabled !== undefined && typeof e.enabled !== 'boolean') {
              result.unmapped.push({ where: 'edgeService SEG', key: 'enabled' });
              result.warnings.push('edgeService SEG: enabled must be a boolean; SEG remains disabled.');
            }
            result.warnings.push('edgeService SEG: settings JSON does not establish shared or standalone deployment provenance. Review UEM and the deployment package before using standalone INI; shared SEG has a recorded vendor-module bug.');
            if (Array.isArray(e.hostEntries)) {
              const hostFields = fields.filter((f) => f.hostEntryIndex !== undefined);
              const hosts = e.hostEntries;
              hosts.slice(0, hostFields.length).forEach((value, i) => {
                if (typeof value === 'string') setField(c, c.values, hostFields[i], value, result, 'edgeService SEG');
                else result.unmapped.push({ where: 'edgeService SEG.hostEntries', key: String(i + 1) });
              });
              e.hostEntries.slice(hostFields.length).forEach((_, i) => result.unmapped.push({ where: 'edgeService SEG.hostEntries', key: String(hostFields.length + i + 1) }));
            } else if (e.hostEntries !== undefined) {
              result.unmapped.push({ where: 'edgeService SEG', key: 'hostEntries' });
            }
            if (e.apiServerPassword !== undefined || e.outboundProxyPassword !== undefined || e.pfxCertsPassword !== undefined) {
              result.warnings.push('edgeService SEG: runtime API/proxy/certificate passwords were not imported.');
            }
            for (const key of ['pfxCerts', 'pfxCertAlias', 'trustedCertificates']) {
              if (e[key] !== undefined) {
                result.unmapped.push({ where: 'edgeService SEG', key });
                result.warnings.push(`edgeService SEG: ${key} requires certificate content/materialization; JSON content is not converted to a deployment-host file path.`);
              }
            }
            applyJsonObject(c, e, buildJsonIndex(['airwatchSecureEmailGateway']), c.values, 'edgeService SEG', result,
              ['identifier', 'enabled', 'airwatchComponentsInstalled', 'airwatchAgentStartUpMode', 'proxyDestinationUrl', 'hostEntries', 'apiServerPassword', 'outboundProxyPassword', 'pfxCertsPassword', 'pfxCerts', 'pfxCertAlias', 'trustedCertificates']);
          } else if (e.identifier === 'CONTENT_GATEWAY') {
            c.values.contentGateway_enabled = e.enabled !== false;
            c.values.contentGateway_mode = 'standalone';
            if (Array.isArray(e.hostEntries)) {
              const hostEntries = e.hostEntries;
              const fields = GROUPS.find((group) => group.id === 'contentGateway')!.fields.filter((field) => field.hostEntryIndex !== undefined);
              fields.forEach((field, index) => {
                c.values[field.id] = typeof hostEntries[index] === 'string' ? hostEntries[index] : '';
              });
              result.mapped += Math.min(hostEntries.length, fields.length);
              hostEntries.slice(fields.length).forEach((value, index) => {
                result.unmapped.push({ where: 'edgeService CONTENT_GATEWAY.hostEntries', key: String(fields.length + index + 1), value: String(value) });
              });
            }
            if (e.apiServerPassword !== undefined || e.outboundProxyPassword !== undefined) {
              result.warnings.push('edgeService CONTENT_GATEWAY: runtime service passwords were not imported.');
            }
            applyJsonObject(
              c,
              e,
              buildJsonIndex(['airwatchContentGateway']),
              c.values,
              'edgeService CONTENT_GATEWAY',
              result,
              ['identifier', 'enabled', 'airwatchComponentsInstalled', 'airwatchAgentStartUpMode', 'proxyDestinationUrl', 'hostEntries', 'apiServerPassword', 'outboundProxyPassword', 'trustedCertificates']
            );
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
      case 'jwtSettingsList':
      case 'jwtIssuerSettingsList': {
        const id = top === 'jwtSettingsList' ? 'jwt' : 'jwtIssuers';
        const wrapped = asObj(val);
        if (!wrapped || !Array.isArray(wrapped[top])) {
          result.unmapped.push({ where: 'root', key: top });
          result.warnings.push(`${top} must contain its named profile array.`);
          break;
        }
        for (const raw of wrapped[top]) {
          const obj = asObj(raw);
          if (!obj) { result.warnings.push(`${top}: profile must be an object.`); continue; }
          const item = newListItem(id);
          for (const key of ['name', 'issuer']) {
            if (typeof obj[key] === 'string') setField(c, item, LISTS.find((l) => l.id === id)!.fields.find((f) => f.id === key)!, obj[key], result, top);
            else if (obj[key] !== undefined) result.unmapped.push({ where: top, key });
          }
          const urlKey = id === 'jwt' ? 'publicKeyURLSettings' : 'encryptionPublicKeyURLSettings';
          const server = asObj(obj[urlKey]);
          if (server) {
            for (const [key, field] of [['url', 'url'], ['urlThumbprints', 'urlThumbprints'], ['urlResponseRefreshInterval', 'publicKeyRefreshInterval']]) {
              if (server[key] === undefined) continue;
              if (server[key] === null || typeof server[key] === 'object' || typeof server[key] === 'boolean') result.unmapped.push({ where: `${top}.${urlKey}`, key });
              else setField(c, item, LISTS.find((l) => l.id === id)!.fields.find((f) => f.id === field)!, server[key], result, `${top}.${urlKey}`);
            }
            for (const key of Object.keys(server).filter((key) => !['url', 'urlThumbprints', 'urlResponseRefreshInterval'].includes(key))) result.unmapped.push({ where: `${top}.${urlKey}`, key });
          } else if (obj[urlKey] !== undefined) result.unmapped.push({ where: top, key: urlKey });
          for (const key of Object.keys(obj).filter((key) => !['name', 'issuer', urlKey].includes(key))) {
            result.unmapped.push({ where: top, key });
            result.warnings.push(`${top}: ${key} is not converted to a file reference; key/certificate contents and credentials were not imported.`);
          }
          c[id].push(item);
        }
        break;
      }
      case 'loadBalancerSettings': {
        const o = asObj(val);
        c.values.ha_groupId = '';
        c.values.ha_virtualIPAddress = '';
        if (!o) {
          result.unmapped.push({ where: 'root', key: top });
          result.warnings.push('loadBalancerSettings must be an object; native HA remains disabled.');
          break;
        }
        c.values.ha_enabled = o.loadBalancerMode === 'ONEARM';
        if (o.loadBalancerMode === 'ONEARM' || o.loadBalancerMode === 'DISABLED') result.mapped++;
        else {
          result.unmapped.push({ where: top, key: 'loadBalancerMode', value: o.loadBalancerMode === undefined ? undefined : String(o.loadBalancerMode) });
          result.warnings.push('loadBalancerSettings: only ONEARM and DISABLED modes are supported; native HA remains disabled.');
        }
        applyJsonObject(c, o, buildJsonIndex(['ha']), c.values, top, result, ['loadBalancerMode']);
        if (c.values.ha_enabled === true && c.platform === 'azure') result.warnings.push('loadBalancerSettings: native HA is not supported on Azure; values are retained but not emitted.');
        break;
      }
      case 'snmpSettings': {
        c.values.snmp_enabled = true;
        applyJsonObject(c, asObj(val) ?? {}, buildJsonIndex(['snmp']), c.values, 'snmpSettings', result, ['enabled']);
        break;
      }
      case 'adminSAMLSettings': {
        applyJsonObject(c, asObj(val) ?? {}, buildJsonIndex(['adminSaml']), c.values, 'adminSAMLSettings', result);
        break;
      }
      case 'syslogSettings': {
        applyListJson(c, LISTS.find((l) => l.id === 'syslog')!, inner(val, 'syslogServerSettingsList'), result, 'syslogSettings');
        break;
      }
      case 'adminUsersList': {
        const users = inner(val, 'adminUsersList');
        const adminList = LISTS.find((list) => list.id === 'adminUsers')!;
        for (const raw of users) {
          const obj = asObj(raw);
          if (!obj) continue;
          const item = { ...newListItem('adminUsers') };
          for (const field of adminList.fields) {
            if (obj[field.key] !== undefined) setField(c, item, field, obj[field.key], result, 'adminUsersList');
          }
          if (obj.password !== undefined) {
            result.warnings.push('adminUsersList: runtime admin-user passwords were not imported.');
          }
          for (const key of Object.keys(obj)) {
            if (!adminList.fields.some((field) => field.key === key) && key !== 'roles' && key !== 'password') {
              result.unmapped.push({ where: 'adminUsersList', key });
            }
          }
          c.adminUsers.push(item);
        }
        break;
      }
      default:
        result.unmapped.push({ where: 'root', key: top });
    }
  }
  detectCascade(c);
  compactConfigTrustedCerts(c);
  for (const group of GROUPS) normalizeHostEntries(c.values, group.fields);
  if (!c.values.name && c.values.uagName) c.values.name = c.values.uagName;
  return result;
}

export function importText(text: string, base?: Config): ImportResult {
  const t = text.trim();
  return t.startsWith('{') || t.startsWith('[') && !/^\[[A-Za-z]/.test(t) ? importJson(t, base) : importIni(t, base);
}
