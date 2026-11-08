import { nicUsesStaticIpv4, type Config } from './model';
import { FORWARD_FLAGS, cascadeRole } from './cascade';
import { collectBlocks, deploymentCommand } from './generate';
import { runtimeSwitches } from './powershell';
import type { Issue } from './validate';
import { platformDef } from './versions';

export interface TopologyNode {
  id: string;
  label: string;
  sub?: string;
  kind: 'client' | 'uag' | 'backend' | 'aux';
}

export interface Topology {
  nodes: TopologyNode[];
  /** from -> to with an optional label. */
  edges: { from: string; to: string; label?: string }[];
}

function host(url: unknown): string {
  try {
    return new URL(String(url)).host;
  } catch {
    return String(url ?? '') || '?';
  }
}

export function buildTopology(c: Config): Topology {
  const v = c.values;
  const nodes: TopologyNode[] = [{ id: 'client', label: 'Internet', sub: 'Horizon / web clients', kind: 'client' }];
  const edges: Topology['edges'] = [];
  const ext = ([0, 1] as const).filter((nic) => nicUsesStaticIpv4(c, nic)).map((nic) => v[`ip${nic}`]).filter(Boolean).join(' · ');
  nodes.push({ id: 'uag', label: String(v.uagName || 'uag'), sub: ext || `UAG ${c.version}`, kind: 'uag' });
  edges.push({ from: 'client', to: 'uag', label: v.blastEnabled === true && v.horizon_enabled === true ? '443 / 8443' : '443' });

  if (cascadeRole(v) === 'outer') {
    nodes.push({ id: 'inner', label: 'Inner UAG', sub: host(v.cascade_innerUrl), kind: 'uag' });
    edges.push({ from: 'uag', to: 'inner', label: 'DMZ 2' });
  } else if (v.horizon_enabled === true) {
    nodes.push({ id: 'cs', label: 'Horizon CS', sub: host(v.proxyDestinationUrl), kind: 'backend' });
    edges.push({ from: 'uag', to: 'cs', label: 'XML-API' });
  }
  c.wrp.forEach((item, i) => {
    nodes.push({ id: `wrp${i}`, label: String(item.instanceId || `proxy ${i + 1}`), sub: host(item.proxyDestinationUrl), kind: 'backend' });
    edges.push({ from: 'uag', to: `wrp${i}` });
  });
  if (v.radius_enabled === true) {
    nodes.push({ id: 'radius', label: 'RADIUS', sub: `${v.radius_hostName || '?'}:${v.radius_authPort}`, kind: 'aux' });
    edges.push({ from: 'uag', to: 'radius', label: 'MFA' });
  }
  if (v.saml_enabled === true) {
    nodes.push({ id: 'idp', label: 'SAML IdP', sub: host(v.saml_entityID), kind: 'aux' });
    edges.push({ from: 'uag', to: 'idp', label: 'SAML' });
  }
  c.syslog.forEach((item, i) => {
    nodes.push({ id: `sys${i}`, label: 'Syslog', sub: String(item.syslogUrl || item.hostname || '?'), kind: 'aux' });
    edges.push({ from: 'uag', to: `sys${i}`, label: String(item.sysLogType) });
  });
  if (v.snmp_enabled === true) {
    nodes.push({ id: 'snmp', label: 'SNMP monitor', sub: String(v.snmp_version), kind: 'aux' });
    edges.push({ from: 'snmp', to: 'uag', label: 'poll' });
  }
  return { nodes, edges };
}

/** Markdown documentation of the configuration, suitable for runbooks and change tickets. */
export function generateDocs(c: Config, issues: Issue[]): string {
  const v = c.values;
  const def = platformDef(c.platform);
  const L: string[] = [];
  L.push(`# ${v.uagName || 'UAG'} - configuration summary`, '');
  L.push(`- **UAG version:** ${c.version}`, `- **Platform:** ${def.label} (\`${def.script}\`)`, `- **Deployment:** ${v.deploymentOption}`);
  if (nicUsesStaticIpv4(c, 0) && v.ip0) L.push(`- **NIC0:** ${v.ip0}${v.netmask0 ? ' / ' + v.netmask0 : ''}`);
  if (nicUsesStaticIpv4(c, 1) && v.ip1) L.push(`- **NIC1:** ${v.ip1}`);
  if (v.dns) L.push(`- **DNS:** ${v.dns}`);
  if (v.ntpServers) L.push(`- **NTP:** ${v.ntpServers}`);
  L.push('', '## Deployment', '');
  L.push(`- Run: \`${deploymentCommand(c, runtimeSwitches(c))}\``);
  if (c.platform === 'nutanix') {
    L.push('- Upload the UAG QCOW2 image to Prism Central; the cluster and subnet names referenced by the INI must already exist.');
    L.push('- The official script deletes and recreates a VM with the configured name and prompts for the root, admin and Prism Central passwords.');
  }
  if (c.platform === 'openshift') {
    L.push('- **Limited Availability:** vendor access, the target namespace, StorageClass, NADs, RBAC and NetworkPolicies must be prepared first.');
    if (v.ocp_volumeSourceMode === 'console') {
      L.push('- **Runbook mode:** upload the local QCOW2 through the OpenShift web console; no YAML is emitted for a browser-local file.');
    } else {
      L.push('- Apply the generated CDI `DataVolume`/`DataSource` YAML and wait for the volume import to reach Succeeded/100% before running the UAG script.');
    }
    L.push('- Verify the deployed VirtualMachine is Running/Ready and check its assigned NICs and IP addresses.');
  }
  L.push('- Root and admin passwords are read at deploy time (prompt, or `-rootPwd` / `-adminPwd`); they are not part of the INI.');
  L.push('', '## Edge services', '');
  if (cascadeRole(v) === 'outer') L.push(`- **Cascade - outer UAG (DMZ 1)** reverse proxy → ${v.cascade_innerUrl || '(not set)'}`);
  if (cascadeRole(v) === 'inner') L.push('- **Cascade - inner UAG (DMZ 2)**: Horizon external URLs must point to the outer UAG');
  if (v.horizon_enabled === true && cascadeRole(v) !== 'outer') {
    L.push(`- **Horizon** → ${v.proxyDestinationUrl || '(not set)'} (auth: ${v.authMethods}, location: ${v.gatewayLocation})`);
    if (v.blastEnabled === true) L.push(`  - Blast: ${v.blastExternalUrl || 'default'}`);
    if (v.tunnelEnabled === true) L.push(`  - Tunnel: ${v.tunnelExternalUrl || 'default'}`);
    if (v.pcoipEnabled === true) L.push(`  - PCoIP: ${v.pcoipExternalUrl || 'default'}`);
  }
  for (const w of c.wrp) L.push(`- **Web reverse proxy \`${w.instanceId}\`** → ${w.proxyDestinationUrl} (auth: ${w.authMethods})`);
  if (v.horizon_enabled !== true && cascadeRole(v) !== 'outer' && c.wrp.length === 0) L.push('- none');
  L.push('', '## Authentication', '');
  L.push(v.radius_enabled === true ? `- RADIUS: ${v.radius_hostName}:${v.radius_authPort} (${v.radius_authType})${v.radius_enabledAux === true ? ` + secondary ${v.radius_hostName_2}` : ''}` : '- RADIUS: off');
  L.push(v.saml_enabled === true ? `- SAML IdP: ${v.saml_entityID}` : '- SAML: off');
  L.push('', '## Firewall / ports to publish', '');
  const ports = new Set<string>(['TCP 443 (HTTPS / XML-API / tunnel)']);
  if (v.horizon_enabled === true && v.blastEnabled === true) ports.add('TCP+UDP 8443 (Blast)');
  if (cascadeRole(v) === 'outer') for (const f of FORWARD_FLAGS) if (v[f.id] === true) ports.add(`${f.proto.toUpperCase()} ${f.port} (forwarded to inner UAG)`);
  if (v.horizon_enabled === true && v.pcoipEnabled === true) ports.add('TCP+UDP 4172 (PCoIP)');
  L.push(...[...ports].map((p) => `- ${p}`), '- TCP 9443 (admin UI/API - management network only)');
  L.push('', '## Monitoring', '');
  L.push(c.syslog.length ? c.syslog.map((s) => `- Syslog ${s.sysLogType}: ${s.syslogUrl || s.hostname}`).join('\n') : '- Syslog: none');
  L.push(v.snmp_enabled === true ? `- SNMP: ${v.snmp_version}` : '- SNMP: off');
  L.push('', '## Validation', '');
  if (issues.length === 0) L.push('- No findings.');
  for (const i of issues) L.push(`- **${i.level.toUpperCase()}** ${i.message}`);
  L.push('', '## Emitted keys', '');
  for (const b of collectBlocks(c, { secrets: 'placeholder' })) L.push(`- \`[${b.section}]\` ${b.entries.length} setting(s)`);
  L.push('');
  return L.join('\n');
}
