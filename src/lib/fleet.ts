import { cloneConfig, defaultConfig, fieldAvailable, groupAvailable, groupEnabled, type Config } from './model';
import { GROUPS, deploymentNicCount } from './schema';
import { validateConfig, checkRule, type Issue } from './validate';
import { normalizeConfig, trailingWhitespace } from './ordinary-whitespace';

export interface Member { id: number; groupId: string; config: Config; individualDestination: boolean; removed: boolean }
export interface BackendGroup { id: string; label: string; server: string; templateId: number | null; templateConfig: Config; subnetAnchors: string[]; removed: boolean }
export interface Fleet { unlocked: boolean; nextMember: number; nextGroup: number; groups: BackendGroup[]; members: Member[]; undo: { kind: 'member' | 'group'; id: number | string }[] }
export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const individualField = (key: string): boolean => /^(?:name|uagName|ip[012]|v6ip[012]|az_publicIpAddrResourceGroupName|az_publicIPAddressName0|mac(?:Address)?[012]?|(?:nic|eth)[012]MacAddress|vmId|vmUuid|deploymentId)$/i.test(key);
const individualOverride = (value: string) => /\^(?:Address|MACAddress|PermanentMACAddress|ClientIdentifier|DUIDType|DUIDRawData)=/i.test(value);
const entries = (value: unknown) => String(value || '').split(';').filter(Boolean);
export function sharedConfig(config: Config): Config {
  const result = cloneConfig(config);
  for (const key of Object.keys(result.values)) {
    if (individualField(key)) delete result.values[key];
    else if (/^eth[012]CustomConfig$/.test(key)) result.values[key] = entries(result.values[key]).filter(e => !individualOverride(e)).join(';');
  }
  return result;
}
export function applyTemplate(template: Config, incoming: Config, individualDestination = false): Config {
  const result = cloneConfig(template);
  for (const key of Object.keys(incoming.values)) {
    if (individualField(key)) result.values[key] = incoming.values[key];
    else if (/^eth[012]CustomConfig$/.test(key)) {
      const unique = entries(incoming.values[key]).filter(individualOverride);
      if (unique.length) result.values[key] = [...entries(result.values[key]).filter(e => !individualOverride(e)), ...unique].join(';');
    }
  }
  if (incoming.iniExtras) result.iniExtras = copy(incoming.iniExtras);
  if (individualDestination) result.values.proxyDestinationUrl = incoming.values.proxyDestinationUrl;
  return result;
}
export function freshFleet(): Fleet {
  const config = defaultConfig(); config.values.horizon_enabled = true;
  return { unlocked: false, nextMember: 2, nextGroup: 2, groups: [{ id: 'g1', label: 'UAG group A', server: '', templateId: 1, templateConfig: sharedConfig(config), subnetAnchors: ['', '', ''], removed: false }], members: [{ id: 1, groupId: 'g1', config, individualDestination: false, removed: false }], undo: [] };
}
export function activeMembers(fleet: Fleet, groupId?: string): Member[] {
  return fleet.members.filter(m => !m.removed && (!groupId || m.groupId === groupId) && fleet.groups.some(g => g.id === m.groupId && !g.removed));
}
export function unlockFleet(fleet: Fleet): void {
  const member = fleet.members[0], config = normalizeConfig(member.config);
  if (config.values.horizon_enabled !== true || validateConfig(config).some(i => i.level === 'error')) throw Error('Complete a valid Horizon baseline before planning the topology.');
  member.config = config;
  const group = fleet.groups[0]; group.templateConfig = sharedConfig(config); group.server = String(config.values.proxyDestinationUrl || ''); group.subnetAnchors = [0, 1, 2].map(n => String(config.values[`ip${n}`] || '')); fleet.unlocked = true;
}
export function propagate(fleet: Fleet, group: BackendGroup): void {
  for (const member of fleet.members.filter(m => m.groupId === group.id)) member.config = applyTemplate(group.templateConfig, member.config, member.individualDestination);
}
export function editMember(fleet: Fleet, id: number, config: Config): void {
  const member = fleet.members.find(m => m.id === id)!; const group = fleet.groups.find(g => g.id === member.groupId)!;
  member.config = cloneConfig(config);
  if (!fleet.unlocked) return;
  if (id === group.templateId) {
    group.templateConfig = sharedConfig(config);
    group.server = String(config.values.proxyDestinationUrl || '');
    propagate(fleet, group);
  } else member.individualDestination = String(config.values.proxyDestinationUrl || '') !== group.server;
}
export function setDestination(fleet: Fleet, group: BackendGroup, value: string): void {
  group.server = value; group.templateConfig.values.proxyDestinationUrl = group.server; propagate(fleet, group);
}
export function addGroup(fleet: Fleet, label = ''): BackendGroup {
  const id = `g${fleet.nextGroup++}`, first = fleet.groups[0];
  const group: BackendGroup = { id, label: trailingWhitespace(label) || `UAG group ${id.slice(1)}`, server: first.server, templateId: null, templateConfig: cloneConfig(first.templateConfig), subnetAnchors: ['', '', ''], removed: false };
  for (const key of ['ip0', 'ip1', 'ip2', 'v6ip0', 'v6ipprefix0', 'netmask0', 'netmask1', 'netmask2', 'defaultGateway', 'v6DefaultGateway', 'dns', 'dnsSearch', 'routes0', 'routes1', 'routes2', 'eth0CustomConfig', 'eth1CustomConfig', 'eth2CustomConfig']) group.templateConfig.values[key] = '';
  // A new group is independent; native HA requires an explicit group-level decision.
  group.templateConfig.values.ha_enabled = false; group.templateConfig.values.ha_virtualIPAddress = ''; group.templateConfig.values.ha_groupId = '';
  fleet.groups.push(group); return group;
}
export function addMember(fleet: Fleet, group: BackendGroup): Member {
  if (!fleet.unlocked || group.removed || checkRule('httpsUrl', group.server)) throw Error('Set a valid group Connection Server URL before adding a UAG.');
  const id = fleet.nextMember++, source = fleet.members.find(m => m.id === group.templateId)?.config || defaultConfig();
  const config = applyTemplate(group.templateConfig, source);
  for (const key of Object.keys(config.values)) if (individualField(key)) config.values[key] = '';
  for (const key of ['name', 'uagName']) {
    const base = String(source.values[key] || 'uag'); let label = `${base}-${String(id).padStart(2, '0')}`, suffix = 1;
    while (fleet.members.some(m => String(m.config.values[key]).toLowerCase() === label.toLowerCase())) label = `${base}-${id}-${suffix++}`;
    config.values[key] = label;
  }
  const member = { id, groupId: group.id, config, individualDestination: false, removed: false }; fleet.members.push(member);
  if (group.templateId === null) group.templateId = id;
  return member;
}
export function removeMember(fleet: Fleet, id: number): void {
  const member = fleet.members.find(m => m.id === id); if (!member || member.removed) return;
  member.removed = true; fleet.undo.push({ kind: 'member', id });
}
export function removeGroup(fleet: Fleet, id: string): void {
  const group = fleet.groups.find(g => g.id === id); if (!group || group.removed) return;
  group.removed = true; fleet.undo.push({ kind: 'group', id });
}
export function undoRemoval(fleet: Fleet): void {
  const entry = fleet.undo.pop(); if (!entry) return;
  if (entry.kind === 'member') { const member = fleet.members.find(m => m.id === entry.id); if (member) member.removed = false; }
  else { const group = fleet.groups.find(g => g.id === entry.id); if (group) group.removed = false; }
}
export function templateChanges(group: BackendGroup, member: Member): string[] {
  const a = sharedConfig(member.config), b = group.templateConfig;
  return [...new Set([...Object.keys(a.values), ...Object.keys(b.values)])].filter(k => JSON.stringify(a.values[k]) !== JSON.stringify(b.values[k])).concat(a.version !== b.version ? ['version'] : [], a.platform !== b.platform ? ['platform'] : [], (['wrp','syslog','adminUsers','jwt','jwtIssuers','oidc'] as const).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])));
}
export function moveMember(fleet: Fleet, member: Member, target: BackendGroup): void {
  if (target.removed) throw Error('The destination group has been removed.');
  member.groupId = target.id; member.individualDestination = false; member.config = applyTemplate(target.templateConfig, member.config); if (target.templateId === null) target.templateId = member.id;
}
export function nicApplicable(config: Config, nic: number): boolean {
  return GROUPS.some(group => groupEnabled(group, config) && group.fields.some(f => f.id === `ip${nic}` && fieldAvailable(f, config.version, config.platform, config.values)));
}
export function nicRows(config: Config): { nic: number; role: string; value: string; ipv4: boolean; ipv6?: string }[] {
  const count = deploymentNicCount(config.values), v6Field = GROUPS.flatMap(g => g.fields).find(f => f.id === 'v6ip0')!;
  return Array.from({ length: count }, (_, nic) => {
    const ipv4 = nicApplicable(config, nic), ipv6 = nic === 0 && fieldAvailable(v6Field, config.version, config.platform, config.values) ? String(config.values.v6ip0 || '') : undefined;
    const address = ipv4 ? String(config.values[`ip${nic}`] || 'Address required') : String(config.values[`ipMode${nic}`] || config.values[`ipmode${nic}`] || 'DHCP / IPv6');
    return { nic, role: nic === 0 ? 'Internet' : nic === 1 && count === 2 ? 'Management / Backend' : nic === 1 ? 'Management' : 'Backend', ipv4, ipv6, value: address + (ipv6 ? ` · IPv6 ${ipv6}${config.values.v6ipprefix0 !== '' && config.values.v6ipprefix0 != null ? '/' + config.values.v6ipprefix0 : ''}` : '') };
  });
}
const ipv4 = (value: string) => !!value && !checkRule('ipv4', value);
const ipNumber = (value: string) => value.split('.').reduce((n, part) => n * 256 + Number(part), 0) >>> 0;
export function fleetIssues(fleet: Fleet): (Issue & { memberId?: number })[] {
  const members = activeMembers(fleet), result: (Issue & { memberId?: number })[] = [];
  const memberLabel = (member: Member) => { const name = String(member.config.values.name || ''); return name.trim() ? `UAG “${name}” (#${member.id})` : `UAG ${member.id}`; };
  const activeHA = fleet.groups.filter(group => !group.removed && activeMembers(fleet, group.id).length && group.templateConfig.values.ha_enabled === true && groupAvailable(GROUPS.find(g => g.id === 'ha')!, group.templateConfig.version, group.templateConfig.platform));
  const haId = (group: BackendGroup) => { const value = Number(group.templateConfig.values.ha_groupId); return Number.isInteger(value) && value >= 1 && value <= 255 ? value : undefined; };
  const push = (memberId: number | undefined, fieldId: string, message: string, section: Issue['section'] = 'network') => result.push({ id: `fleet-${memberId}-${fieldId}-${result.length}`, level: 'error', section, fieldId, message, memberId });
  for (const member of members) {
    const config = normalizeConfig(member.config), group = fleet.groups.find(g => g.id === member.groupId)!;
    result.push(...validateConfig(config).map(issue => ({ ...issue, id: `member-${member.id}-${issue.id}`, memberId: member.id })));
    if (config.values.horizon_enabled !== true) push(member.id, 'horizon_enabled', 'Horizon fleet members must publish the Horizon service.', 'services');
    for (let nic = 0; nic < 3; nic++) {
      if (!nicApplicable(config, nic)) continue;
      const ip = String(config.values[`ip${nic}`] || ''), anchor = group.subnetAnchors[nic] || String(fleet.members.find(m => m.id === group.templateId)?.config.values[`ip${nic}`] || ''), mask = String(group.templateConfig.values[`netmask${nic}`] || '');
      if (ipv4(ip) && ipv4(anchor) && mask && !checkRule('netmask', mask) && ((ipNumber(ip) & ipNumber(mask)) >>> 0) !== ((ipNumber(anchor) & ipNumber(mask)) >>> 0)) push(member.id, `ip${nic}`, `NIC${nic} is outside its stable group template subnet.`);
      if (config.values[`eth${nic}CustomConfig`]) push(member.id, `eth${nic}CustomConfig`, 'Custom network overrides remain unresolved; review them before checked export.');
      for (const other of members.filter(m => m.id < member.id)) for (let onic = 0; onic < 3; onic++) if (nicApplicable(other.config, onic) && ipv4(ip) && ip === String(other.config.values[`ip${onic}`] || '')) { push(member.id, `ip${nic}`, `Address ${ip} collides with ${memberLabel(other)} NIC${onic}.`); push(other.id, `ip${onic}`, `Address ${ip} collides with ${memberLabel(member)} NIC${nic}.`); }
    }
    for (const key of ['name', 'uagName']) for (const other of members.filter(m => m.id < member.id)) if (String(config.values[key] || '').toLowerCase() === String(other.config.values[key] || '').toLowerCase()) { push(member.id, key, `${key} must be unique among active appliances; conflicts with ${memberLabel(other)}.`, 'general'); push(other.id, key, `${key} must be unique among active appliances; conflicts with ${memberLabel(member)}.`, 'general'); }
    const haSupported = groupAvailable(GROUPS.find(g => g.id === 'ha')!, config.version, config.platform);
    if (haSupported && (group.templateConfig.values.ha_enabled === true || config.values.ha_enabled === true) && ['ha_enabled', 'ha_groupId', 'ha_virtualIPAddress'].some(key => String(config.values[key] ?? '') !== String(group.templateConfig.values[key] ?? ''))) push(member.id, 'ha_enabled', 'Member native HA settings differ from the shared group template. Review or explicitly adopt consistent HA settings.', 'ha');
    if (haSupported && group.templateConfig.values.ha_enabled === true) {
      const vip = String(group.templateConfig.values.ha_virtualIPAddress || '');
      if (activeMembers(fleet, group.id).length < 2) push(member.id, 'ha_enabled', 'Native HA needs at least two active UAGs in this group.', 'ha');
      if (nicApplicable(config, 0) && ipv4(vip) && ipv4(String(config.values.ip0 || '')) && !checkRule('netmask', String(config.values.netmask0 || '')) && ((ipNumber(vip) & ipNumber(String(config.values.netmask0))) >>> 0) !== ((ipNumber(String(config.values.ip0)) & ipNumber(String(config.values.netmask0))) >>> 0)) push(member.id, 'ha_virtualIPAddress', 'Native HA VIP must be in the Internet NIC0 subnet.', 'ha');
      const vipCollisions = members.flatMap(other => [0,1,2].filter(nic => nicApplicable(other.config, nic) && String(other.config.values[`ip${nic}`] || '') === vip).map(nic => `${memberLabel(other)} NIC${nic}`));
      if (vipCollisions.length) push(member.id, 'ha_virtualIPAddress', `Native HA VIP collides with an active appliance address: ${vipCollisions.join(', ')}.`, 'ha');
      if (ipv4(vip) && activeHA.some(g => g.id !== group.id && ipv4(String(g.templateConfig.values.ha_virtualIPAddress || '')) && ipNumber(String(g.templateConfig.values.ha_virtualIPAddress)) === ipNumber(vip))) push(member.id, 'ha_virtualIPAddress', 'Active HA groups must use distinct VIPs.', 'ha');
      if (haId(group) !== undefined && activeHA.some(g => g.id !== group.id && haId(g) === haId(group))) push(member.id, 'ha_groupId', 'Active native HA groups in this topology must use distinct Group IDs.', 'ha');
    }
  }
  return result;
}
