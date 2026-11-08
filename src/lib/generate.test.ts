import { describe, expect, it } from 'vitest';
import { defaultConfig, applyPatch } from './model';
import { collectBlocks, generateIni, generateJson, generateJsonObject, SECRET_PLACEHOLDER } from './generate';
import { TEMPLATES } from './templates';
import { generatePowerShell } from './powershell';
import { generateDocs } from './topology';
import { validateConfig } from './validate';

const radiusMfa = () => TEMPLATES.find((t) => t.id === 'horizon-radius')!.build(defaultConfig());
const tunnel = () => TEMPLATES.find((t) => t.id === 'workspace-one-tunnel')!.build(defaultConfig());
const SSH_PUBLIC_KEY = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7 test@workstation';

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

  it('enables SNMP in General and writes [SnmpSettings]', () => {
    const c = applyPatch(radiusMfa(), { values: { snmp_enabled: true, snmp_version: 'V1+V2c', snmp_communityName: 'comm' } });
    const ini = generateIni(c, { secrets: 'include' });
    expect(ini).toContain('snmpEnabled=true');
    expect(ini).toContain('[SnmpSettings]');
    expect(ini).toContain('communityName=comm');
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
    expect(ini).toContain('trustedCert1=C:\\certs\\uem-ca.pem');
  });

  it('does not emit Tunnel when disabled or on an unsupported platform', () => {
    const c = tunnel();
    expect(generateIni(applyPatch(c, { values: { airwatch_enabled: false } }))).not.toContain('[Airwatch]');
    expect(generateIni(applyPatch(c, { platform: 'azure' }))).not.toContain('[Airwatch]');
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
        ntpServers: 'ntp1.corp.local\nntp2.corp.local',
        fallBackNtpServers: ' pool.ntp.org '
      }
    });
    const ini = generateIni(c);
    expect(ini).toContain('dns=10.0.0.1 10.0.0.2');
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
    for (const k of ['ip0', 'netInternet', 'source', 'name', 'deploymentOption', 'dns']) expect(sys).not.toHaveProperty(k);
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
  it('documents immutable deployment without suggesting passwordless UAG', () => {
    const ps = generatePowerShell(radiusMfa());
    expect(ps).toContain('headless parameter reference marks -rootPwd and -adminPwd as mandatory');
    expect(ps).toContain('The Admin UI and API are then unavailable, no user can be added later');
    expect(ps).toContain('This does not remove the root account');
    expect(ps).toContain('Gateway Forge never requests or stores');
    expect(ps).toContain('https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/RunPowerShellscripttodeploy');
  });
  it('includes immutable recovery and compliance guidance in the runbook', () => {
    const docs = generateDocs(radiusMfa(), []);
    expect(docs).toContain('Immutable / replace-on-failure option');
    expect(docs).toContain('must be redeployed to restore administrative access');
    expect(docs).toContain('This does not remove or disable the root account');
    expect(docs).toContain('compliance requirements');
    expect(docs).toContain('https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/RunPowerShellscripttodeploy');
  });
  it('uses the Hyper-V and Azure scripts', () => {
    expect(generatePowerShell(applyPatch(radiusMfa(), { platform: 'hyperv' }))).toContain('uagdeployhv.ps1 -iniFile');
    const az = generatePowerShell(applyPatch(radiusMfa(), { platform: 'azure' }));
    expect(az).toContain('uagdeployaz.ps1 .\\uag-dmz-01.ini');
  });
});
