import { activeWrpItems, nicUsesStaticIpv4, type Config } from './model';
import { deploymentNicCount } from './schema';
import { FORWARD_FLAGS, cascadeRole } from './cascade';
import { collectBlocks, deploymentCommand } from './generate';
import { ADMIN_PASSWORD_GUIDANCE, adminSamlEnabled, MISSING_PASSWORD_WARNING, runtimeSwitches, VSPHERE_HEADLESS_GUIDANCE } from './powershell';
import { VCENTER_CREDENTIAL_TARGET_EXAMPLE, VCENTER_INLINE_PASSWORD_WARNING, OVF_TOOL_VERSION_GUIDANCE } from './vcenterTarget';
import type { Issue } from './validate';
import { platformDef } from './versions';
import { vmReplacementWarning } from './deployment-safety';

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
  const wrp = activeWrpItems(c);
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
  const hasPublishedService = role === 'outer' || role === 'inner' || v.horizon_enabled === true || v.contentGateway_enabled === true || v.seg_enabled === true || wrp.length > 0;
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
  const ips = ([0, 1, 2] as const).slice(0, nicCount).filter((nic) => nicUsesStaticIpv4(c, nic)).map((nic) => v[`ip${nic}`]).filter(Boolean).join(' · ');
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
  wrp.forEach((item, i) => {
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
  if (v.contentGateway_enabled === true) {
    const shared = v.contentGateway_mode === 'shared';
    const uemHost = shared ? v.airwatch_apiServerUrl : v.contentGateway_apiServerUrl;
    nodes.push({
      id: 'content-gateway-client',
      label: 'Content Gateway clients',
      sub: String(shared ? v.airwatch_airwatchServerHostname : v.contentGateway_airwatchServerHostname) || 'public hostname',
      detail: 'Workspace ONE managed content',
      kind: 'client',
      zone: 'untrusted'
    });
    const existingUem = nodes.find((node) => node.id === 'uem');
    if (!existingUem) {
      nodes.push({
        id: 'content-uem',
        label: 'Workspace ONE UEM',
        sub: host(uemHost),
        detail: 'Content Gateway configuration',
        kind: 'identity',
        zone: 'internal'
      });
    }
    edges.push({ from: 'content-gateway-client', to: 'uag', label: 'HTTPS 443 · managed content', kind: 'access' });
    edges.push({ from: 'uag', to: existingUem ? 'uem' : 'content-uem', label: 'API / AWCM configuration', kind: 'service' });
  }
  if (v.seg_enabled === true) {
    nodes.push({ id: 'seg-client', label: 'Secure Email Gateway clients', sub: String(v.seg_airwatchServerHostname || 'SEG hostname not set'), detail: 'Managed email access; verify mail-flow topology separately', kind: 'client', zone: 'untrusted' });
    nodes.push({ id: 'seg-uem', label: 'SEG Workspace ONE UEM', sub: host(v.seg_apiServerUrl), detail: 'Mobile Email Management configuration', kind: 'identity', zone: 'internal' });
    edges.push({ from: 'seg-client', to: 'uag', label: 'SEG managed email', kind: 'access' });
    edges.push({ from: 'uag', to: 'seg-uem', label: 'UEM API configuration', kind: 'service' });
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
    `${wrp.length} web reverse proxy instance${wrp.length === 1 ? '' : 's'}`,
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
  const wrp = activeWrpItems(c);
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
  } else {
    for (const nic of [0, 1, 2] as const) {
      if (nicUsesStaticIpv4(c, nic) && v[`ip${nic}`]) L.push(`- **NIC${nic}:** ${v[`ip${nic}`]}${v[`netmask${nic}`] ? ' / ' + v[`netmask${nic}`] : ''}`);
    }
  }
  if (v.dns) L.push(`- **DNS:** ${v.dns}`);
  if (v.ntpServers) L.push(`- **NTP:** ${v.ntpServers}`);
  L.push('', '## Deployment', '');
  const replacementWarning = vmReplacementWarning(c.platform);
  if (replacementWarning) L.push(`**WARNING:** ${replacementWarning}`, '');
  L.push(`- Run: \`${deploymentCommand(c, runtimeSwitches(c))}\``);
  if (c.platform === 'nutanix') {
    L.push('- Upload the UAG QCOW2 image to Prism Central; the cluster and subnet names referenced by the INI must already exist.');
    L.push('- The official script prompts for root, Admin UI and Prism Central passwords when they are not supplied.');
    L.push('- The official script deletes and recreates a VM with the configured name.');
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
  L.push('- UAG Studio never asks for or stores UAG root or Admin UI passwords in the browser. Interactive mode lets the official script prompt; environment-password mode reads both passwords from the process environment.');
  L.push('- **CEIP:** PowerShell passes the configured setting explicitly as `-ceipEnabled \'yes\'` or `-ceipEnabled \'no\'`, removing that prompt only. Check the deployment package for your UAG release; this does not supply the vCenter password or guarantee unattended execution.');
  if (v.contentGateway_enabled === true) {
    const parameter = v.contentGateway_mode === 'shared' ? '-awAPIServerPwd' : '-awCGAPIServerPwd';
    const variable = v.contentGateway_mode === 'shared' ? 'UAG_WORKSPACE_ONE_UEM_API_PASSWORD' : 'UAG_CONTENT_GATEWAY_API_PASSWORD';
    L.push(`- **Content Gateway UEM password:** PowerShell reads \`${variable}\` and passes the vendor \`${parameter}\` parameter. It is never written to INI or JSON.`);
  }
  if (v.airwatch_enabled === true) {
    L.push('- **Workspace ONE Tunnel UEM password:** both interactive and environment-password modes require `UAG_WORKSPACE_ONE_UEM_API_PASSWORD` and pass it through `-awAPIServerPwd` for the shared `[Airwatch]` section. It is never written to INI, JSON, browser drafts, or the generated script.');
  }
  if (c.adminUsers.length > 0) {
    L.push(`- **Additional admin users (${c.adminUsers.length}):** the INI contains monitoring-role user metadata only. Both interactive and environment-password modes require \`UAG_NEW_ADMIN_USER_PASSWORDS\` as semicolon-separated \`username:password\` pairs and pass \`-NewAdminuserPwd\`. Passwords are never written to INI, JSON, or browser drafts.`);
  }
  L.push(`- **Deployment passwords:** ${MISSING_PASSWORD_WARNING}`);
  if (c.platform === 'vsphere') {
    L.push(`- **Fully unattended vSphere:** ${VSPHERE_HEADLESS_GUIDANCE}`);
    L.push(`- **Credentialed target example (synthetic):** \`${VCENTER_CREDENTIAL_TARGET_EXAMPLE}\`. The UPN domain belongs before the colon; check special-character handling against the installed OVF Tool release.`);
    L.push(`- **Inline vCenter passwords:** ${VCENTER_INLINE_PASSWORD_WARNING}`);
    L.push(`- **Deployment test evidence:** ${OVF_TOOL_VERSION_GUIDANCE}`);
  }
  L.push(`- **Admin UI password policy:** ${ADMIN_PASSWORD_GUIDANCE} Do not skip the admin password prompt if password-based access is required. Check the [password requirements for your deployed UAG release](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PasswordRequirementsforUAG).`);
  if (adminSamlEnabled(c)) L.push('- **Administrator SAML:** default admin password authentication is disabled. Use the configured identity provider for Admin UI access.');
  L.push('- **Recovery baseline:** retain the validated INI in an approved secrets-managed system and test clean redeployment. Assess break-glass recovery, monitoring, password rotation, backup and compliance requirements.');
  L.push('- Reference: [Omnissa non-interactive deployment parameters](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/NonInteractiveModeParameters) and [Run PowerShell script to deploy](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/RunPowerShellscripttodeploy).');
  if (v.ha_enabled === true) {
    L.push('', '## High availability', '');
    L.push(`- **Group ID:** ${v.ha_groupId || '(not set)'}. UAGs in the same HA group must use the same groupId (integer 1–255).`);
    L.push(`- **Virtual IP address:** ${v.ha_virtualIPAddress || '(not set)'}. The Virtual IP Address used for High Availability. This IP should be in the same subnet as the eth0 interface.`);
    L.push('- Reserve a unique, available IPv4 VIP and a Group ID unique to this group in the subnet. Studio does not verify address availability or infer DHCP subnets.');
    L.push('- JSON uses `loadBalancerSettings` with `groupID`, `virtualIPAddress` and `loadBalancerMode: ONEARM`. Native HA is not supported on Azure. Deploy/configure nodes separately; topology, VIP ownership and failover require lab verification.');
  }
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
  if (v.contentGateway_enabled === true) {
    const shared = v.contentGateway_mode === 'shared';
    L.push(`- **Workspace ONE Content Gateway** (${shared ? 'shared [Airwatch]' : 'standalone [AirwatchContentGateway]'}) → ${shared ? v.airwatch_airwatchServerHostname || '(not set)' : v.contentGateway_airwatchServerHostname || '(not set)'}; UEM API ${shared ? v.airwatch_apiServerUrl || '(not set)' : v.contentGateway_apiServerUrl || '(not set)'}`);
  }
  for (const w of wrp) L.push(`- **Web reverse proxy \`${w.instanceId}\`** → ${w.proxyDestinationUrl} (auth: ${w.authMethods})`);
  if (v.seg_enabled === true) L.push(`- **Secure Email Gateway** (standalone) → ${v.seg_apiServerUrl}; MEM configuration: ${v.seg_memConfigurationId}. Verify package credentials and real mail flow separately.`);
  if (v.horizon_enabled !== true && v.airwatch_enabled !== true && v.contentGateway_enabled !== true && v.seg_enabled !== true && cascadeRole(v) !== 'outer' && wrp.length === 0) L.push('- none');
  L.push('', '## Additional admin and API users', '');
  for (const user of c.adminUsers) {
    L.push(`- ${user.name || '(name required)'} (${user.enabled === false ? 'disabled' : 'enabled'}; \`ROLE_MONITORING\`; pre-expired password: ${user.adminMonitoringPasswordPreExpired === false ? 'no' : 'yes'})`);
  }
  if (c.adminUsers.length === 0) L.push('- none');
  L.push('', '## Identity and access', '');
  L.push(v.radius_enabled === true ? `- RADIUS: ${v.radius_hostName}:${v.radius_authPort} (${v.radius_authType})${v.radius_enabledAux === true ? ` + secondary ${v.radius_hostName_2}` : ''}` : '- RADIUS: off');
  L.push(v.saml_enabled === true ? `- SAML IdP: ${v.saml_entityID}` : '- SAML: off');
  for (const item of c.jwt) L.push(`- JWT consumer: ${item.name || '(name required)'}. Configure the consuming service separately; public key/CA file paths require INI deployment or external JSON materialization.`);
  for (const item of c.jwtIssuers) L.push(`- JWT producer: ${item.name || '(name required)'}. Signing files/passwords remain on the deployment host; settings JSON alone is incomplete.`);
  if (v.quiesceMode === true) L.push('- Quiesce mode requested in generated configuration. Monitor service sessions before taking the appliance offline; this builder does not change a running appliance.');
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
