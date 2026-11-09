import { describe, expect, it } from 'vitest';
import { defaultConfig, applyPatch, stripSecrets } from './model';
import { collectBlocks, generateBootableVolumeManifest, generateIni, generateJson, generateJsonObject, manifestFileName, SECRET_PLACEHOLDER } from './generate';
import { TEMPLATES } from './templates';
import { generatePowerShell } from './powershell';
import { generateDocs } from './topology';
import { validateConfig } from './validate';
import { GROUPS } from './schema';
import { render } from './render';

const radiusMfa = () => TEMPLATES.find((t) => t.id === 'horizon-radius')!.build(defaultConfig());
const tunnel = () => TEMPLATES.find((t) => t.id === 'workspace-one-tunnel')!.build(defaultConfig());
const contentGateway = () => TEMPLATES.find((t) => t.id === 'workspace-one-content-gateway')!.build(defaultConfig());
const SSH_PUBLIC_KEY = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7 test@workstation';

describe('INI generation', () => {
  it('emits uagdeploy section and key names from the Omnissa reference', () => {
    const c = radiusMfa();
    c.values.radius_sharedSecret = 's3cret';
    const ini = generateIni(c, { secrets: 'include' });
    expect(ini).toContain('[General]');
    expect(ini).toContain('uagName=uag-dmz-01');
    expect(ini).toContain('deploymentoption=twonic');
    expect(ini).toContain('[Horizon]');
    expect(ini).toContain('proxyDestinationUrl=https://cs01.corp.local');
    expect(ini).toContain('authMethods=radius-auth');
    expect(ini).toContain('blastExternalUrl=https://vdi.example.com:443');
    expect(ini).toContain('[RADIUSAuth]');
    expect(ini).toContain('hostName=radius01.corp.local');
    expect(ini).toContain('authType=PAP');
    expect(ini).toContain('sharedSecret=s3cret');
    expect(ini).toContain('[SyslogServerSettings1]');
    expect(ini).toContain('sysLogType=TLS');
  });

  it('orders sections General, Horizon, RADIUS, Syslog', () => {
    const names = collectBlocks(radiusMfa()).map((b) => b.section);
    expect(names.indexOf('General')).toBeLessThan(names.indexOf('Horizon'));
    expect(names.indexOf('Horizon')).toBeLessThan(names.indexOf('RADIUSAuth'));
    expect(names.indexOf('RADIUSAuth')).toBeLessThan(names.indexOf('SyslogServerSettings1'));
  });

  it('masks secrets by default and supports omit/include', () => {
    const c = radiusMfa();
    c.values.radius_sharedSecret = 's3cret';
    const placeholder = generateIni(c);
    expect(placeholder).toContain(`sharedSecret=${SECRET_PLACEHOLDER}`);
    expect(placeholder).not.toContain('s3cret');
    const omit = generateIni(c, { secrets: 'omit' });
    expect(omit).not.toContain('sharedSecret');
    expect(omit).not.toContain('s3cret');
    expect(generateIni(c, { secrets: 'include' })).toContain('sharedSecret=s3cret');
  });

  it('never leaks secrets into the JSON unless opted in', () => {
    const c = radiusMfa();
    c.values.radius_sharedSecret = 's3cret';
    expect(generateJson(c)).not.toContain('s3cret');
    expect(generateJson(c, { secrets: 'omit' })).not.toContain('sharedSecret');
    expect(generateJson(c, { secrets: 'include' })).toContain('s3cret');
  });

  it('does not emit values for disabled sections', () => {
    const c = radiusMfa();
    c.values.radius_enabled = false;
    c.values.horizon_enabled = false;
    const ini = generateIni(c);
    expect(ini).not.toContain('[RADIUSAuth]');
    expect(ini).not.toContain('[Horizon]');
  });

  it('gates fields by UAG version', () => {
    const c = radiusMfa();
    c.values.minSHAHashSize = 'SHA-512';
    c.values.originCheckEnabled = false;
    const latest = generateIni({ ...c, version: '2609' });
    expect(latest).toContain('minSHAHashSize=SHA-512');
    expect(latest).toContain('originCheckEnabled=false');
    expect(latest).toContain('extendedServerCertValidationEnabled=false');
    const old = generateIni({ ...c, version: '2212' });
    expect(old).not.toContain('minSHAHashSize');
    expect(old).not.toContain('originCheckEnabled');
    expect(old).not.toContain('tunnelExternalUrl');
    expect(old).not.toContain('extendedServerCertValidationEnabled');
    const mid = generateIni({ ...c, version: '2406' });
    expect(mid).toContain('minSHAHashSize=SHA-512');
    expect(mid).not.toContain('originCheckEnabled');
    expect(mid).not.toContain('extendedServerCertValidationEnabled');
  });

  it('imports and exports extended server certificate validation only for UAG 2609', () => {
    const latest = applyPatch(defaultConfig(), {
      values: { extendedServerCertValidationEnabled: true }
    });
    expect(generateIni(latest)).toContain('extendedServerCertValidationEnabled=true');
    expect(generateIni({ ...latest, version: '2606' })).not.toContain('extendedServerCertValidationEnabled');
    expect(generateJson(latest)).toContain('"extendedServerCertValidationEnabled": true');
    expect(generateJson({ ...latest, version: '2606' })).not.toContain('extendedServerCertValidationEnabled');
  });

  it('emits Azure keys only for the Azure platform', () => {
    let c = applyPatch(radiusMfa(), { platform: 'azure', values: { az_subscriptionID: 'abc', az_resourceGroupName: 'rg', az_location: 'uksouth' } });
    let ini = generateIni(c);
    expect(ini).toContain('[Azure]');
    expect(ini).toContain('subscriptionID=abc');
    expect(ini).not.toContain('netInternet');
    c = applyPatch(c, { platform: 'vsphere', values: { netInternet: 'DMZ', ds: 'ds1', target: 'vi://x@vc/DC/host/C', source: 'C:\\a.ova' } });
    ini = generateIni(c);
    expect(ini).not.toContain('[Azure]');
    expect(ini).toContain('netInternet=DMZ');
    expect(ini).toContain('source=C:\\a.ova');
  });

  it('emits only the applicable network fields for every deployment option family', () => {
    const options = [
      ['onenic', 1], ['twonic', 2], ['threenic', 3],
      ['onenic-large', 1], ['twonic-large', 2], ['threenic-large', 3],
      ['onenic-XL', 1], ['twonic-XL', 2], ['threenic-XL', 3]
    ] as const;
    const values = {
      netInternet: 'DMZ-Internet',
      netManagementNetwork: 'DMZ-Management',
      netBackendNetwork: 'Internal-Backend',
      ip0: '192.0.2.21',
      netmask0: '255.255.255.0',
      ip1: '192.0.3.21',
      netmask1: '255.255.255.0',
      ip2: '192.0.4.21',
      netmask2: '255.255.255.0',
      defaultGateway: '192.0.2.1'
    };

    for (const [deploymentOption, nicCount] of options) {
      const ini = generateIni(applyPatch(defaultConfig(), { values: { ...values, deploymentOption } }));
      expect(ini).toContain('netInternet=DMZ-Internet');
      expect(ini).toContain('ip0=192.0.2.21');
      expect(ini).toContain('netmask0=255.255.255.0');
      expect(ini).toContain('defaultGateway=192.0.2.1');
      expect(ini.includes('netManagementNetwork=')).toBe(nicCount >= 2);
      expect(ini.includes('ip1=')).toBe(nicCount >= 2);
      expect(ini.includes('netmask1=')).toBe(nicCount >= 2);
      expect(ini.includes('netBackendNetwork=')).toBe(nicCount === 3);
      expect(ini.includes('ip2=')).toBe(nicCount === 3);
      expect(ini.includes('netmask2=')).toBe(nicCount === 3);
    }
  });

  it('writes numbered web reverse proxy sections', () => {
    const c = TEMPLATES.find((t) => t.id === 'wrp-intranet')!.build(defaultConfig());
    c.wrp.push({ ...c.wrp[0], instanceId: 'wiki', proxyDestinationUrl: 'https://wiki.corp.local' });
    const ini = generateIni(c);
    expect(ini).toContain('[WebReverseProxy1]');
    expect(ini).toContain('instanceId=intranet');
    expect(ini).toContain('[WebReverseProxy2]');
    expect(ini).toContain('instanceId=wiki');
  });

  it('writes numbered additional admin users without exporting runtime passwords', () => {
    const c = applyPatch(defaultConfig(), {
      adminUsers: [
        { name: 'MonitorUser1', enabled: true, adminMonitoringPasswordPreExpired: true, password: 'not-persisted' },
        { name: 'MonitorUser2', enabled: false }
      ]
    });
    const ini = generateIni(c, { secrets: 'include' });
    expect(ini).toContain('[AdminUser1]\nname=MonitorUser1\nenabled=true\nadminMonitoringPasswordPreExpired=true');
    expect(ini).toContain('[AdminUser2]\nname=MonitorUser2\nenabled=false\nadminMonitoringPasswordPreExpired=false');
    expect(ini).not.toContain('password');
    expect(generateJson(c, { secrets: 'include' })).not.toMatch(/AdminUser|MonitorUser|password/i);
    expect(JSON.stringify(stripSecrets(c))).not.toContain('not-persisted');
  });

  it('emits the audited 2609 Horizon controls and preserves origin detail objects', () => {
    const c = applyPatch(radiusMfa(), {
      values: {
        pcoipEnabled: true,
        pcoipDisableLegacyCertificate: true,
        origin: 'https://uag.example.com | true | false\nuag-internal.example.com | false | false',
        oidcConfigurationId: 'unused',
        radiusClassAttributeList: 'group1,group2',
        disclaimerText: 'Authorized users only',
        proxyDestinationPreLoginMessageEnabled: false,
        udpTunnelServerEnabled: false,
        queryBrokerInterval: 600,
        proxyBlastPemCert: 'C:\\certs\\blast.pem',
        proxyTunnelPemCert: 'C:\\certs\\tunnel.pem',
        endpointComplianceCheckProvider: 'OPSWAT',
        complianceCheckOnAuthentication: false,
        canonicalizationEnabled: false,
        redirectHostPortMappingList: 'vdi.example.com_uag-01.example.com:443',
        hostEntry1: '192.0.2.10 cs01.corp.local cs01'
      }
    });
    const ini = generateIni(c);
    for (const key of [
      'pcoipDisableLegacyCertificate=true',
      'radiusClassAttributeList=group1,group2',
      'disclaimerText=Authorized users only',
      'proxyDestinationPreLoginMessageEnabled=false',
      'udpTunnelServerEnabled=false',
      'queryBrokerInterval=600',
      'proxyBlastPemCert=C:\\certs\\blast.pem',
      'proxyTunnelPemCert=C:\\certs\\tunnel.pem',
      'endpointComplianceCheckProvider=OPSWAT',
      'complianceCheckOnAuthentication=false',
      'canonicalizationEnabled=false',
      'redirectHostPortMappingList=vdi.example.com_uag-01.example.com:443',
      'hostEntry1=192.0.2.10 cs01.corp.local cs01',
      'originHeaderDetailsList=1,2',
      '[OriginHeaderDetails1]\norigin=https://uag.example.com\nrewriteEnabled=true\nautoGenerated=false'
    ]) expect(ini).toContain(key);

    const edge = (generateJsonObject(c) as any).edgeServiceSettingsList.edgeServiceSettingsList[0];
    expect(edge.originHeaderDetailsList).toEqual([
      { origin: 'https://uag.example.com', rewriteEnabled: true, autoGenerated: false },
      { origin: 'uag-internal.example.com', rewriteEnabled: false, autoGenerated: false }
    ]);
    expect(edge).not.toHaveProperty('proxyBlastPemCert');
    expect(edge).not.toHaveProperty('proxyTunnelPemCert');
  });

  it('gates every newly audited Horizon field and maps JSON aliases', () => {
    const c = applyPatch(radiusMfa(), {
      version: '2506',
      values: {
        pcoipEnabled: true,
        pcoipDisableLegacyCertificate: true,
        radiusClassAttributeList: 'g1',
        queryBrokerInterval: 600,
        proxyDestinationPreLoginMessageEnabled: false
      }
    });
    const ini = generateIni(c);
    expect(ini).toContain('pcoipDisableLegacyCertificate=true');
    expect(ini).toContain('radiusClassAttributeList=g1');
    expect(ini).not.toContain('queryBrokerInterval');
    expect(ini).not.toContain('proxyDestinationPreLoginMessageEnabled');
    const legacyConfig = applyPatch(c, {
      version: '2412',
      values: { origin: 'https://uag.example.com | true | false' }
    });
    const legacy = generateIni(legacyConfig);
    expect(legacy).not.toContain('OriginHeaderDetails');
    expect(legacy).not.toContain('originHeaderDetailsList');
    expect(JSON.stringify(generateJsonObject(legacyConfig))).not.toContain('originHeaderDetailsList');
  });

  it('keeps RADIUS Horizon settings for certificate-or-RADIUS authentication', () => {
    const c = applyPatch(radiusMfa(), {
      values: {
        authMethods: 'certificate-auth-and-radius-auth',
        radiusClassAttributeList: 'staff,admins',
        radiusUsernameLabel: 'Login',
        radiusPasscodeLabel: 'MFA token'
      }
    });
    const ini = generateIni(c);
    expect(ini).toContain('radiusClassAttributeList=staff,admins');
    expect(ini).toContain('radiusUsernameLabel=Login');
    expect(ini).toContain('radiusPasscodeLabel=MFA token');
  });

  it('enables SNMP in General and writes [SnmpSettings]', () => {
    const c = applyPatch(radiusMfa(), { values: { snmp_enabled: true, snmp_version: 'V1+V2c', snmp_communityName: 'comm' } });
    const ini = generateIni(c, { secrets: 'include' });
    expect(ini).toContain('snmpEnabled=true');
    expect(ini).toContain('[SnmpSettings]');
    expect(ini).toContain('communityName=comm');
  });

  it('emits static routes, addressing modes, IPv6, custom NIC config and exact admin policy keys', () => {
    const c = applyPatch(defaultConfig(), {
      version: '2609',
      values: {
        deploymentOption: 'threenic',
        routes0: '10.108.172.32/32 10.108.172.253,192.168.20.0/24 192.168.10.1',
        routes1: '172.16.0.0/16 10.1.0.1',
        routes2: '10.2.0.0/16 10.3.0.1',
        ipmode0: 'STATICV4+STATICV6',
        ipmode1: 'DHCPV4',
        ipmode2: 'AUTOV6',
        v6ip0: '2402:740:2:209::5',
        v6ipprefix0: 64,
        v6DefaultGateway: '2402:740:2:209::253',
        eth0CustomConfig: 'DHCP^UseDNS=false;Network^Domains=~.',
        eth1CustomConfig: 'DHCP^UseDomains=false',
        eth2CustomConfig: 'Network^DNS=192.168.1.153#dns.example.com',
        adminPasswordPolicyMinLen: 12,
        adminPasswordPolicyFailedLockoutCount: 4,
        adminPasswordPolicyUnlockTime: 7,
        adminPasswordExpirationDays: 60
      }
    });
    const ini = generateIni(c);
    expect(ini).toContain('routes0=10.108.172.32/32 10.108.172.253,192.168.20.0/24 192.168.10.1');
    expect(ini).toContain('routes1=172.16.0.0/16 10.1.0.1');
    expect(ini).toContain('routes2=10.2.0.0/16 10.3.0.1');
    expect(ini).toContain('ipmode0=STATICV4+STATICV6');
    expect(ini).toContain('ipmode1=DHCPV4');
    expect(ini).toContain('ipmode2=AUTOV6');
    expect(ini).toContain('v6ip0=2402:740:2:209::5');
    expect(ini).toContain('v6ipprefix0=64');
    expect(ini).toContain('eth2CustomConfig=Network^DNS=192.168.1.153#dns.example.com');
    expect(ini).toContain('adminpasswordPolicyMinLen=12');
    expect(ini).toContain('adminpasswordPolicyFailedLockoutCount=4');
    expect(ini).toContain('adminpasswordPolicyUnlockTime=7');
    expect(ini).toContain('adminpasswordExpirationDays=60');
    expect(ini).not.toContain('adminPasswordPolicy');
  });

  it('serializes Blast host header rows as comma-separated INI and JSON arrays', () => {
    const c = applyPatch(radiusMfa(), {
      values: { blastAllowedHostHeaderValues: 'uag.example.com:8443,_empty_,192.0.2.21' }
    });
    expect(generateIni(c)).toContain('blastAllowedHostHeaderValues=uag.example.com:8443,_empty_,192.0.2.21');
    const edge = (generateJsonObject(c) as any).edgeServiceSettingsList.edgeServiceSettingsList[0];
    expect(edge.blastAllowedHostHeaderValues).toEqual(['uag.example.com:8443', '_empty_', '192.0.2.21']);
  });

  it('omits addressing modes and static IPv4 values for inactive NICs or DHCP', () => {
    const oneNic = applyPatch(defaultConfig(), {
    values: {
      deploymentOption: 'onenic',
      ipmode0: 'DHCPV4',
      ip0: '192.0.2.21',
      netmask0: '255.255.255.0',
      ipmode1: 'STATICV4',
      ip1: '192.0.3.21',
      netmask1: '255.255.255.0'
    }
    });
    const ini = generateIni(oneNic);
    expect(ini).toContain('ipmode0=DHCPV4');
    expect(ini).not.toContain('ip0=');
    expect(ini).not.toContain('netmask0=');
    expect(ini).not.toContain('ipmode1=');
    expect(ini).not.toContain('ip1=');
    expect(ini).not.toContain('netmask1=');
  });

  it('shows route keys only for NICs in the selected topology', () => {
    const c = applyPatch(defaultConfig(), {
      values: {
        deploymentOption: 'onenic',
        routes0: '10.0.0.0/8 192.0.2.1',
        routes1: '10.1.0.0/16 192.0.2.1',
        routes2: '10.2.0.0/16 192.0.2.1'
      }
    });
    const one = generateIni(c);
    expect(one).toContain('routes0=');
    expect(one).not.toContain('routes1=');
    expect(one).not.toContain('routes2=');
    const two = generateIni(applyPatch(c, { values: { deploymentOption: 'twonic-large' } }));
    expect(two).toContain('routes1=');
    expect(two).not.toContain('routes2=');
    const three = generateIni(applyPatch(c, { values: { deploymentOption: 'threenic-XL' } }));
    expect(three).toContain('routes1=');
    expect(three).toContain('routes2=');
  });

  it('writes the documented Workspace ONE Tunnel [Airwatch] keys', () => {
    const c = applyPatch(tunnel(), {
      values: {
        airwatch_apiServerPassword: 'uem-secret',
        airwatch_outboundProxyHost: 'proxy.corp.local',
        airwatch_outboundProxyPort: 3128,
        airwatch_outboundProxyUsername: 'proxy-user',
        airwatch_outboundProxyPassword: 'proxy-secret',
        airwatch_ntlmAuthentication: true,
        airwatch_hostEntry1: '10.0.0.20 api.corp.local api-alias',
        airwatch_trustedCert1: 'C:\\certs\\uem-ca.pem',
        airwatch_trustedCert9: 'C:\\certs\\uem-issuer.pem',
        airwatch_pacFilePath: 'C:\\pac\\tunnel.pac'
      }
    });
    const ini = generateIni(c, { secrets: 'include' });
    expect(ini).toMatch(/\[Airwatch\][\s\S]*tunnelGatewayEnabled=true/);
    expect(ini).toContain('apiServerUrl=https://as1234.awmdm.com');
    expect(ini).toContain('apiServerUsername=domain\\svc-uag-tunnel');
    expect(ini).toContain('apiServerPassword=uem-secret');
    expect(ini).toContain('organizationGroupCode=CORP');
    expect(ini).toContain('tunnelConfigurationId=tunnel-production');
    expect(ini).toContain('airwatchServerHostname=tunnel.example.com');
    expect(ini).toContain('outboundProxyHost=proxy.corp.local');
    expect(ini).toContain('outboundProxyPort=3128');
    expect(ini).toContain('outboundProxyPassword=proxy-secret');
    expect(ini).toContain('ntlmAuthentication=true');
    expect(ini).toContain('pacFilePath=C:\\pac\\tunnel.pac');
    expect(ini).toContain('hostEntry1=10.0.0.20 api.corp.local api-alias');
    expect(ini).toContain('trustedCert1=C:\\certs\\uem-ca.pem\ntrustedCert2=C:\\certs\\uem-issuer.pem');
    expect(ini).not.toContain('trustedCert3=C:');
  });

  it('emits Tunnel on every supported deployment platform and omits it when disabled', () => {
    const c = tunnel();
    expect(generateIni(applyPatch(c, { values: { airwatch_enabled: false } }))).not.toContain('[Airwatch]');
    for (const platform of ['vsphere', 'hyperv', 'azure', 'nutanix', 'openshift'] as const) {
      expect(generateIni(applyPatch(c, { platform }))).toContain('[Airwatch]');
    }
  });

  it('writes standalone Content Gateway fields, host entries and trusted certificates', () => {
    const c = applyPatch(contentGateway(), {
      values: {
        contentGateway_hostEntry1: '10.0.0.30 content-api.corp.local',
        contentGateway_trustedCert1: 'C:\\certs\\content-ca.pem',
        contentGateway_trustedCert2: 'C:\\certs\\uem-ca.pem',
        contentGateway_outboundProxyHost: 'proxy.corp.local',
        contentGateway_outboundProxyPort: 3128,
        contentGateway_outboundProxyUsername: 'proxy-user'
      }
    });
    const ini = generateIni(c, { secrets: 'include' });
    expect(ini).toMatch(/\[AirwatchContentGateway\][\s\S]*apiServerUsername=domain\\svc-uag-content/);
    expect(ini).toContain('cgConfigId=content-gateway-production');
    expect(ini).toContain('hostEntry1=10.0.0.30 content-api.corp.local');
    expect(ini).toContain('trustedCert1=C:\\certs\\content-ca.pem');
    expect(ini).toContain('trustedCert2=C:\\certs\\uem-ca.pem');
    expect(ini).not.toContain('apiServerPassword=');
    expect(ini).not.toContain('outboundProxyPassword=');
  });

  it('adds Content Gateway to a shared [Airwatch] section without a standalone block', () => {
    const c = applyPatch(tunnel(), {
      values: {
        contentGateway_enabled: true,
        contentGateway_mode: 'shared',
        contentGateway_cgConfigId: 'cg-shared',
        airwatch_tunnelGatewayEnabled: false
      }
    });
    const ini = generateIni(c);
    expect(ini).toMatch(/\[Airwatch\][\s\S]*contentGatewayEnabled=true/);
    expect(ini).toContain('cgConfigId=cg-shared');
    expect(ini).not.toContain('[AirwatchContentGateway]');
  });

  it('maps Content Gateway settings JSON and keeps runtime credentials and certificate paths out', () => {
    const c = applyPatch(contentGateway(), {
      values: {
        contentGateway_hostEntry1: '10.0.0.30 content-api.corp.local',
        contentGateway_trustedCert1: 'C:\\certs\\content-ca.pem'
      }
    });
    const edge = (generateJsonObject(c) as any).edgeServiceSettingsList.edgeServiceSettingsList[0];
    expect(edge).toMatchObject({
      identifier: 'CONTENT_GATEWAY',
      airwatchComponentsInstalled: 'CG',
      apiServerUrl: 'https://as1234.awmdm.com',
      cgConfigurationId: 'content-gateway-production',
      hostEntries: ['10.0.0.30 content-api.corp.local']
    });
    expect(edge).not.toHaveProperty('apiServerPassword');
    expect(edge).not.toHaveProperty('trustedCertificates');
    expect(JSON.stringify(edge)).not.toContain('C:\\\\certs');
  });

  it('writes Nutanix and OpenShift platform sections from official deployment keys', () => {
    const nutanix = applyPatch(tunnel(), {
      platform: 'nutanix',
      values: {
        ntnx_prismCentralUserName: 'api-user',
        ntnx_prismCentralAddress: 'prism.corp.local',
        ntnx_cluster: 'cluster1',
        ntnx_image: 'uag-2609',
        ntnx_subnet0: 'dmz',
        ntnx_subnet1: 'management'
      }
    });
    const nutanixIni = generateIni(nutanix);
    expect(nutanixIni).toContain('[Nutanix]\nprismCentralUserName=api-user');
    expect(nutanixIni).toContain('image=uag-2609');
    expect(nutanixIni).toContain('subnet1=management');

    const openshift = applyPatch(tunnel(), {
      platform: 'openshift',
      values: {
        ocp_openShiftUserName: 'admin',
        ocp_openShiftEndpoint: 'https://cluster.example.com:6443',
        ocp_namespace: 'uag-namespace',
        ocp_instanceType: 'uag-large',
        ocp_storageClass: 'ocs-storagecluster-ceph-rbd',
        ocp_diskSizeGi: 20,
        ocp_volume: 'uag-boot-volume',
        ocp_nadName0: 'uag-external',
        ocp_nadName1: 'uag-management'
      }
    });
    const openshiftIni = generateIni(openshift);
    expect(openshiftIni).toContain('[OpenShift]\nopenShiftUserName=admin');
    expect(openshiftIni).toContain('openShiftEndpoint=https://cluster.example.com:6443');
    expect(openshiftIni).toContain('nadName1=uag-management');
  });

  it('gates Tunnel keys by documented historical samples', () => {
    const c = applyPatch(tunnel(), {
      values: {
        airwatch_disableAutoConfigUpdate: true,
        airwatch_tunnelConfigurationId: 'cfg-1',
        airwatch_airwatchOutboundProxy: true,
        airwatch_tunnelProxyEnabled: true
      }
    });
    expect(generateIni(applyPatch(c, { version: '2212' }))).toContain('airwatchOutboundProxy=true');
    expect(generateIni(applyPatch(c, { version: '2212' }))).not.toContain('tunnelConfigurationId');
    expect(generateIni(applyPatch(c, { version: '2303' }))).toContain('disableAutoConfigUpdate=true');
    expect(generateIni(applyPatch(c, { version: '2303' }))).not.toContain('tunnelConfigurationId');
    expect(generateIni(applyPatch(c, { version: '2306' }))).toContain('tunnelConfigurationId=cfg-1');
    expect(generateIni(applyPatch(c, { version: '2306' }))).not.toContain('tunnelProxyEnabled');
  });

  it('redacts both Workspace ONE UEM and outbound proxy credentials', () => {
    const c = applyPatch(tunnel(), { values: { airwatch_apiServerPassword: 'uem-secret', airwatch_outboundProxyPassword: 'proxy-secret' } });
    const ini = generateIni(c);
    expect(ini).not.toMatch(/uem-secret|proxy-secret/);
    expect(ini).toContain('apiServerPassword=<REDACTED>');
    expect(ini).toContain('outboundProxyPassword=<REDACTED>');
  });

  it('writes numbered SSH public-key file references for INI deployment', () => {
    const c = applyPatch(defaultConfig(), {
      values: { sshEnabled: true, sshKeyAccessEnabled: true, sshPublicKeys: `${SSH_PUBLIC_KEY}\nC:\\keys\\second.pub` }
    });
    const ini = generateIni(c);
    expect(ini).toContain('sshPublicKey1=ssh-public-key-1.pub');
    expect(ini).toContain('sshPublicKey2=C:\\keys\\second.pub');
    expect(ini).not.toContain(SSH_PUBLIC_KEY);
  });

  it('does not export SSH key material after key access is disabled', () => {
    const c = applyPatch(defaultConfig(), {
      values: { sshEnabled: true, sshKeyAccessEnabled: false, sshPublicKeys: SSH_PUBLIC_KEY }
    });
    expect(generateIni(c)).not.toContain('sshPublicKey');
    expect(generateJson(c)).not.toContain('sshPublicKeys');
    expect(generatePowerShell(c)).not.toContain(SSH_PUBLIC_KEY);
  });

  it('serializes DNS and NTP rows to space-separated INI values', () => {
    const c = applyPatch(defaultConfig(), {
      values: {
        dns: '10.0.0.1   10.0.0.2',
        dnsSearch: 'corp.local\nexample.local',
        ntpServers: 'ntp1.corp.local\nntp2.corp.local',
        fallBackNtpServers: ' pool.ntp.org '
      }
    });
    const ini = generateIni(c);
    expect(ini).toContain('dns=10.0.0.1 10.0.0.2');
    expect(ini).toContain('dnsSearch=corp.local example.local');
    expect(ini).toContain('ntpServers=ntp1.corp.local ntp2.corp.local');
    expect(ini).toContain('fallBackNtpServers=pool.ntp.org');
  });
});

describe('JSON generation', () => {
  it('builds the settings document structure', () => {
    const o = generateJsonObject(radiusMfa()) as any;
    expect(o.systemSettings.uagName).toBe('uag-dmz-01');
    expect(o.systemSettings.tls12Enabled).toBe(true);
    const edge = o.edgeServiceSettingsList.edgeServiceSettingsList;
    expect(edge[0]).toMatchObject({ identifier: 'VIEW', enabled: true, proxyDestinationUrl: 'https://cs01.corp.local', authMethods: 'radius-auth', blastEnabled: true });
    expect(o.authMethodSettingsList.authMethodSettingsList[0]).toMatchObject({ name: 'radius-auth', hostName: 'radius01.corp.local', authPort: 1812 });
    expect(o.syslogSettings.syslogServerSettingsList[0].sysLogType).toBe('TLS');
  });

  it('keeps deploy-time keys out of the settings JSON', () => {
    const c = applyPatch(radiusMfa(), { values: { ip0: '10.0.0.5', netInternet: 'DMZ', source: 'x.ova', name: 'vm1' } });
    const sys = (generateJsonObject(c) as any).systemSettings;
    for (const k of ['ip0', 'routes0', 'v6ip0', 'netInternet', 'source', 'name', 'deploymentoption', 'dns']) expect(sys).not.toHaveProperty(k);
  });

  it('serialises list-like settings as arrays', () => {
    const c = applyPatch(radiusMfa(), { values: { cipherSuites: 'TLS_AES_128_GCM_SHA256, TLS_AES_256_GCM_SHA384' } });
    expect((generateJsonObject(c) as any).systemSettings.cipherSuites).toEqual(['TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384']);
  });

  it('keeps the INI-only Airwatch mapping out of settings JSON', () => {
    const json = generateJson(tunnel(), { secrets: 'include' });
    expect(json).not.toMatch(/Airwatch|apiServerUrl|airwatchServerHostname|tunnelConfigurationId/);
  });

  it('serialises pasted SSH public keys as the UAG name/data array', () => {
    const c = applyPatch(defaultConfig(), {
      values: { sshEnabled: true, sshKeyAccessEnabled: true, sshPublicKeys: SSH_PUBLIC_KEY }
    });
    expect((generateJsonObject(c) as any).systemSettings.sshPublicKeys).toEqual([
      { name: 'ssh-public-key-1.pub', data: SSH_PUBLIC_KEY }
    ]);
  });
});

describe('run-time options', () => {
  it('adds -noSSLVerify / -disableVerification to both deployment modes, not the INI or JSON', () => {
    const c = applyPatch(radiusMfa(), { values: { run_noSSLVerify: true, run_disableVerification: true } });
    const interactive = generatePowerShell(c, 'placeholder', 'interactive');
    const headless = generatePowerShell(c, 'placeholder', 'headless');
    expect(interactive).toContain('.\\uagdeploy.ps1 -iniFile .\\uag-dmz-01.ini -noSSLVerify -disableVerification');
    expect(headless).toContain('-adminPwd $env:UAG_ADMIN_PASSWORD -noSSLVerify -disableVerification');
    expect(generateIni(c)).not.toMatch(/noSSLVerify|disableVerification|Runtime/);
    expect(JSON.stringify(generateJsonObject(c))).not.toMatch(/SSLVerify|disableVerification/);
  });
  it('-disableVerification is vSphere only', () => {
    const v = { run_noSSLVerify: true, run_disableVerification: true };
    const hv = generatePowerShell(applyPatch(radiusMfa(), { platform: 'hyperv', values: v }), 'placeholder', 'interactive');
    expect(hv).toContain('-noSSLVerify');
    expect(hv).not.toContain('-disableVerification');
    const az = generatePowerShell(applyPatch(radiusMfa(), { platform: 'azure', values: v }), 'placeholder', 'headless');
    expect(az).toContain('.\\uagdeployaz.ps1 -iniFile .\\uag-dmz-01.ini $env:UAG_ROOT_PASSWORD $env:UAG_ADMIN_PASSWORD no -noSSLVerify');
    expect(az).not.toContain('-disableVerification');
  });
  it('removes runtime controls from the form schema while retaining false defaults', () => {
    expect(GROUPS.some((group) => group.id === 'runtime')).toBe(false);
    expect(defaultConfig().values).toMatchObject({ run_noSSLVerify: false, run_disableVerification: false });
  });
  it('removes any legacy root or admin password keys before draft persistence', () => {
    const c = applyPatch(defaultConfig(), {
      values: {
        rootPwd: 'root-secret',
        adminPwd: 'admin-secret',
        UAG_ROOT_PASSWORD: 'environment-copy',
        UAG_ADMIN_PASSWORD: 'environment-copy'
      }
    });
    const draft = JSON.stringify(stripSecrets(c));
    expect(draft).not.toMatch(/root-secret|admin-secret|environment-copy|UAG_ROOT_PASSWORD|UAG_ADMIN_PASSWORD/);
  });

  it('materialises pasted SSH keys as companion files for deployment', () => {
    const c = applyPatch(defaultConfig(), {
      values: { sshEnabled: true, sshKeyAccessEnabled: true, sshPublicKeys: SSH_PUBLIC_KEY }
    });
    const ps = generatePowerShell(c);
    expect(ps).toContain(`Set-Content -Path .\\ssh-public-key-1.pub -Value $sshKey`);
    expect(ps).toContain(SSH_PUBLIC_KEY);
  });
  it('is off by default and linted when enabled', () => {
    expect(generatePowerShell(radiusMfa())).not.toContain('-noSSLVerify');
    const c = applyPatch(radiusMfa(), { values: { run_noSSLVerify: true, run_disableVerification: true } });
    const m = validateConfig(c).map((i) => i.message).join('\n');
    expect(m).toMatch(/-noSSLVerify is on/);
    expect(m).toMatch(/-disableVerification is on/);
    expect(validateConfig(applyPatch(c, { platform: 'hyperv' })).map((i) => i.message).join('\n')).not.toMatch(/-disableVerification is on/);
  });
});

describe('PowerShell output', () => {
  it('uses the admin-user password payload in headless mode across supported scripts', () => {
    const config = applyPatch(radiusMfa(), { adminUsers: [{ name: 'MonitorUser1' }] });
    for (const platform of ['vsphere', 'hyperv', 'azure', 'openshift'] as const) {
      const ps = generatePowerShell(applyPatch(config, { platform }), 'omit', 'headless');
      expect(ps).toContain(`throw 'Set UAG_NEW_ADMIN_USER_PASSWORDS before running deployment.'`);
      expect(ps).toContain('-newAdminUserPwd $env:UAG_NEW_ADMIN_USER_PASSWORDS');
      expect(ps).not.toContain('password=');
    }
  });

  it('passes the runtime admin-user password payload to every interactive script', () => {
    const config = applyPatch(radiusMfa(), { adminUsers: [{ name: 'MonitorUser1' }] });
    for (const platform of ['vsphere', 'hyperv', 'azure', 'nutanix', 'openshift'] as const) {
      const ps = generatePowerShell(applyPatch(config, { platform }), 'placeholder', 'interactive');
      expect(ps).toContain(`throw 'Set UAG_NEW_ADMIN_USER_PASSWORDS before running deployment.'`);
      expect(ps).toContain('username:password format, separated by semicolons');
      expect(ps).toContain('-newAdminUserPwd $env:UAG_NEW_ADMIN_USER_PASSWORDS');
    }
  });

  it('uses the exact Content Gateway UEM password parameter in headless mode', () => {
    const standalone = generatePowerShell(contentGateway(), 'placeholder', 'headless');
    expect(standalone).toContain('UAG_CONTENT_GATEWAY_API_PASSWORD');
    expect(standalone).toContain('-awCGAPIServerPwd $env:UAG_CONTENT_GATEWAY_API_PASSWORD');
    expect(standalone).not.toContain('-awAPIServerPwd $env:UAG_CONTENT_GATEWAY_API_PASSWORD');

    const shared = generatePowerShell(applyPatch(tunnel(), {
      values: { contentGateway_enabled: true, contentGateway_mode: 'shared' }
    }), 'placeholder', 'headless');
    expect(shared).toContain('-awAPIServerPwd $env:UAG_CONTENT_GATEWAY_API_PASSWORD');
    expect(shared).not.toContain('-awCGAPIServerPwd $env:UAG_CONTENT_GATEWAY_API_PASSWORD');
  });

  it('lets the vendor prompt for the Content Gateway API password interactively', () => {
    const ps = generatePowerShell(contentGateway(), 'placeholder', 'interactive');
    expect(ps).toContain('prompts for the Content Gateway Workspace ONE UEM API password');
    expect(ps).not.toContain('-awCGAPIServerPwd');
    expect(ps).not.toContain('UAG_CONTENT_GATEWAY_API_PASSWORD');
  });

  it('delegates Interactive root and admin password prompts to the official script', () => {
    const c = radiusMfa();
    c.values.radius_sharedSecret = 's3cret';
    const ps = generatePowerShell(c);
    expect(ps).not.toContain('s3cret');
    expect(ps).toContain('$ini = @\'');
    expect(ps).not.toContain('Read-Host');
    expect(ps).not.toContain('ConvertTo-PlainTextAtInvocation');
    expect(ps).toContain('.\\uagdeploy.ps1 -iniFile .\\uag-dmz-01.ini\n');
    expect(ps).not.toMatch(/ -rootPwd| -adminPwd/);
    expect(ps).not.toMatch(/\\$plain|UAG_ROOT_PASSWORD|UAG_ADMIN_PASSWORD/);
    expect(ps).toContain('<REDACTED>');
    expect(ps.match(/^\s*\.\\uagdeploy(?:hv|az)?\.ps1 /gm)).toHaveLength(1);
  });
  it('omits password parameters for native Interactive prompting on every platform', () => {
    const hyperv = generatePowerShell(applyPatch(radiusMfa(), { platform: 'hyperv' }));
    expect(hyperv).toContain('.\\uagdeployhv.ps1 -iniFile .\\uag-dmz-01.ini\n');

    const azure = generatePowerShell(applyPatch(radiusMfa(), { platform: 'azure' }));
    expect(azure).toContain('.\\uagdeployaz.ps1 -iniFile .\\uag-dmz-01.ini\n');
    expect(azure).not.toContain('.\\uagdeployaz.ps1 -iniFile .\\uag-dmz-01.ini -rootPwd');

    const nutanix = generatePowerShell(applyPatch(radiusMfa(), { platform: 'nutanix' }));
    expect(nutanix).toContain('.\\uagdeployntnx.ps1 -iniFile .\\uag-dmz-01.ini\n');
    expect(nutanix).toContain('The official script prompts for the Prism Central password.');

    const openshift = generatePowerShell(TEMPLATES.find((t) => t.id === 'openshift-virtualization')!.build(defaultConfig()));
    expect(openshift).toContain('.\\uagdeployopenshift.ps1 -iniFile .\\uag-openshift-01.ini\n');
  });
  it('generates a headless command that reads and validates runtime environment passwords', () => {
    const c = radiusMfa();
    c.values.rootPassword = 'embedded-root-secret';
    c.values.adminPassword = 'embedded-admin-secret';
    const ps = generatePowerShell(c, 'placeholder', 'headless');
    expect(ps).toContain(`throw 'Set UAG_ROOT_PASSWORD before running headless deployment.'`);
    expect(ps).toContain(`throw 'Set UAG_ADMIN_PASSWORD before running headless deployment.'`);
    expect(ps).toContain('.\\uagdeploy.ps1 -iniFile .\\uag-dmz-01.ini -rootPwd $env:UAG_ROOT_PASSWORD -adminPwd $env:UAG_ADMIN_PASSWORD');
    expect(ps).not.toContain('Read-Host');
    expect(ps).not.toContain('embedded-root-secret');
    expect(ps).not.toContain('embedded-admin-secret');
    expect(ps.match(/^\s*\.\\uagdeploy(?:hv|az)?\.ps1 /gm)).toHaveLength(1);
  });
  it('keeps Headless environment-variable behavior unchanged on each supported platform', () => {
    const c = radiusMfa();
    expect(generatePowerShell(c, 'placeholder', 'headless')).toContain('.\\uagdeploy.ps1 -iniFile .\\uag-dmz-01.ini -rootPwd $env:UAG_ROOT_PASSWORD -adminPwd $env:UAG_ADMIN_PASSWORD');
    expect(generatePowerShell(applyPatch(c, { platform: 'hyperv' }), 'placeholder', 'headless')).toContain('.\\uagdeployhv.ps1 -iniFile .\\uag-dmz-01.ini -rootPwd $env:UAG_ROOT_PASSWORD -adminPwd $env:UAG_ADMIN_PASSWORD');
    expect(generatePowerShell(applyPatch(c, { platform: 'azure' }), 'placeholder', 'headless')).toContain('.\\uagdeployaz.ps1 -iniFile .\\uag-dmz-01.ini $env:UAG_ROOT_PASSWORD $env:UAG_ADMIN_PASSWORD no');
    const openshift = generatePowerShell(applyPatch(c, { platform: 'openshift' }), 'omit', 'headless');
    expect(openshift).toContain('.\\uagdeployopenshift.ps1 -iniFile .\\uag-dmz-01.ini -rootPwd $env:UAG_ROOT_PASSWORD -adminPwd $env:UAG_ADMIN_PASSWORD no -openshiftPassword $env:OPENSHIFT_PASSWORD');
    expect(openshift).not.toContain('Read-Host');
  });
  it('explains omitted password prompting and never embeds runtime passwords', () => {
    const c = radiusMfa();
    c.values.rootPassword = 'embedded-root-secret';
    c.values.adminPassword = 'embedded-admin-secret';
    for (const mode of ['interactive', 'headless'] as const) {
      const ps = generatePowerShell(c, 'include', mode);
      expect(ps).toContain('When root and Admin UI password parameters are omitted, uagdeploy and its platform variants prompt for them interactively.');
      expect(ps).not.toContain('embedded-root-secret');
      expect(ps).not.toContain('embedded-admin-secret');
    }
    expect(generateDocs(c, [])).toContain('When root and Admin UI password parameters are omitted, uagdeploy and its platform variants prompt for them interactively.');
  });
  it('updates rendered PowerShell immediately for deployment mode and switches', () => {
    const c = radiusMfa();
    expect(render(c, 'ps', 'placeholder', 'interactive').text).not.toContain('UAG_ROOT_PASSWORD');
    c.values.run_noSSLVerify = true;
    expect(render(c, 'ps', 'placeholder', 'interactive').text).toContain(' -noSSLVerify');
    expect(render(c, 'ps', 'placeholder', 'headless').text).toContain('UAG_ROOT_PASSWORD');
  });
  it('includes redeployment recovery and compliance guidance in the runbook', () => {
    const docs = generateDocs(applyPatch(radiusMfa(), { adminUsers: [{ name: 'MonitorUser1' }] }), []);
    expect(docs).toContain('UAG_NEW_ADMIN_USER_PASSWORDS');
    expect(docs).toContain('MonitorUser1');
    expect(docs).toContain('Recovery baseline');
    expect(docs).toContain('test clean redeployment');
    expect(docs).not.toContain('Admin UI and API are unavailable');
    expect(docs).toContain('compliance requirements');
    expect(docs).toContain('https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/RunPowerShellscripttodeploy');
  });
  it('uses the Hyper-V and Azure scripts', () => {
    expect(generatePowerShell(applyPatch(radiusMfa(), { platform: 'hyperv' }))).toContain('uagdeployhv.ps1 -iniFile');
    const az = generatePowerShell(applyPatch(radiusMfa(), { platform: 'azure' }), 'placeholder', 'headless');
    expect(az).toContain('uagdeployaz.ps1 -iniFile .\\uag-dmz-01.ini $env:UAG_ROOT_PASSWORD $env:UAG_ADMIN_PASSWORD no');
  });
  it('uses the Nutanix script without vSphere/Azure-only fields', () => {
    const c = TEMPLATES.find((t) => t.id === 'nutanix-ahv')!.build(defaultConfig());
    const ini = generateIni(c);
    expect(ini).toContain('[Nutanix]');
    expect(ini).toContain('prismCentralAddress=prism.corp.local');
    expect(ini).toContain('image=euc-unified-access-gateway-26.09.0.0-system.qcow2');
    expect(ini).toContain('subnet0=uag-external');
    expect(ini).toContain('subnet1=uag-management');
    expect(ini).not.toMatch(/\[Azure\]|^(?:source|target|netInternet|netManagementNetwork|ds)=/m);
    expect(generatePowerShell(c)).toContain('.\\uagdeployntnx.ps1 -iniFile .\\uag-nutanix-01.ini\n');
    expect(generatePowerShell(c)).toContain('deletes and recreates a VM with the same name');
  });
  it('emits the OpenShift manifest, preparation commands and platform INI only', () => {
    const c = TEMPLATES.find((t) => t.id === 'openshift-virtualization')!.build(defaultConfig());
    c.values.ocp_bearerToken = 'sha256~secret';
    const ini = generateIni(c);
    const yaml = generateBootableVolumeManifest(c);
    const ps = generatePowerShell(c);
    expect(ini).toContain('[OpenShift]');
    expect(ini).toContain('nadName0=uag-external-network');
    expect(ini).toContain('nadName1=uag-management-network');
    expect(ini).not.toContain('qcow2Url=');
    expect(ini).not.toMatch(/\[Azure\]|\[Nutanix\]|source=|target=|netInternet=/);
    expect(ini).toContain('bearerToken=<REDACTED>');
    expect(ini).not.toContain('sha256~secret');
    expect(yaml).toContain('kind: DataVolume');
    expect(yaml).toContain('kind: DataSource');
    expect(yaml).toContain('apiVersion: cdi.kubevirt.io/v1beta1');
    expect(yaml).toContain('storage: "20Gi"');
    expect(yaml).toContain('url: "https://images.corp.local/uag-2609.qcow2"');
    expect(yaml).toContain('accessModes:\n      - ReadWriteMany');
    expect(yaml).not.toContain('sha256~secret');
    expect(manifestFileName(c)).toBe('uag-bootable-volume.yaml');
    expect(ps).toContain('oc apply -f .\\uag-bootable-volume.yaml');
    expect(ps).toContain('.\\uagdeployopenshift.ps1 -iniFile .\\uag-openshift-01.ini\n');
    expect(ps).not.toContain('-openshiftPassword');
    expect(ps).toContain('Clear-History');
    expect(generatePowerShell(c, 'omit')).not.toContain('-openshiftPassword');
    expect(generatePowerShell(c, 'omit', 'headless')).toContain('-openshiftPassword $env:OPENSHIFT_PASSWORD');
  });
  it('uses explicit runbook mode for an OpenShift console upload', () => {
    const c = applyPatch(TEMPLATES.find((t) => t.id === 'openshift-virtualization')!.build(defaultConfig()), {
      values: { ocp_volumeSourceMode: 'console', ocp_qcow2Url: '' }
    });
    const prep = generateBootableVolumeManifest(c);
    expect(prep).toContain('OpenShift bootable-volume preparation runbook');
    expect(prep).toContain('emits no Kubernetes manifest');
    expect(prep).not.toContain('kind: DataVolume');
    expect(manifestFileName(c)).toMatch(/\.md$/);
    expect(generatePowerShell(c)).toContain('runbook mode');
    expect(generatePowerShell(c)).not.toContain('oc apply -f');
    expect(generatePowerShell(applyPatch(c, { values: { run_noSSLVerify: true } }))).not.toContain('-noSSLVerify');
  });
  it('does not leak a previously selected platform into new-platform output', () => {
    const nutanix = applyPatch(TEMPLATES.find((t) => t.id === 'nutanix-ahv')!.build(defaultConfig()), {
      values: {
        source: 'C:\\old.ova',
        target: 'vi://old',
        ds: 'old-datastore',
        netInternet: 'old-internet',
        az_subscriptionID: 'old-subscription'
      }
    });
    expect(generateIni(nutanix)).not.toMatch(/^(?:source|target|ds|netInternet|subscriptionID)=/m);
    const openshift = applyPatch(TEMPLATES.find((t) => t.id === 'openshift-virtualization')!.build(defaultConfig()), {
      values: {
        ntnx_cluster: 'old-cluster',
        az_location: 'old-location',
        ipMode0: 'DHCPV4',
        ip0: '192.0.2.99',
        netmask0: '255.255.255.0',
        defaultGateway: '192.0.2.1'
      }
    });
    const ini = generateIni(openshift);
    expect(ini).not.toMatch(/cluster=|location=|ip0=|netmask0=|defaultGateway=/);
    const undecided = applyPatch(openshift, { values: { ipMode0: '', ipMode1: '' } });
    expect(generateIni(undecided)).not.toMatch(/^(?:ip0|netmask0|ip1|netmask1|defaultGateway)=/m);
    expect(generateDocs(undecided, validateConfig(undecided))).not.toMatch(/\*\*NIC0\*\*|192\.0\.2\.99/);
  });
  it('uses the Nutanix and OpenShift deployment scripts', () => {
    expect(generatePowerShell(applyPatch(tunnel(), { platform: 'nutanix' }))).toContain('.\\uagdeployntnx.ps1 -iniFile .\\uag-tunnel-01.ini\n');
    const openshift = generatePowerShell(applyPatch(tunnel(), { platform: 'openshift' }), 'placeholder', 'headless');
    expect(openshift).toContain('.\\uagdeployopenshift.ps1 -iniFile .\\uag-tunnel-01.ini');
    expect(openshift).toContain('-openshiftPassword $env:OPENSHIFT_PASSWORD');
    const token = generatePowerShell(applyPatch(tunnel(), { platform: 'openshift', values: { ocp_bearerToken: 'sha256~token' } }), 'placeholder', 'headless');
    expect(token).not.toContain('OPENSHIFT_PASSWORD');
    expect(token).not.toContain('-openshiftPassword');
  });
});
