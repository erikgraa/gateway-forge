import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FleetTopology from './FleetTopology.svelte';
import { addGroup, freshFleet } from '../lib/fleet';
import { cloneConfig } from '../lib/model';
function validFleet() {
  const fleet = freshFleet();
  Object.assign(fleet.members[0].config.values, { name: 'review-uag', uagName: 'review-host', source: 'C:\\images\\uag.ova', target: 'vi://operator@vc.example.com/Datacenter/host/Compute', ds: 'Datastore', deploymentOption: 'threenic', netInternet: 'DMZ', netManagementNetwork: 'Management', netBackendNetwork: 'Backend', ipmode0: 'STATICV4', ipmode1: 'STATICV4', ipmode2: 'STATICV4', ip0: '198.51.100.21', netmask0: '255.255.255.0', ip1: '192.0.2.21', netmask1: '255.255.255.0', ip2: '198.18.0.21', netmask2: '255.255.255.0', defaultGateway: '198.51.100.1', dns: '192.0.2.53', ntpServers: 'ntp.example.com', proxyDestinationUrl: 'https://cs.example.com' });
  fleet.groups[0].server = 'https://cs.example.com'; fleet.groups[0].templateConfig = cloneConfig(fleet.members[0].config); fleet.groups[0].subnetAnchors = ['198.51.100.21', '192.0.2.21', '198.18.0.21'];
  return fleet;
}
const output = () => render(FleetTopology, { props: { fleet: freshFleet(), selected: 1, onedit: () => {}, onsave: () => {} } }).body;
describe('Native Horizon topology component', () => {
  it('renders semantic keyboard-operable appliance selection and real editor/export actions', () => {
    const body = output();
    expect(body).toMatch(/<button[^>]*id="uag-node-1"[^>]*aria-pressed="true"/);
    expect(body).toContain('id="member-full-editor"');
    expect(body).toContain('id="fleet-export"');
    expect(body).not.toContain('<iframe');
    expect(body.indexOf('fleet-overview-heading')).toBeLessThan(body.indexOf('<details class="backend-group'));
    expect(body).not.toContain('class="client-entry"');
    expect([...body.matchAll(/Horizon clients/g)]).toHaveLength(1);
  });
  it('shows distinct decorative icons without replacing topology labels or selection controls', () => {
    const body = output();
    for (const kind of ['client', 'uag', 'server']) {
      expect(body).toMatch(new RegExp(`<span[^>]*class="[^"]*topology-icon-${kind}[^>]*aria-hidden="true"`));
    }
    expect(body).toContain('Horizon clients');
    expect(body).toContain('Connection Server');
    expect(body).toContain('Shared template owner');
    expect(body).toMatch(/<button[^>]*id="uag-node-1"[^>]*aria-pressed="true"/);
  });

  it('hides the bottom panel when ready and keeps friendly, nonnumeric appliance identity', () => {
    const body = render(FleetTopology, { props: { fleet: validFleet(), onedit: () => {}, onsave: () => {} } }).body;
    expect(body).not.toMatch(/<details[^>]*class="[^"]*fleet-validation/);
    expect(body).toContain('Configuration ready');
    expect(body).not.toContain('Selected UAG 1');
    expect(body).toContain('Download fleet configuration');
    expect(body).toContain('Full UAG configuration editor');
    expect(body).toMatch(/<details[^>]*class="[^"]*backend-group[^>]*open/);
    expect(body).toContain('backend-group-summary');
  });
  it('edits shared destinations only in the group but retains individual and differing destinations in the inspector', () => {
    const fleet = validFleet();
    const props = { fleet, onedit: () => {}, onsave: () => {} };
    let body = render(FleetTopology, { props }).body;
    expect(body).toContain('id="group-server-g1"');
    expect(body.slice(body.indexOf('<aside'))).not.toContain('id="member-destination"');
    expect(body).toContain('The shared Connection Server is configured in the UAG group');
    fleet.members[0].individualDestination = true;
    body = render(FleetTopology, { props }).body;
    expect(body.slice(body.indexOf('<aside'))).toContain('id="member-destination"');
    expect(body).toContain('Individual Connection Server override');
    fleet.members[0].individualDestination = false;
    fleet.members[0].config.values.proxyDestinationUrl = 'https://other.example.com';
    const before = JSON.stringify(fleet);
    body = render(FleetTopology, { props }).body;
    expect(body.slice(body.indexOf('<aside'))).toContain('id="member-destination"');
    expect(body).toContain('Different Connection Server destination');
    expect(body).toContain('https://other.example.com');
    expect(JSON.stringify(fleet)).toBe(before);
  });
  it('associates selected-member IP conflicts with the inspector inputs and retains the bottom blocking list', () => {
    const fleet = validFleet(); fleet.members.push({ ...fleet.members[0], id: 2, config: cloneConfig(fleet.members[0].config) });
    fleet.members[1].config.values.name = 'review-second'; fleet.members[1].config.values.uagName = 'review-second';
    const body = render(FleetTopology, { props: { fleet, selected: 2, onedit: () => {}, onsave: () => {} } }).body;
    const inspector = body.slice(body.indexOf('<aside'));
    expect(inspector).toContain('collides');
    expect(inspector).toContain('aria-describedby="member-ip-errors-0"');
    expect(inspector).toMatch(/id="member-ip-0"[^>]*aria-invalid="true"/);
    expect(body).toMatch(/<details[^>]*class="[^"]*fleet-validation/);
    expect(body).toContain('data-issue-member="2"');
  });
  it('shows IPv6 editing only after an active member has a configured address, without clearing retained values', () => {
    const fleet = validFleet(); fleet.members.push({ ...fleet.members[0], id: 2, config: cloneConfig(fleet.members[0].config) });
    const props = { fleet, selected: 2, onedit: () => {}, onsave: () => {} };
    expect(render(FleetTopology, { props }).body).not.toContain('id="member-ipv6-0"');
    fleet.members[0].config.values.v6ip0 = '2001:db8::21';
    expect(render(FleetTopology, { props }).body).toContain('id="member-ipv6-0"');
    fleet.members[1].config.platform = 'azure';
    expect(render(FleetTopology, { props }).body).not.toContain('id="member-ipv6-0"');
    expect(fleet.members[0].config.values.v6ip0).toBe('2001:db8::21');
    fleet.members[0].removed = true;
    expect(render(FleetTopology, { props: { ...props, selected: 1 } }).body).not.toContain('id="member-ipv6-0"');
  });
  it('disables HA for one appliance without removing retained settings', () => {
    expect(output()).toMatch(/id="ha-enabled-g1"[^>]*disabled/);
    expect(output()).toContain('Needs two active appliances');
  });
  it('has no duplicate IDs or nested buttons', () => {
    const body = output(), ids = [...body.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(body).not.toMatch(/<button\b[^>]*>(?:(?!<\/button>).)*<button\b/s);
  });
  it('shows one shared VIP and Connection Server for three group members', () => {
    const fleet = freshFleet(), group = fleet.groups[0];
    group.server = 'https://cs.example.com';
    group.templateConfig.values.ha_enabled = true;
    group.templateConfig.values.ha_virtualIPAddress = '198.51.100.10';
    fleet.members = [1, 2, 3].map(id => ({ ...fleet.members[0], id, config: cloneConfig(fleet.members[0].config) }));
    for (const node of fleet.members) node.config.values.proxyDestinationUrl = group.server;
    const body = render(FleetTopology, { props: { fleet, onedit: () => {}, onsave: () => {} } }).body;
    expect([...body.matchAll(/data-topology-key="vip-g1"/g)]).toHaveLength(1);
    expect([...body.matchAll(/data-topology-key="server-g1"/g)]).toHaveLength(1);
    expect([...body.matchAll(/data-topology-key="uag-\d"/g)]).toHaveLength(3);
    expect(body).not.toContain('Individual override');
    expect(body).toContain('<strong>UAG High Availability</strong>');
    expect(body).toContain('Shared XML API VIP');
    expect(body).toContain('For direct access, resolve the client-facing hostname to the reachable group VIP or its public/NAT address');
    expect(body).toContain('With a load balancer or health-aware DNS/GSLB, follow that entry-point design instead');
    expect(body).toContain('Studio does not configure or verify them');
    expect(body).not.toContain('Create a DNS A record');
  });
  it('retains separate individual or differing imported destinations instead of drawing false shared links', () => {
    const fleet = freshFleet(), group = fleet.groups[0];
    group.server = 'https://shared.example.com';
    fleet.members[0].config.values.proxyDestinationUrl = group.server;
    const second = { ...fleet.members[0], id: 2, config: cloneConfig(fleet.members[0].config), individualDestination: true };
    second.config.values.proxyDestinationUrl = 'https://override.example.com';
    fleet.members.push(second);
    let body = render(FleetTopology, { props: { fleet, onedit: () => {}, onsave: () => {} } }).body;
    expect(body).toContain('data-topology-key="server-g1"');
    expect(body).toContain('data-topology-key="destination-2"');
    expect(body).toContain('Individual override');
    second.individualDestination = false;
    body = render(FleetTopology, { props: { fleet, onedit: () => {}, onsave: () => {} } }).body;
    expect(body).toContain('Different destination — review group');
    expect(body).toContain('https://override.example.com');
  });
  it('labels blocking links and the selected appliance using the INI VM name', () => {
    const fleet = freshFleet(); fleet.members[0].config.values.name = 'ini-vm-name'; fleet.members[0].config.values.uagName = 'os-hostname';
    const body = render(FleetTopology, { props: { fleet, onedit: () => {}, onsave: () => {} } }).body;
    expect(body).toMatch(/data-issue-member="1"[^>]*><strong[^>]*>ini-vm-name<\/strong>/);
    expect(body).toContain('Hostname · os-hostname');
    expect(body).toContain('VM name (INI name)');
    expect(body).toMatch(/class="[^"]*topology-node[^"]*blocked/);
  });
  it('keeps distinct group accents stable when an earlier group is removed', () => {
    const fleet = freshFleet(); const second = addGroup(fleet);
    let body = render(FleetTopology, { props: { fleet, onedit: () => {}, onsave: () => {} } }).body;
    const style = (id: string) => body.match(new RegExp(`data-group="${id}"[^>]*style="([^"]*)"`))?.[1];
    const firstAccent = style('g1'), secondAccent = style(second.id);
    expect(firstAccent).toBeTruthy(); expect(secondAccent).toBeTruthy(); expect(firstAccent).not.toBe(secondAccent);
    fleet.groups[0].removed = true;
    body = render(FleetTopology, { props: { fleet, onedit: () => {}, onsave: () => {} } }).body;
    expect(style(second.id)).toBe(secondAccent);
  });
  it('labels UAG groups and selected controls without treating names as HTML', () => {
    const fleet = freshFleet();fleet.groups[0].label = '<script>operator label</script>';
    const body = render(FleetTopology, { props: { fleet, onedit: () => {}, onsave: () => {} } }).body;
    expect(body).toContain('&lt;script>operator label&lt;/script>');
    expect(body).toContain('aria-label="Selected UAG settings"');
    expect(body).toContain('for="group-server-g1"');
    expect(body).not.toContain('<script>operator label</script>');
  });
});
