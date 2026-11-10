import { applyPatch, defaultConfig, type Config } from './model';
import type { Values } from './schema';

export type TemplateAccent = 'blue' | 'violet' | 'indigo' | 'amber' | 'orange' | 'teal' | 'rose' | 'cyan' | 'emerald' | 'sky' | 'red';

export interface Template {
  id: string;
  title: string;
  description: string;
  tags: string[];
  appearance: { accent: TemplateAccent; label: string };
  build: (base: Config) => Config;
}

const common: Values = {
  uagName: 'uag-dmz-01',
  name: 'uag-dmz-01',
  deploymentOption: 'twonic',
  ipmode0: 'STATICV4',
  ipmode1: 'STATICV4',
  ipmode2: 'STATICV4',
  ipMode0: 'STATICV4',
  ipMode1: 'STATICV4',
  ipMode2: 'STATICV4',
  dns: '10.0.0.10 10.0.0.11',
  ntpServers: 'ntp1.corp.local ntp2.corp.local',
  tls12Enabled: true,
  tls13Enabled: true,
  tls11Enabled: false,
  tls10Enabled: false,
  sshEnabled: false,
  ceipEnabled: false
};

// The operator must supply the real server CA path; no trust material is invented for templates.
const syslogTls = { sysLogType: 'TLS', syslogCategory: 'ALL', syslogFormat: 'TEXT', hostname: 'syslog.corp.local', port: 6514, syslogSettingName: 'siem' };

function fresh(base: Config, values: Values, extra: Partial<Config> = {}): Config {
  const d = defaultConfig();
  return applyPatch(d, { version: base.version, platform: base.platform, values: { ...common, ...values }, ...extra });
}

export const TEMPLATES: Template[] = [
  {
    id: 'horizon-radius',
    appearance: { accent: 'violet', label: 'Horizon · RADIUS MFA' },
    title: 'Horizon external access with RADIUS MFA',
    description: 'Internet-facing UAG for Horizon with Blast + tunnel, RADIUS two-factor authentication and TLS syslog. Two NICs.',
    tags: ['Horizon', 'RADIUS', 'MFA'],
    build: (b) =>
      fresh(
        b,
        {
          horizon_enabled: true,
          proxyDestinationUrl: 'https://cs01.corp.local',
          proxyDestinationUrlThumbprints: '',
          authMethods: 'radius-auth',
          gatewayLocation: 'external',
          blastEnabled: true,
          blastExternalUrl: 'https://vdi.example.com:443',
          tunnelEnabled: true,
          tunnelExternalUrl: 'https://vdi.example.com:443',
          pcoipEnabled: false,
          radius_enabled: true,
          radius_hostName: 'radius01.corp.local',
          radius_authPort: 1812,
          radius_authType: 'PAP',
          radius_numAttempts: 3,
          radius_serverTimeout: 5,
          radius_radiusDisplayHint: 'MFA token'
        },
        { syslog: [syslogTls] }
      )
  },
  {
    id: 'horizon-saml',
    appearance: { accent: 'indigo', label: 'Horizon · SAML identity' },
    title: 'Horizon external access with SAML (third-party IdP)',
    description: 'Horizon behind a SAML identity provider (e.g. Entra ID / Okta / ADFS). Provide the IdP metadata XML path at deploy time.',
    tags: ['Horizon', 'SAML'],
    build: (b) =>
      fresh(
        b,
        {
          horizon_enabled: true,
          proxyDestinationUrl: 'https://cs01.corp.local',
          authMethods: 'saml-auth',
          samlSP: 'DEMO',
          gatewayLocation: 'external',
          blastEnabled: true,
          blastExternalUrl: 'https://vdi.example.com:443',
          tunnelEnabled: true,
          saml_enabled: true,
          saml_entityID: 'https://idp.example.com/metadata',
          saml_metadataXmlFile: 'C:\\uag\\idp-metadata.xml'
        },
        { syslog: [syslogTls] }
      )
  },
  {
    id: 'cascade-outer',
    appearance: { accent: 'amber', label: 'Cascade · Outer / DMZ 1' },
    title: 'Cascade: outer UAG (DMZ 1, reverse proxy)',
    description: 'Double-DMZ outer appliance: reverse proxy for Client XML, tunnel and Blast on 443, with forward rules for Blast 8443/UDP, to the inner UAG.',
    tags: ['Cascade', 'Double DMZ', 'Horizon'],
    build: (b) =>
      fresh(
        b,
        {
          uagName: 'uag-dmz1-01',
          name: 'uag-dmz1-01',
          horizon_enabled: false,
          cascade_role: 'outer',
          cascade_innerUrl: 'https://uag-dmz2-01.corp.local',
          cascade_innerIp: '192.168.2.101',
          cascade_fwdBlastTcp: true,
          cascade_fwdBlastUdp: true,
          cascade_fwdUdpTunnel: true
        }
      )
  },
  {
    id: 'cascade-inner',
    appearance: { accent: 'orange', label: 'Cascade · Inner / DMZ 2' },
    title: 'Cascade: inner UAG (DMZ 2, Horizon edge)',
    description: 'Double-DMZ inner appliance: standard Horizon edge service with RADIUS MFA. External URLs point at the outer UAG\'s public FQDN.',
    tags: ['Cascade', 'Double DMZ', 'Horizon', 'RADIUS'],
    build: (b) =>
      fresh(
        b,
        {
          uagName: 'uag-dmz2-01',
          name: 'uag-dmz2-01',
          horizon_enabled: true,
          cascade_role: 'inner',
          proxyDestinationUrl: 'https://cs01.corp.local',
          authMethods: 'radius-auth',
          gatewayLocation: 'external',
          blastEnabled: true,
          blastExternalUrl: 'https://vdi.example.com:443',
          tunnelEnabled: true,
          tunnelExternalUrl: 'https://vdi.example.com:443',
          radius_enabled: true,
          radius_hostName: 'radius01.corp.local'
        }
      )
  },
  {
    id: 'horizon-basic',
    appearance: { accent: 'blue', label: 'Horizon · Passthrough / lab' },
    title: 'Horizon minimal (passthrough)',
    description: 'Smallest working Horizon edge service with passthrough auth. Good for labs and internal gateways.',
    tags: ['Horizon', 'Lab'],
    build: (b) =>
      fresh(b, {
        horizon_enabled: true,
        proxyDestinationUrl: 'https://cs01.corp.local',
        authMethods: 'passthrough',
        gatewayLocation: 'internal',
        deploymentOption: 'onenic',
        blastEnabled: true,
        tunnelEnabled: true
      })
  },
  {
    id: 'wrp-intranet',
    appearance: { accent: 'teal', label: 'Web reverse proxy · Intranet' },
    title: 'Web reverse proxy for an intranet app',
    description: 'Publishes an internal HTTPS application through the UAG with RADIUS authentication.',
    tags: ['Web reverse proxy', 'RADIUS'],
    build: (b) =>
      fresh(
        b,
        {
          horizon_enabled: false,
          radius_enabled: true,
          radius_hostName: 'radius01.corp.local'
        },
        {
          wrp: [
            {
              instanceId: 'intranet',
              proxyDestinationUrl: 'https://intranet.corp.local',
              proxyPattern: '/(.*)',
              authMethods: 'radius-auth',
              healthCheckUrl: '/favicon.ico',
              landingPagePath: '/'
            }
          ],
          syslog: [syslogTls]
        }
      )
  },
  {
    id: 'hardened',
    appearance: { accent: 'rose', label: 'Security · Hardened baseline' },
    title: 'Hardened baseline (Horizon + SIEM + SNMPv3)',
    description: 'TLS 1.2/1.3 only, SHA-256 thumbprints, SSH off, CEIP off, TLS syslog and SNMPv3 monitoring.',
    tags: ['Hardening', 'Horizon', 'SNMP'],
    build: (b) =>
      fresh(
        b,
        {
          horizon_enabled: true,
          proxyDestinationUrl: 'https://cs01.corp.local',
          authMethods: 'saml-auth',
          gatewayLocation: 'external',
          blastEnabled: true,
          blastExternalUrl: 'https://vdi.example.com:443',
          tunnelEnabled: true,
          minSHAHashSize: 'SHA-256',
          originCheckEnabled: true,
          clientEncryptionMode: 'REQUIRED',
          saml_enabled: true,
          saml_entityID: 'https://idp.example.com/metadata',
          saml_metadataXmlFile: 'C:\\uag\\idp-metadata.xml',
          snmp_enabled: true,
          snmp_version: 'v3',
          snmp_usmUser: 'uagmon',
          snmp_authAlgorithm: 'SHA-256',
          snmp_privacyAlgorithm: 'AES',
          adminSessionIdleTimeoutMinutes: 5,
          rootSessionIdleTimeoutSeconds: 300
        },
        { syslog: [syslogTls] }
      )
  },
  {
    id: 'workspace-one-tunnel',
    appearance: { accent: 'cyan', label: 'Workspace ONE · Per-app VPN' },
    title: 'Workspace ONE Tunnel (per-app VPN)',
    description: 'UAG-hosted Tunnel basic endpoint on VMware or Hyper-V, with Workspace ONE UEM bootstrap, outbound-proxy options and TLS syslog.',
    tags: ['Workspace ONE', 'Tunnel', 'Per-app VPN'],
    build: (b) =>
      fresh(
        b,
        {
          uagName: 'uag-tunnel-01',
          name: 'uag-tunnel-01',
          horizon_enabled: false,
          airwatch_enabled: true,
          airwatch_tunnelGatewayEnabled: true,
          airwatch_apiServerUrl: 'https://as1234.awmdm.com',
          airwatch_apiServerUsername: 'domain\\svc-uag-tunnel',
          airwatch_organizationGroupCode: 'CORP',
          airwatch_tunnelConfigurationId: 'tunnel-production',
          airwatch_airwatchServerHostname: 'tunnel.example.com',
          airwatch_disableAutoConfigUpdate: false,
          airwatch_healthCheckUrl: '/favicon.ico'
        },
        { syslog: [syslogTls] }
      )
  },
  {
    id: 'workspace-one-content-gateway',
    appearance: { accent: 'emerald', label: 'Workspace ONE · Managed content' },
    title: 'Workspace ONE Content Gateway',
    description: 'Standalone UAG-hosted Content Gateway with a dedicated Workspace ONE UEM connection, UEM configuration ID and TLS syslog.',
    tags: ['Workspace ONE', 'Content Gateway', 'Managed content'],
    build: (b) =>
      fresh(
        b,
        {
          uagName: 'uag-content-01',
          name: 'uag-content-01',
          horizon_enabled: false,
          contentGateway_enabled: true,
          contentGateway_mode: 'standalone',
          contentGateway_apiServerUrl: 'https://as1234.awmdm.com',
          contentGateway_apiServerUsername: 'domain\\svc-uag-content',
          contentGateway_organizationGroupCode: 'CORP',
          contentGateway_cgConfigId: 'content-gateway-production',
          contentGateway_airwatchServerHostname: 'content.example.com',
          contentGateway_disableAutoConfigUpdate: false
        },
        { syslog: [syslogTls] }
      )
  },
  {
    id: 'nutanix-ahv',
    appearance: { accent: 'sky', label: 'Platform · Nutanix AHV' },
    title: 'Nutanix AHV (QCOW2 / PowerShell)',
    description: 'UAG 2609 on Nutanix AHV. Generates the [Nutanix] INI section and uagdeployntnx.ps1 command; the QCOW2 image, cluster and subnets must already exist in Prism Central.',
    tags: ['Nutanix', 'QCOW2', 'PowerShell'],
    build: (b) =>
      fresh(
        b,
        {
          horizon_enabled: true,
          proxyDestinationUrl: 'https://cs01.corp.local',
          authMethods: 'passthrough',
          gatewayLocation: 'external',
          blastEnabled: true,
          tunnelEnabled: true,
          uagName: 'uag-nutanix-01',
          name: 'uag-nutanix-01',
          deploymentOption: 'twonic',
          ipMode0: 'DHCPV4',
          ipMode1: 'DHCPV4',
          ntnx_prismCentralUserName: 'uag-deployer',
          ntnx_prismCentralAddress: 'prism.corp.local',
          ntnx_cluster: 'cluster1',
          ntnx_image: 'euc-unified-access-gateway-26.09.0.0-system.qcow2',
          ntnx_subnet0: 'uag-external',
          ntnx_subnet1: 'uag-management'
        },
        { version: '2609', platform: 'nutanix' }
      )
  },
  {
    id: 'openshift-virtualization',
    appearance: { accent: 'red', label: 'Platform · OpenShift' },
    title: 'Red Hat OpenShift Virtualization (Limited Availability)',
    description: 'UAG 2609 two-stage OpenShift workflow. Generates a CDI bootable-volume YAML, [OpenShift] INI section, oc preparation commands and uagdeployopenshift.ps1 invocation.',
    tags: ['OpenShift', 'Limited Availability', 'YAML'],
    build: (b) =>
      fresh(
        b,
        {
          horizon_enabled: true,
          proxyDestinationUrl: 'https://cs01.corp.local',
          authMethods: 'passthrough',
          gatewayLocation: 'external',
          blastEnabled: true,
          tunnelEnabled: true,
          uagName: 'uag-openshift-01',
          name: 'uag-openshift-01',
          deploymentOption: 'twonic',
          ipMode0: 'DHCPV4',
          ipMode1: 'DHCPV4',
          ocp_openShiftUserName: 'uag-deployer',
          ocp_openShiftEndpoint: 'https://api.cluster.example.com:6443',
          ocp_namespace: 'uag-dmz',
          ocp_instanceType: 'uag-medium',
          ocp_storageClass: 'uag-rwx',
          ocp_diskSizeGi: 20,
          ocp_volume: 'uag-bootable-volume',
          ocp_qcow2Url: 'https://images.corp.local/uag-2609.qcow2',
          ocp_nadName0: 'uag-external-network',
          ocp_nadName1: 'uag-management-network',
          ocp_labels: 'env=prod,app=uag'
        },
        { version: '2609', platform: 'openshift' }
      )
  }
];
