import { activeMembers, type BackendGroup, type Fleet, type Member } from './fleet';
import { groupAvailable } from './model';
import { GROUPS } from './schema';
import type { TopologyLink } from './topology-links';

export const memberName = (member: Member) => String(member.config.values.name || member.config.values.uagName || `UAG ${member.id}`);
export const groupAccent = (id: string) => ['var(--templates)', 'var(--info)', 'var(--teal)', 'var(--warn)'][[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4];
export const supportsHA = (group: BackendGroup) => groupAvailable(GROUPS.find(g => g.id === 'ha')!, group.templateConfig.version, group.templateConfig.platform);
export const hasVIP = (group: BackendGroup) => supportsHA(group) && group.templateConfig.values.ha_enabled === true;
export const individualTarget = (member: Member, group: BackendGroup) => member.individualDestination || String(member.config.values.proxyDestinationUrl || '') !== group.server;

function destinationLabel(url: string): string {
  if (!url.trim()) return 'Connection Server required';
  try { return new URL(url).hostname || 'Destination needs review'; }
  catch { return 'Destination needs review'; }
}

export function overviewTopology(fleet: Fleet, options: { clientLoadBalancer?: boolean; loadBalancedDestinations?: readonly string[] } = {}) {
  const groups = fleet.groups.filter(group => !group.removed).map(group => ({ group, members: activeMembers(fleet, group.id), vip: hasVIP(group) }));
  const destinations: { key: string; label: string; identity: string; configured: boolean; loadBalanced: boolean }[] = [];
  const keys = new Map<string, string>();
  const links: TopologyLink[] = [];
  function destination(url: string, memberId?: number): string {
    // Unknown destinations must not imply a shared Connection Server.
    const identity = url.trim() ? `url:${url}` : `missing-member-${memberId}`;
    let key = keys.get(identity);
    if (!key) {
      key = `overview-server-${destinations.length + 1}`;
      keys.set(identity, key);
      destinations.push({ key, label: destinationLabel(url), identity, configured: !!url.trim(), loadBalanced: !!url.trim() && !!options.loadBalancedDestinations?.includes(identity) });
    }
    return key;
  }
  for (const { group, members, vip } of groups) {
    if (group.server.trim()) destination(group.server);
    const entry = `overview-vip-${group.id}`;
    if (vip && members.length) links.push({ from: 'overview-clients', to: entry, route: 'fan-out' });
    for (const member of members) {
      const key = `overview-uag-${member.id}`;
      links.push({ from: vip ? entry : 'overview-clients', to: key, route: 'fan-out' });
      links.push({ from: key, to: destination(String(member.config.values.proxyDestinationUrl || ''), member.id), route: 'fan-in' });
    }
  }
  if (options.clientLoadBalancer && links.some(link => link.from === 'overview-clients')) {
    for (const link of links) if (link.from === 'overview-clients') link.from = 'overview-client-lb';
    links.unshift({ from: 'overview-clients', to: 'overview-client-lb', route: 'fan-out' });
  }
  const used = new Set(links.map(link => link.to));
  for (const destination of destinations) {
    if (destination.loadBalanced && used.has(destination.key)) links.push({ from: destination.key, to: destination.key + '-pool', route: 'fan-out' });
  }
  return { groups, destinations, links };
}
