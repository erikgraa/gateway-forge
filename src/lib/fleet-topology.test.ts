import { describe, expect, it } from 'vitest';
import { addGroup, addMember, freshFleet } from './fleet';
import { groupAccent, overviewTopology } from './fleet-topology';

describe('Compact fleet overview relationships', () => {
  it('connects clients through one supported HA VIP to all group UAGs and one shared destination', () => {
    const fleet = freshFleet(), group = fleet.groups[0];
    group.templateConfig.values.ha_enabled = true;
    group.server = 'https://cs.example.com'; fleet.unlocked = true;
    addMember(fleet, group); addMember(fleet, group);
    for (const member of fleet.members) member.config.values.proxyDestinationUrl = group.server;
    const before = JSON.stringify(fleet), overview = overviewTopology(fleet);
    expect(overview.destinations).toMatchObject([{ key: 'overview-server-1', label: 'cs.example.com', configured: true, loadBalanced: false }]);
    expect(overview.links).toHaveLength(7);
    expect(overview.links.filter(link => link.from === 'overview-clients')).toEqual([{ from: 'overview-clients', to: 'overview-vip-g1', route: 'fan-out' }]);
    expect(overview.links.filter(link => link.to === 'overview-server-1')).toHaveLength(3);
    expect(JSON.stringify(fleet)).toBe(before);
  });
  it('shows all groups together and shares an identical configured destination across groups', () => {
    const fleet = freshFleet(); fleet.unlocked = true; fleet.groups[0].server = 'https://cs.example.com';
    const second = addGroup(fleet, 'Second backend'), member = addMember(fleet, second);
    for (const group of fleet.groups) group.server = 'https://cs.example.com';
    for (const node of fleet.members) node.config.values.proxyDestinationUrl = 'https://cs.example.com';
    let overview = overviewTopology(fleet);
    expect(overview.groups).toHaveLength(2);
    expect(overview.destinations).toHaveLength(1);
    expect(overview.links.filter(link => link.to === 'overview-server-1')).toHaveLength(2);
    member.individualDestination = true; member.config.values.proxyDestinationUrl = 'https://override.example.com';
    overview = overviewTopology(fleet);
    expect(overview.destinations.map(server => server.label)).toEqual(['cs.example.com', 'override.example.com']);
    expect(overview.links).toContainEqual({ from: `overview-uag-${member.id}`, to: 'overview-server-2', route: 'fan-in' });
  });
  it('keeps differently spelled imported destinations separate without rewriting them', () => {
    const fleet = freshFleet(); fleet.groups[0].server = 'https://CS.example.com/';
    fleet.members[0].config.values.proxyDestinationUrl = 'https://cs.example.com';
    const before = JSON.stringify(fleet);
    expect(overviewTopology(fleet).destinations).toHaveLength(2);
    expect(JSON.stringify(fleet)).toBe(before);
  });
  it('never merges unknown destinations into a supposed shared Connection Server', () => {
    const fleet = freshFleet(); fleet.unlocked = true; fleet.groups[0].server = 'https://cs.example.com'; addMember(fleet, fleet.groups[0]);
    fleet.groups[0].server = '';
    for (const member of fleet.members) member.config.values.proxyDestinationUrl = '';
    expect(overviewTopology(fleet).destinations.map(server => server.label)).toEqual(['Connection Server required', 'Connection Server required']);
  });
  it('hides removed groups and members, retains empty groups, and keeps group accents stable', () => {
    const fleet = freshFleet(), second = addGroup(fleet, 'Empty backend');
    const accent = groupAccent(second.id); fleet.members[0].removed = true;
    let overview = overviewTopology(fleet);
    expect(overview.groups[0].members).toHaveLength(0); expect(overview.links).toHaveLength(0);
    fleet.groups[0].removed = true;
    overview = overviewTopology(fleet);
    expect(overview.groups.map(row => row.group.id)).toEqual([second.id]);
    expect(groupAccent(second.id)).toBe(accent);
  });
  it('does not invent an HA VIP for disabled or unsupported groups, or an empty group', () => {
    const fleet = freshFleet(), group = fleet.groups[0];
    expect(overviewTopology(fleet).links.some(link => link.to.startsWith('overview-vip'))).toBe(false);
    group.templateConfig.values.ha_enabled = true; group.templateConfig.platform = 'azure';
    expect(overviewTopology(fleet).groups[0].vip).toBe(false);
    expect(group.templateConfig.values.ha_enabled).toBe(true);
    group.templateConfig.platform = fleet.members[0].config.platform; fleet.members[0].removed = true;
    expect(overviewTopology(fleet).links).toHaveLength(0);
  });
  it.each([[false,false],[true,false],[false,true],[true,true]])('adds only requested hypothetical client and endpoint LB links (%s, %s) without changing configuration', (clientLoadBalancer, backendPool) => {
    const fleet = freshFleet(); fleet.groups[0].server = 'https://cs.example.com'; fleet.members[0].config.values.proxyDestinationUrl = fleet.groups[0].server;
    const empty = addGroup(fleet); empty.server = 'https://unused.example.com';
    const before = JSON.stringify(fleet), overview = overviewTopology(fleet, { clientLoadBalancer, loadBalancedDestinations: backendPool ? ['url:https://cs.example.com', 'url:https://unused.example.com'] : [] });
    expect(overview.links.some(link => link.to === 'overview-client-lb')).toBe(clientLoadBalancer);
    expect(overview.links.some(link => link.to === 'overview-server-1-pool')).toBe(backendPool);
    expect(overview.links.filter(link => link.to === 'overview-server-1')).toHaveLength(1);
    expect(overview.links.some(link => link.to.startsWith('overview-server-2'))).toBe(false);
    expect(overview.links.some(link => link.to === 'overview-backend-lb')).toBe(false);
    expect(JSON.stringify(fleet)).toBe(before);
  });
  it.each([[false,false],[true,false],[false,true],[true,true]])('keeps two destinations and their hypothetical pools independent (%s, %s)', (firstPool, secondPool) => {
    const fleet = freshFleet(), group = fleet.groups[0];
    fleet.unlocked = true; group.server = fleet.members[0].config.values.proxyDestinationUrl = 'https://cs-a.example.com';
    const second = addMember(fleet, group);
    second.individualDestination = true; second.config.values.proxyDestinationUrl = 'https://cs-b.example.com';
    const identities = [firstPool ? 'url:https://cs-a.example.com' : '', secondPool ? 'url:https://cs-b.example.com' : ''].filter(Boolean);
    const before = JSON.stringify(fleet), overview = overviewTopology(fleet, { loadBalancedDestinations: identities });
    expect(overview.destinations.map(destination => destination.loadBalanced)).toEqual([firstPool, secondPool]);
    expect(overview.links).toContainEqual({ from: 'overview-uag-1', to: 'overview-server-1', route: 'fan-in' });
    expect(overview.links).toContainEqual({ from: `overview-uag-${second.id}`, to: 'overview-server-2', route: 'fan-in' });
    expect(overview.links.some(link => link.from === 'overview-server-1' && link.to === 'overview-server-1-pool')).toBe(firstPool);
    expect(overview.links.some(link => link.from === 'overview-server-2' && link.to === 'overview-server-2-pool')).toBe(secondPool);
    expect(overview.links.some(link => link.from === 'overview-server-1' && link.to.startsWith('overview-server-2'))).toBe(false);
    expect(JSON.stringify(fleet)).toBe(before);
  });
  it('identifies pool options by exact destination spelling rather than transient node order or hostname', () => {
    const fleet = freshFleet();
    fleet.groups[0].server = 'https://CS.example.com/'; fleet.members[0].config.values.proxyDestinationUrl = 'https://cs.example.com';
    const options = { loadBalancedDestinations: ['url:https://cs.example.com'] };
    expect(overviewTopology(fleet, options).destinations.map(destination => destination.loadBalanced)).toEqual([false, true]);
    fleet.groups[0].server = '';
    const overview = overviewTopology(fleet, options);
    expect(overview.destinations[0]).toMatchObject({ key: 'overview-server-1', loadBalanced: true });
    expect(overview.links).toContainEqual({ from: 'overview-server-1', to: 'overview-server-1-pool', route: 'fan-out' });
  });
  it('does not offer hypothetical pools for missing destinations or selections absent from the fleet', () => {
    const fleet = freshFleet(); fleet.groups[0].server = ''; fleet.members[0].config.values.proxyDestinationUrl = '';
    const overview = overviewTopology(fleet, { loadBalancedDestinations: ['missing-member-1', 'url:https://absent.example.com'] });
    expect(overview.destinations[0]).toMatchObject({ configured: false, loadBalanced: false });
    expect(overview.links.some(link => link.to.endsWith('-pool'))).toBe(false);
  });
  it('shows configured destinations for empty groups without inventing appliance connections', () => {
    const fleet = freshFleet(); fleet.members[0].removed = true; fleet.groups[0].server = 'https://empty.example.com';
    const overview = overviewTopology(fleet);
    expect(overview.destinations[0].label).toBe('empty.example.com'); expect(overview.links).toHaveLength(0);
  });
});
