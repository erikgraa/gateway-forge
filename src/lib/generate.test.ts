import { describe, expect, it } from 'vitest';
import { defaultConfig, applyPatch } from './model';
import { collectBlocks, generateIni, generateJson, generateJsonObject, SECRET_PLACEHOLDER } from './generate';
import { TEMPLATES } from './templates';
import { generatePowerShell } from './powershell';
import { validateConfig } from './validate';

const radiusMfa = () => TEMPLATES.find((t) => t.id === 'horizon-radius')!.build(defaultConfig());

describe('INI generation', () => {
  it('emits uagdeploy section and key names from the Omnissa reference', () => {
    const c = radiusMfa();
    c.values.radius_sharedSecret = 's3cret';
    const ini = generateIni(c, { secrets: 'include' });
    expect(ini).toContain('[General]');
    expect(ini).toContain('uagName=uag-dmz-01');
    expect(ini).toContain('deploymentOption=twonic');
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
    const old = generateIni({ ...c, version: '2212' });
    expect(old).not.toContain('minSHAHashSize');
    expect(old).not.toContain('originCheckEnabled');
    expect(old).not.toContain('tunnelExternalUrl');
    const mid = generateIni({ ...c, version: '2406' });
    expect(mid).toContain('minSHAHashSize=SHA-512');
    expect(mid).not.toContain('originCheckEnabled');
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

  it('writes numbered web reverse proxy sections', () => {
    const c = TEMPLATES.find((t) => t.id === 'wrp-intranet')!.build(defaultConfig());
    c.wrp.push({ ...c.wrp[0], instanceId: 'wiki', proxyDestinationUrl: 'https://wiki.corp.local' });
    const ini = generateIni(c);
    expect(ini).toContain('[WebReverseProxy1]');
    expect(ini).toContain('instanceId=intranet');
    expect(ini).toContain('[WebReverseProxy2]');
    expect(ini).toContain('instanceId=wiki');
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
    for (const k of ['ip0', 'netInternet', 'source', 'name', 'deploymentOption', 'dns']) expect(sys).not.toHaveProperty(k);
  });

  it('serialises list-like settings as arrays', () => {
    const c = applyPatch(radiusMfa(), { values: { cipherSuites: 'TLS_AES_128_GCM_SHA256, TLS_AES_256_GCM_SHA384' } });
    expect((generateJsonObject(c) as any).systemSettings.cipherSuites).toEqual(['TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384']);
  });
});

describe('run-time options', () => {
  it('adds -noSSLVerify / -disableVerification to the deploy commands, not the INI', () => {
    const c = applyPatch(radiusMfa(), { values: { run_noSSLVerify: true, run_disableVerification: true } });
    const ps = generatePowerShell(c);
    expect(ps).toContain('.\\uagdeploy.ps1 -iniFile .\\uag-dmz-01.ini -noSSLVerify -disableVerification');
    expect(ps).toMatch(/-adminPwd \(& \$plain \$adminPwd\) -noSSLVerify -disableVerification/);
    expect(ps).toContain('-rootPwd / -adminPwd are read at deploy time');
    expect(generateIni(c)).not.toMatch(/noSSLVerify|disableVerification|Runtime/);
    expect(JSON.stringify(generateJsonObject(c))).not.toMatch(/SSLVerify|disableVerification/);
  });
  it('-disableVerification is vSphere only', () => {
    const v = { run_noSSLVerify: true, run_disableVerification: true };
    const hv = generatePowerShell(applyPatch(radiusMfa(), { platform: 'hyperv', values: v }));
    expect(hv).toContain('-noSSLVerify');
    expect(hv).not.toContain('-disableVerification');
    const az = generatePowerShell(applyPatch(radiusMfa(), { platform: 'azure', values: v }));
    expect(az).toContain('.\\uagdeployaz.ps1 .\\uag-dmz-01.ini -noSSLVerify');
    expect(az).not.toContain('-disableVerification');
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
  it('writes the INI and calls uagdeploy.ps1 -iniFile', () => {
    const c = radiusMfa();
    c.values.radius_sharedSecret = 's3cret';
    const ps = generatePowerShell(c);
    expect(ps).not.toContain('s3cret');
    expect(ps).toContain('$ini = @\'');
    expect(ps).toContain('.\\uagdeploy.ps1 -iniFile .\\uag-dmz-01.ini');
    expect(ps).toContain('-rootPwd');
    expect(ps).toContain('<REDACTED>');
  });
  it('uses the Hyper-V and Azure scripts', () => {
    expect(generatePowerShell(applyPatch(radiusMfa(), { platform: 'hyperv' }))).toContain('uagdeployhv.ps1 -iniFile');
    const az = generatePowerShell(applyPatch(radiusMfa(), { platform: 'azure' }));
    expect(az).toContain('uagdeployaz.ps1 .\\uag-dmz-01.ini');
  });
});
