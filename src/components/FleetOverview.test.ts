import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { addGroup, freshFleet } from '../lib/fleet';
import FleetOverview from './FleetOverview.svelte';

const output = (fleet = freshFleet()) => render(FleetOverview, { props: { fleet } }).body;
describe('Read-only compact fleet overview', () => {
  it('provides the Horizon Architecture reference even when no hypothetical LB is selected', () => {
    const body = output();
    expect(body).toContain('href="https://techzone.omnissa.com/resource/horizon-8-architecture"');
    expect(body).toContain('target="_blank" rel="noopener noreferrer"');
    expect(body).toContain('Horizon Architecture');
    expect(body).not.toContain('overview-cpa-help');
  });
  it('uses an initially expanded native disclosure without changing fleet configuration', () => {
    const fleet = freshFleet(), before = JSON.stringify(fleet), body = output(fleet);
    expect(body).toMatch(/<details[^>]*class="fleet-overview\b[^"]*"[^>]*\bopen(?:="")?>/);
    expect(body).toMatch(/<summary[^>]*><h3[^>]*id="fleet-overview-heading"[^>]*>Fleet overview<\/h3><\/summary>/);
    expect(JSON.stringify(fleet)).toBe(before);
  });
  it('shows client, UAG and server names without configuration details or controls', () => {
    const fleet = freshFleet(); fleet.members[0].config.values.name = 'ini-vm'; fleet.members[0].config.values.uagName = 'different-os-host';
    fleet.members[0].config.values.ip0 = '198.51.100.21';
    fleet.members[0].config.values.proxyDestinationUrl = fleet.groups[0].server = 'https://operator:synthetic-secret@cs.example.com:443/path';
    const body = output(fleet);
    expect(body).toContain('Fleet overview'); expect(body).toContain('Horizon clients'); expect(body).toContain('ini-vm'); expect(body).toContain('cs.example.com');
    for (const detail of ['198.51.100.21', 'different-os-host', 'synthetic-secret', ':443/path', 'NIC0', 'Configuration ready']) expect(body).not.toContain(detail);
    expect(body).not.toMatch(/<(?:button|select)\b|<input[^>]*type="(?:text|number)"/);
    expect([...body.matchAll(/type="checkbox"/g)]).toHaveLength(2);
    expect([...body.matchAll(/role="switch" aria-checked="false"/g)]).toHaveLength(2);
    expect(body).toContain('Illustrate load balancers (diagram only)');
    expect(body).not.toContain('data-topology-key="overview-client-lb"');
    expect(body).not.toContain('data-topology-key="overview-backend-lb"');
    expect(body).toContain('aria-label="Scrollable fleet overview" tabindex="0"');
    expect(body).toContain('aria-label="Configured Connection Server destinations"');
    expect(body).toContain('data-topology-connections');
  });
  it('offers separate initially off pool switches only for configured endpoints', () => {
    const fleet = freshFleet(), second = addGroup(fleet);
    fleet.groups[0].server = fleet.members[0].config.values.proxyDestinationUrl = 'https://cs-a.example.com';
    second.server = 'https://cs-b.example.com';
    const body = output(fleet);
    expect([...body.matchAll(/data-destination-lb=/g)]).toHaveLength(2);
    expect(body).toContain('LB / pool 1 · cs-a.example.com');
    expect(body).toContain('LB / pool 2 · cs-b.example.com');
    expect(body).toContain('aria-describedby="overview-lb-help"');
    expect(body).toContain('configure the real pool members, health checks and persistence in your load balancer, outside Studio');
    expect(body).toContain('An endpoint URL alone does not identify its servers or prove that an LB exists');
    expect(body).toContain('CS endpoint');
    expect(body).not.toContain('overview-backend-lb');
    expect(body).not.toContain('overview-pool');
    expect(body).not.toContain('overview-cpa-help');
    expect(body).not.toContain('Cloud Pod Architecture');
    fleet.groups[0].server = ''; fleet.members[0].config.values.proxyDestinationUrl = ''; second.server = '';
    expect(output(fleet)).not.toContain('data-destination-lb=');
  });
  it('shows one VIP label per active HA group but not its IP or Group ID', () => {
    const fleet = freshFleet(); fleet.groups[0].templateConfig.values.ha_enabled = true;
    fleet.groups[0].templateConfig.values.ha_virtualIPAddress = '198.51.100.10'; fleet.groups[0].templateConfig.values.ha_groupId = '41';
    let body = output(fleet);
    expect(body).toContain('data-topology-key="overview-vip-g1"'); expect(body).toContain('HA VIP'); expect(body).not.toContain('198.51.100.10'); expect(body).not.toContain('Group ID');
    fleet.groups[0].templateConfig.platform = 'azure'; body = output(fleet);
    expect(body).not.toContain('data-topology-key="overview-vip-g1"');
  });
  it('escapes names and keeps removed appliances and groups out of the image', () => {
    const fleet = freshFleet(); fleet.members[0].config.values.name = '<script>name</script>';
    fleet.groups[0].label = '<b>group</b>'; const empty = addGroup(fleet, 'Empty group');
    let body = output(fleet);
    expect(body).toContain('&lt;script>name&lt;/script>'); expect(body).toContain('&lt;b>group&lt;/b>'); expect(body).not.toContain('<script>name</script>');
    expect(body).toContain('No active UAGs'); fleet.members[0].removed = true; empty.removed = true; body = output(fleet);
    expect(body).not.toContain('overview-uag-1'); expect(body).not.toContain('Empty group');
  });
});
