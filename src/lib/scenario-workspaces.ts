import { defaultConfig, applyPatch, setServiceSelected, stripSecrets, type Config } from './model';
import { normalizeConfig, trailingWhitespace } from './ordinary-whitespace';
import { freshFleet, sharedConfig, copy, type Fleet } from './fleet';
import { isSupportedVersion, PLATFORMS } from './versions';

export type Scenario = 'single' | 'horizon' | 'web';
export interface Workspace { id: string; name: string; scenario: Scenario; config: Config; fleet: Fleet | null; retainedImports: unknown[] }
export interface Registry { revision: 1; current: string | null; drafts: Workspace[] }
export const REGISTRY_KEY = 'gateway-forge.workspaces.v1';
export const APPEARANCE_KEY = 'gateway-forge.appearance.v1';
export const LEGACY_DRAFT_KEY = 'gateway-forge.draft';
export const emptyRegistry = (): Registry => ({ revision: 1, current: null, drafts: [] });
export function scenarioDefaults(scenario: Scenario): Config {
  const config = defaultConfig();
  if (scenario === 'horizon') setServiceSelected(config, 'horizon', true);
  if (scenario === 'web') setServiceSelected(config, 'wrp', true);
  return config;
}
export function workspaceDisplayName(workspace: Workspace): string {
  const hostname = typeof workspace.config.values.uagName === 'string' ? workspace.config.values.uagName.trim() : '';
  return workspace.scenario !== 'horizon' && hostname ? `${workspace.name} · ${hostname}` : workspace.name;
}

export function createWorkspace(scenario: Scenario, id: string): Workspace {
  return { id, name: scenario === 'horizon' ? 'Horizon fleet' : scenario === 'web' ? 'Web proxy' : 'Single UAG', scenario, config: scenarioDefaults(scenario), fleet: scenario === 'horizon' ? freshFleet() : null, retainedImports: [] };
}
export function configShape(value: unknown): value is Config {
  if (!value || typeof value !== 'object') return false;
  const c = value as Config;
  return typeof c.version === 'string' && isSupportedVersion(c.version) && PLATFORMS.some(p => p.id === c.platform) && !!c.values && typeof c.values === 'object' && !Array.isArray(c.values) && ['wrp','syslog','adminUsers','jwt','jwtIssuers','oidc'].every(k => Array.isArray(c[k as keyof Config]));
}
export function fleetShape(value: unknown): value is Fleet {
  if (!value || typeof value !== 'object') return false;
  const f = value as Fleet;
  if (typeof f.unlocked !== 'boolean' || !Number.isSafeInteger(f.nextMember) || !Number.isSafeInteger(f.nextGroup) || !Array.isArray(f.groups) || !Array.isArray(f.members) || !Array.isArray(f.undo)) return false;
  if (!f.groups.every(g => g && typeof g === 'object' && /^g[1-9]\d*$/.test(g.id) && typeof g.label === 'string' && typeof g.server === 'string' && typeof g.removed === 'boolean' && (g.templateId === null || Number.isSafeInteger(g.templateId)) && configShape(g.templateConfig) && Array.isArray(g.subnetAnchors) && g.subnetAnchors.length === 3 && g.subnetAnchors.every(a => typeof a === 'string'))) return false;
  if (!f.members.every(m => m && typeof m === 'object')) return false;
  if (new Set(f.groups.map(g => g.id)).size !== f.groups.length || new Set(f.members.map(m => m.id)).size !== f.members.length) return false;
  return f.members.every(m => Number.isSafeInteger(m.id) && m.id > 0 && m.id < f.nextMember && configShape(m.config) && typeof m.removed === 'boolean' && typeof m.individualDestination === 'boolean' && f.groups.some(g => g.id === m.groupId)) && f.groups.every(g => g.templateId === null || f.members.some(m => m.id === g.templateId));
}
export function registryShape(value: unknown): value is Registry {
  if (!value || typeof value !== 'object') return false;
  const r = value as Registry;
  return r.revision === 1 && Array.isArray(r.drafts) && r.drafts.every(d => d && typeof d === 'object') && new Set(r.drafts.map(d => d.id)).size === r.drafts.length && r.drafts.every(d => typeof d.id === 'string' && typeof d.name === 'string' && ['single','horizon','web'].includes(d.scenario) && configShape(d.config) && Array.isArray(d.retainedImports) && (d.scenario === 'horizon' ? fleetShape(d.fleet) : d.fleet === null)) && (r.current === null || r.drafts.some(d => d.id === r.current));
}
export function safeImport(value: unknown): unknown {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  // Unsupported/raw imports stay in memory: their unknown password formats cannot be safely redacted.
  return { filename: typeof record.filename === 'string' ? record.filename : 'Unsupported import', metadataOnly: true };
}
export function upgradedRegistry(registry: Registry): Registry {
  const result = copy(registry);
  for (const workspace of result.drafts) {
    workspace.config = applyPatch(defaultConfig(), workspace.config);
    if (workspace.fleet) {
      for (const member of workspace.fleet.members) member.config = applyPatch(defaultConfig(), member.config);
      for (const group of workspace.fleet.groups) group.templateConfig = sharedConfig(applyPatch(defaultConfig(), group.templateConfig));
    }
  }
  return result;
}
export function savedRegistry(registry: Registry): Registry {
  const result = copy(registry);
  for (const workspace of result.drafts) {
    workspace.name = trailingWhitespace(workspace.name);
    workspace.config = stripSecrets(normalizeConfig(workspace.config));
    if (workspace.fleet) {
      for (const member of workspace.fleet.members) member.config = stripSecrets(normalizeConfig(member.config));
      for (const group of workspace.fleet.groups) { group.label = trailingWhitespace(group.label); group.server = trailingWhitespace(group.server); group.templateConfig = stripSecrets(normalizeConfig(group.templateConfig)); }
    }
    workspace.retainedImports = workspace.retainedImports.map(safeImport);
  }
  return result;
}
export function removeDrafts(registry: Registry, ids: readonly string[], storage?: Pick<Storage, 'setItem'>): Registry {
  if (registry.current !== null) throw Error('Return to the scenario chooser before deleting drafts.');
  const removed = new Set(ids);
  const next = { ...registry, drafts: registry.drafts.filter(draft => !removed.has(draft.id)) };
  storage?.setItem(REGISTRY_KEY, JSON.stringify(savedRegistry(next)));
  return next;
}
export function legacyConfiguration(raw: string): Config {
  const config = JSON.parse(raw) as Config;
  if (!config || typeof config !== 'object' || !isSupportedVersion(config.version) || !PLATFORMS.some(p => p.id === config.platform) || !config.values || typeof config.values !== 'object' || Array.isArray(config.values)) throw Error('The previous configuration could not be parsed safely. Its original storage entry remains unchanged.');
  const upgraded = applyPatch(defaultConfig(), config);
  if (!configShape(upgraded)) throw Error('The previous configuration has unsupported data. Its original storage entry remains unchanged.');
  return upgraded;
}
