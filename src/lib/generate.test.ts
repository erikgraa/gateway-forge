import { describe, expect, it } from 'vitest';
import { defaultConfig, applyPatch } from './model';
import { collectBlocks, generateBootableVolumeManifest, generateIni, generateJson, generateJsonObject, manifestFileName, SECRET_PLACEHOLDER } from './generate';
import { TEMPLATES } from './templates';
import { generatePowerShell } from './powershell';
import { generateDocs } from './topology';
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
  it('uses the Nutanix script without vSphere/Azure-only fields', () => {
    const c = TEMPLATES.find((t) => t.id === 'nutanix-ahv')!.build(defaultConfig());
    const ini = generateIni(c);
    expect(ini).toContain('[Nutanix]');
    expect(ini).toContain('prismCentralAddress=prism.corp.local');
    expect(ini).toContain('image=euc-unified-access-gateway-26.09.0.0-system.qcow2');
    expect(ini).toContain('subnet0=uag-external');
    expect(ini).toContain('subnet1=uag-management');
    expect(ini).not.toMatch(/\[Azure\]|^(?:source|target|netInternet|netManagementNetwork|ds)=/m);
    expect(generatePowerShell(c)).toContain('.\\uagdeployntnx.ps1 .\\uag-nutanix-01.ini');
    expect(generatePowerShell(c)).not.toContain('-iniFile');
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
    expect(ps).toContain('.\\uagdeployopenshift.ps1 -iniFile .\\uag-openshift-01.ini');
    expect(ps).not.toContain('-openshiftPassword');
    expect(ps).toContain('Clear-History');
    expect(generatePowerShell(c, 'omit')).toContain('-openshiftPassword');
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
});
