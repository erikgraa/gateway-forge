import type { Config } from './model';
import { deploymentNicCount } from './schema';
import { FORWARD_FLAGS, cascadeRole } from './cascade';
import { collectBlocks, platformScript } from './generate';
import { runtimeSwitches } from './powershell';
import type { Issue } from './validate';
import { platformDef } from './versions';

export interface TopologyNode {
  id: string;
  label: string;
  sub?: string;
  detail?: string;
  kind: 'client' | 'uag' | 'backend' | 'identity' | 'monitoring';
  zone: 'untrusted' | 'dmz' | 'internal';
}

export interface Topology {
  nodes: TopologyNode[];
  /** from -> to with an optional label. */
  edges: { from: string; to: string; label: string; kind: 'access' | 'service' | 'identity' | 'monitoring' | 'cascade' }[];
  facts: string[];
  description: string;
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
  const role = cascadeRole(v);
  const def = platformDef(c.platform);
  const deployment = String(v.deploymentOption || 'onenic');
  const nicCount = deployment.startsWith('threenic') ? 3 : deployment.startsWith('twonic') ? 2 : 1;
  const nicRoles = nicCount === 1
    ? 'NIC0 · internet / management / backend'
    : nicCount === 2
      ? 'NIC0 internet · NIC1 management / backend'
      : 'NIC0 internet · NIC1 management · NIC2 backend';
  const horizonProtocols = v.horizon_enabled === true ? [
      'HTTPS 443',
      v.tunnelEnabled === true ? 'Tunnel 443' : '',
      v.blastEnabled === true ? 'Blast TCP+UDP 8443' : '',
      v.pcoipEnabled === true ? 'PCoIP TCP+UDP 4172' : ''
    ].filter(Boolean) : [];
  const protocolLabel = horizonProtocols.join(' · ');
  const hasPublishedService = role === 'outer' || role === 'inner' || v.horizon_enabled === true || c.wrp.length > 0;
  const nodes: TopologyNode[] = [];
  if (hasPublishedService) {
    nodes.push({
      id: 'client',
      label: 'External clients',
      sub: 'Horizon · browser · applications',
      detail: protocolLabel || 'HTTPS 443',
      kind: 'client',
      zone: 'untrusted'
    });
  }
  const edges: Topology['edges'] = [];
  const ips = [v.ip0, v.ip1, v.ip2].slice(0, nicCount).filter(Boolean).join(' · ');
  nodes.push({
    id: 'uag',
    label: String(v.uagName || 'UAG'),
    sub: `${def.label} · UAG ${c.version} · ${nicCount}-NIC`,
    detail: ips ? `${nicRoles}\n${ips}` : nicRoles,
    kind: 'uag',
    zone: 'dmz'
  });

  if (role === 'inner') {
    nodes.push({
      id: 'outer',
      label: 'Outer UAG',
      sub: 'Cascade peer · DMZ 1',
      detail: 'Configured externally',
      kind: 'uag',
      zone: 'dmz'
    });
    edges.push({ from: 'client', to: 'outer', label: protocolLabel || 'HTTPS 443', kind: 'access' });
    edges.push({ from: 'outer', to: 'uag', label: 'Cascade to DMZ 2', kind: 'cascade' });
  } else if (hasPublishedService) {
    edges.push({ from: 'client', to: 'uag', label: protocolLabel || 'HTTPS 443', kind: 'access' });
  }

  if (role === 'outer') {
    const forwarded = FORWARD_FLAGS
      .filter((f) => v[f.id] === true)
      .map((f) => `${f.proto.toUpperCase()} ${f.port}`)
      .filter((value, index, all) => all.indexOf(value) === index);
    nodes.push({
      id: 'inner',
      label: 'Inner UAG',
      sub: host(v.cascade_innerUrl),
      detail: forwarded.length ? `Cascade · ${forwarded.join(' · ')}` : 'Cascade · Horizon XML-API',
      kind: 'uag',
      zone: 'dmz'
    });
    edges.push({ from: 'uag', to: 'inner', label: 'DMZ 1 → DMZ 2 · TLS / forwarded ports', kind: 'cascade' });
  } else if (v.horizon_enabled === true) {
    nodes.push({
      id: 'cs',
      label: 'Horizon Connection Server',
      sub: host(v.proxyDestinationUrl),
      detail: `XML-API · ${String(v.authMethods || 'passthrough')}`,
      kind: 'backend',
      zone: 'internal'
    });
    edges.push({ from: 'uag', to: 'cs', label: 'HTTPS · XML-API', kind: 'service' });
  }
  c.wrp.forEach((item, i) => {
    nodes.push({
      id: `wrp${i}`,
      label: String(item.instanceId || `Web proxy ${i + 1}`),
      sub: host(item.proxyDestinationUrl),
      detail: `Web reverse proxy · ${String(item.authMethods || 'passthrough')}`,
      kind: 'backend',
      zone: 'internal'
    });
    edges.push({ from: 'uag', to: `wrp${i}`, label: 'HTTPS · reverse proxy', kind: 'service' });
  });
  if (v.radius_enabled === true) {
    nodes.push({
      id: 'radius',
      label: 'RADIUS / MFA',
      sub: `${v.radius_hostName || 'host not set'}:${v.radius_authPort || 1812}`,
      detail: String(v.radius_authType || 'Authentication'),
      kind: 'identity',
      zone: 'internal'
    });
    edges.push({ from: 'uag', to: 'radius', label: `RADIUS · UDP ${v.radius_authPort || 1812}`, kind: 'identity' });
  }
  if (v.saml_enabled === true) {
    nodes.push({
      id: 'idp',
      label: 'SAML identity provider',
      sub: host(v.saml_entityID),
      detail: 'Identity assertion / metadata',
      kind: 'identity',
      zone: 'internal'
    });
    edges.push({ from: 'uag', to: 'idp', label: 'SAML · HTTPS metadata / assertions', kind: 'identity' });
  }
  if (v.airwatch_enabled === true) {
    nodes.push({
      id: 'tunnel-client',
      label: 'Tunnel clients',
      sub: String(v.airwatch_airwatchServerHostname || 'public hostname'),
      detail: 'Workspace ONE per-app VPN',
      kind: 'client',
      zone: 'untrusted'
    });
    nodes.push({
      id: 'uem',
      label: 'Workspace ONE UEM',
      sub: host(v.airwatch_apiServerUrl),
      detail: 'Tunnel configuration / device allowlist',
      kind: 'identity',
      zone: 'internal'
    });
    edges.push({ from: 'tunnel-client', to: 'uag', label: 'Per-app VPN · TCP/UDP 8443', kind: 'access' });
    edges.push({ from: 'uag', to: 'uem', label: 'API / AWCM configuration', kind: 'service' });
  }
  c.syslog.forEach((item, i) => {
    nodes.push({
      id: `sys${i}`,
      label: String(item.syslogSettingName || 'Syslog'),
      sub: String(item.syslogUrl || item.hostname || 'collector not set'),
      detail: `${item.sysLogType || 'TLS'} event forwarding`,
      kind: 'monitoring',
      zone: 'internal'
    });
    edges.push({ from: 'uag', to: `sys${i}`, label: String(item.sysLogType || 'TLS'), kind: 'monitoring' });
  });
  if (v.snmp_enabled === true) {
    nodes.push({
      id: 'snmp',
      label: 'SNMP monitor',
      sub: String(v.snmp_version || 'SNMP'),
      detail: 'Management polling',
      kind: 'monitoring',
      zone: 'internal'
    });
    edges.push({ from: 'snmp', to: 'uag', label: 'SNMP poll', kind: 'monitoring' });
  }
  const facts = [
    `${def.label} · UAG ${c.version}`,
    `${nicCount}-NIC deployment: ${nicRoles}`,
    role === 'none' ? 'Direct publishing topology' : `${role === 'outer' ? 'Outer' : 'Inner'} cascade role`,
    v.horizon_enabled === true ? `Horizon protocols: ${horizonProtocols.join(', ')}` : 'Horizon edge service disabled',
    `${c.wrp.length} web reverse proxy instance${c.wrp.length === 1 ? '' : 's'}`,
    `Identity: ${[v.radius_enabled === true ? 'RADIUS' : '', v.saml_enabled === true ? 'SAML' : ''].filter(Boolean).join(', ') || 'none enabled'}`
  ];
  const description = [
    `Live UAG topology for ${v.uagName || 'UAG'} on ${def.label}, version ${c.version}.`,
    facts.slice(1).join('. '),
    ...edges.map((edge) => {
      const from = nodes.find((node) => node.id === edge.from)?.label || edge.from;
      const to = nodes.find((node) => node.id === edge.to)?.label || edge.to;
      return `${from} connects to ${to} using ${edge.label}.`;
    })
  ].join(' ');
  return { nodes, edges, facts, description };
}

/** Markdown documentation of the configuration, suitable for runbooks and change tickets. */
export function generateDocs(c: Config, issues: Issue[]): string {
  const v = c.values;
  const def = platformDef(c.platform);
  const L: string[] = [];
  L.push(`# ${v.uagName || 'UAG'} - configuration summary`, '');
  L.push(`- **UAG version:** ${c.version}`, `- **Platform:** ${def.label} (\`${def.script}\`)`, `- **Deployment:** ${v.deploymentOption}`);
  if (c.platform === 'vsphere' || c.platform === 'hyperv') {
    L.push(`- **NIC0 / Internet:** ${v.netInternet || '(not set)'} - ${v.ip0 || '(no IP)'}${v.netmask0 ? ' / ' + v.netmask0 : ''}`);
    if (deploymentNicCount(v) >= 2) L.push(`- **NIC1 / ${deploymentNicCount(v) === 2 ? 'Backend + Management' : 'Management'}:** ${v.netManagementNetwork || '(not set)'} - ${v.ip1 || '(no IP)'}${v.netmask1 ? ' / ' + v.netmask1 : ''}`);
    if (deploymentNicCount(v) === 3) L.push(`- **NIC2 / Backend:** ${v.netBackendNetwork || '(not set)'} - ${v.ip2 || '(no IP)'}${v.netmask2 ? ' / ' + v.netmask2 : ''}`);
    L.push(`- **Default gateway (NIC0):** ${v.defaultGateway || '(not set)'}`);
    if (deploymentNicCount(v) === 2) L.push('- **Two-NIC mapping:** Internet (NIC0) + combined Backend and Management (NIC1); no dedicated third Backend NIC.');
  }
  if (v.dns) L.push(`- **DNS:** ${v.dns}`);
  if (v.ntpServers) L.push(`- **NTP:** ${v.ntpServers}`);
  L.push('', '## Deployment', '');
  L.push(`- Run: \`${platformScript(c)} -iniFile <file>.ini${runtimeSwitches(c)}\``);
  L.push('- Gateway Forge never asks for or stores the UAG root or Admin UI passwords. Omnissa marks `-rootPwd` and `-adminPwd` as mandatory for headless deployment; the generated PowerShell reads them only at deploy time when supplied.');
  L.push('- **Immutable / replace-on-failure option:** Omnissa documents that an appliance may be deployed without an Admin UI password when no post-deployment changes are needed. The Admin UI and API are then unavailable, no user can be added later, and the appliance must be redeployed to restore administrative access. This does not remove or disable the root account.');
  L.push('- Before choosing this workflow, complete and test the INI as the recovery baseline; retain deployment artifacts in an approved secrets-managed system; and assess console access, break-glass recovery, monitoring, password rotation, change control, backup, and compliance requirements. Redeploy rather than attempting in-place administration.');
  L.push('- Reference: [Omnissa non-interactive deployment parameters](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/NonInteractiveModeParameters) and [Run PowerShell script to deploy](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/RunPowerShellscripttodeploy).');
  L.push('', '## Edge services', '');
  if (cascadeRole(v) === 'outer') L.push(`- **Cascade - outer UAG (DMZ 1)** reverse proxy → ${v.cascade_innerUrl || '(not set)'}`);
  if (cascadeRole(v) === 'inner') L.push('- **Cascade - inner UAG (DMZ 2)**: Horizon external URLs must point to the outer UAG');
  if (v.horizon_enabled === true && cascadeRole(v) !== 'outer') {
    L.push(`- **Horizon** → ${v.proxyDestinationUrl || '(not set)'} (auth: ${v.authMethods}, location: ${v.gatewayLocation})`);
    if (v.blastEnabled === true) L.push(`  - Blast: ${v.blastExternalUrl || 'default'}`);
    if (v.tunnelEnabled === true) L.push(`  - Tunnel: ${v.tunnelExternalUrl || 'default'}`);
    if (v.pcoipEnabled === true) L.push(`  - PCoIP: ${v.pcoipExternalUrl || 'default'}`);
  }
  if (v.airwatch_enabled === true) L.push(`- **Workspace ONE Tunnel** → ${v.airwatch_airwatchServerHostname || '(not set)'}; UEM API ${v.airwatch_apiServerUrl || '(not set)'}`);
  for (const w of c.wrp) L.push(`- **Web reverse proxy \`${w.instanceId}\`** → ${w.proxyDestinationUrl} (auth: ${w.authMethods})`);
  if (v.horizon_enabled !== true && v.airwatch_enabled !== true && cascadeRole(v) !== 'outer' && c.wrp.length === 0) L.push('- none');
  L.push('', '## Authentication', '');
  L.push(v.radius_enabled === true ? `- RADIUS: ${v.radius_hostName}:${v.radius_authPort} (${v.radius_authType})${v.radius_enabledAux === true ? ` + secondary ${v.radius_hostName_2}` : ''}` : '- RADIUS: off');
  L.push(v.saml_enabled === true ? `- SAML IdP: ${v.saml_entityID}` : '- SAML: off');
  L.push('', '## Firewall / ports to publish', '');
  const ports = new Set<string>(['TCP 443 (HTTPS / XML-API / tunnel)']);
  if (v.horizon_enabled === true && v.blastEnabled === true) ports.add('TCP+UDP 8443 (Blast)');
  if (cascadeRole(v) === 'outer') for (const f of FORWARD_FLAGS) if (v[f.id] === true) ports.add(`${f.proto.toUpperCase()} ${f.port} (forwarded to inner UAG)`);
  if (v.horizon_enabled === true && v.pcoipEnabled === true) ports.add('TCP+UDP 4172 (PCoIP)');
  if (v.airwatch_enabled === true) ports.add('TCP+UDP 8443 (Workspace ONE Tunnel per-app VPN)');
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
