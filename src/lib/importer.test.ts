import { describe, expect, it } from 'vitest';
import { defaultConfig, applyPatch, type Config } from './model';
import { validateConfig } from './validate';
import { generateIni, generateJson, generateJsonObject } from './generate';
import { importIni, importJson, importText, parseIni, versionFromSource } from './importer';
import { TEMPLATES } from './templates';

const SAMPLE = `
# comment
[General]
name=UAG1
source=C:\\ova\\euc-unified-access-gateway-25.06.0.0-15261880358_OVF10.ova
deploymentOption=threenic
routes0=10.108.172.32/32 10.108.172.253,192.168.20.0/24 192.168.10.1
routes1=172.16.0.0/16 10.1.0.1
routes2=10.2.0.0/16 10.3.0.1
ipmode0=STATICV4
eth2CustomConfig=Network^Domains=~.
uagName=UAG1
dns=192.0.2.1 192.0.2.2
ntpServers=pool.ntp.org
tls10Enabled=false
tls12Enabled=true
snmpEnabled=TRUE
bogusKey=1

[Horizon]
proxyDestinationUrl=https://cs.corp.local
proxyDestinationUrlThumbprints=sha1=C3 89 A2 19 DC 7A 48 2B 85 1C 81 EC 5E 8F 6A 3C 33 F2 95 C3
authMethods=radius-auth
blastEnabled=true
blastExternalUrl=https://uag.example.com:443

[RADIUSAuth]
hostName=r1.corp.local
authPort=1812
authType=MSCHAP2
sharedSecret=*****
numAttempts=3
serverTimeout=5

[WebReverseProxy1]
instanceId=view
proxyDestinationUrl=https://intranet.corp.local
proxyPattern=/(.*)

[SyslogServerSettings1]
sysLogType=TCP
syslogUrl=syslog.corp.local:514

[SnmpSettings]
version=V1+V2c
communityName=abc
`;
const SSH_PUBLIC_KEY = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7 admin@host';

describe('INI parsing', () => {
  it('parses sections, comments and values with "="', () => {
    const doc = parseIni('[A]\n# c\nk=v=w\n; x\n\n[B]\nk2 = v2 ');
    expect(doc).toEqual([
      { section: 'A', entries: [{ key: 'k', value: 'v=w' }] },
      { section: 'B', entries: [{ key: 'k2', value: 'v2' }] }
    ]);
  });
  it('detects the UAG version from the image file name', () => {
    expect(versionFromSource('C:\\x\\euc-unified-access-gateway-25.06.0.0-15261880358_OVF10.ova')).toBe('2506');
    expect(versionFromSource('euc-unified-access-gateway-21.00.0.0-1.ova')).toBeUndefined();
  });
});

describe('INI import', () => {
  const r = importIni(SAMPLE);
  it('maps documented keys onto form fields', () => {
    expect(r.format).toBe('ini');
    expect(r.config.version).toBe('2506');
    expect(r.config.values).toMatchObject({
      uagName: 'UAG1',
      deploymentOption: 'threenic',
      routes0: '10.108.172.32/32 10.108.172.253,192.168.20.0/24 192.168.10.1',
      routes1: '172.16.0.0/16 10.1.0.1',
      routes2: '10.2.0.0/16 10.3.0.1',
      ipmode0: 'STATICV4',
      eth2CustomConfig: 'Network^Domains=~.',
      dns: '192.0.2.1 192.0.2.2',
      horizon_enabled: true,
      proxyDestinationUrl: 'https://cs.corp.local',
      authMethods: 'radius-auth',
      blastEnabled: true,
      radius_enabled: true,
      radius_hostName: 'r1.corp.local',
      radius_authPort: 1812,
      radius_authType: 'MSCHAP2',
      snmp_enabled: true,
      snmp_communityName: 'abc'
    });
    expect(r.config.wrp).toHaveLength(1);
    expect(r.config.wrp[0].instanceId).toBe('view');
    expect(r.config.syslog[0]).toMatchObject({ sysLogType: 'TCP', syslogUrl: 'syslog.corp.local:514' });
  });
  it('reports unknown keys and ignores masked secrets', () => {
    expect(r.unmapped).toContainEqual({ where: '[General]', key: 'bogusKey', value: '1' });
    expect(r.config.values.radius_sharedSecret).toBe('');
  });
  it('disables Horizon when no [Horizon] section exists', () => {
    expect(importIni('[General]\nuagName=x').config.values.horizon_enabled).toBe(false);
  });
  it('enables and maps every 2609 Airwatch sample key', () => {
    const input = `[Airwatch]
tunnelGatewayEnabled=true
disableAutoConfigUpdate=true
pacFilePath=C:\\pac\\tunnel.pac
pacFileURL=https://config.example.com/tunnel.pac
credentialFilePath=C:\\secrets\\tunnel.txt
apiServerUsername=domain\\api
apiServerPassword=*****
proxyDestinationUrl=https://backend.corp.local
ntlmAuthentication=true
healthCheckUrl=/health
organizationGroupCode=CORP
apiServerUrl=https://as1234.awmdm.com
outboundProxyHost=proxy.corp.local
outboundProxyPort=3128
outboundProxyUsername=proxy-user
outboundProxyPassword=*****
reinitializeGatewayProcess=false
airwatchServerHostname=tunnel.example.com
trustedCert1=C:\\certs\\uem.pem
hostEntry1=10.0.0.20 api.corp.local
tunnelConfigurationId=tunnel-production`;
    const r = importIni(input);
    expect(r.unmapped).toEqual([]);
    expect(r.config.values).toMatchObject({
      airwatch_enabled: true,
      airwatch_tunnelGatewayEnabled: true,
      airwatch_disableAutoConfigUpdate: true,
      airwatch_pacFilePath: 'C:\\pac\\tunnel.pac',
      airwatch_apiServerUsername: 'domain\\api',
      airwatch_proxyDestinationUrl: 'https://backend.corp.local',
      airwatch_ntlmAuthentication: true,
      airwatch_organizationGroupCode: 'CORP',
      airwatch_apiServerUrl: 'https://as1234.awmdm.com',
      airwatch_outboundProxyHost: 'proxy.corp.local',
      airwatch_outboundProxyPort: 3128,
      airwatch_airwatchServerHostname: 'tunnel.example.com',
      airwatch_tunnelConfigurationId: 'tunnel-production'
    });
    expect(r.config.values.airwatch_apiServerPassword).toBe('');
    expect(r.config.values.airwatch_outboundProxyPassword).toBe('');
  });
  it('does not enable Airwatch when the section is absent', () => {
    expect(importIni('[General]\nuagName=x').config.values.airwatch_enabled).toBe(false);
  });
  it('imports historical 2212 Tunnel proxy switches with version warnings', () => {
    const r = importIni('[General]\nsource=euc-unified-access-gateway-22.12.0.0-1.ova\n[Airwatch]\ntunnelProxyEnabled=true\nairwatchOutboundProxy=true');
    expect(r.config.values).toMatchObject({ airwatch_enabled: true, airwatch_tunnelProxyEnabled: true, airwatch_airwatchOutboundProxy: true });
    expect(generateIni(r.config)).toContain('tunnelProxyEnabled=true');
  });
  it('warns about keys newer than the detected version', () => {
    const w = importIni('[General]\nsource=euc-unified-access-gateway-22.12.0.0-1.ova\nheadersToBeLogged=host').warnings;
    expect(w.join('\n')).toMatch(/headersToBeLogged.*2312/);
  });
  it('detects Azure from the [Azure] section', () => {
    expect(importIni('[General]\nuagName=x\n[Azure]\nsubscriptionID=1\nlocation=uksouth').config.platform).toBe('azure');
  });
  it('detects and round-trips Nutanix and OpenShift INI sections', () => {
    const nutanix = TEMPLATES.find((t) => t.id === 'nutanix-ahv')!.build(defaultConfig());
    const nutanixIni = generateIni(nutanix, { secrets: 'include' });
    const nutanixBack = importIni(nutanixIni, nutanix).config;
    expect(nutanixBack.platform).toBe('nutanix');
    expect(nutanixBack.version).toBe('2609');
    expect(nutanixBack.values.ntnx_image).toBe(nutanix.values.ntnx_image);
    expect(generateIni(nutanixBack, { secrets: 'include' })).toBe(nutanixIni);

    const openshift = TEMPLATES.find((t) => t.id === 'openshift-virtualization')!.build(defaultConfig());
    const openshiftIni = generateIni(openshift, { secrets: 'include' });
    const openshiftBack = importIni(openshiftIni, openshift).config;
    expect(openshiftBack.platform).toBe('openshift');
    expect(openshiftBack.values.ocp_nadName1).toBe(openshift.values.ocp_nadName1);
    expect(generateIni(openshiftBack, { secrets: 'include' })).toBe(openshiftIni);
  });
  it('detects the UAG version from a Nutanix image name', () => {
    const r = importIni('[Nutanix]\nimage=euc-unified-access-gateway-26.06.0.0-system.qcow2');
    expect(r.config.platform).toBe('nutanix');
    expect(r.config.version).toBe('2606');
    expect(r.versionDetected).toBe(true);
  });
  it('detects Nutanix and OpenShift deployment sections', () => {
    expect(importIni('[General]\nuagName=x\n[Nutanix]\ncluster=c1').config.platform).toBe('nutanix');
    expect(importIni('[General]\nuagName=x\n[OpenShift]\nnamespace=uag').config.platform).toBe('openshift');
  });
  it('accepts the documentation aliases for additional external URLs', () => {
    const r = importIni('[Horizon]\nproxyDestinationUrl=https://cs\nblastUrls=https://a.example.com,https://b.example.com\ntunnelUrls=https://c.example.com');
    expect(r.config.values).toMatchObject({
      additionalBlastExternalUrls: 'https://a.example.com,https://b.example.com',
      additionalTunnelExternalUrls: 'https://c.example.com'
    });
    expect(r.unmapped).toEqual([]);
  });
  it('round-trips structured origin details without treating them as Horizon fields', () => {
    const ini = `[Horizon]
proxyDestinationUrl=https://cs.example.com
originHeaderDetailsList=1,2

[OriginHeaderDetails1]
origin=https://uag.example.com:443
rewriteEnabled=true
autoGenerated=false

[OriginHeaderDetails2]
origin=uag-internal.example.com
rewriteEnabled=false
autoGenerated=true`;
    const r = importIni(ini);
    expect(r.unmapped).toEqual([]);
    expect(r.config.values.origin).toBe('https://uag.example.com:443 | true | false\nuag-internal.example.com | false | true');
    expect(generateIni(r.config)).toContain('[OriginHeaderDetails2]\norigin=uag-internal.example.com');
  });
  it('imports the documented lowercase admin password policy keys', () => {
    const r = importIni(`[General]
adminpasswordPolicyMinLen=12
adminpasswordPolicyFailedLockoutCount=4
adminpasswordPolicyUnlockTime=7
adminpasswordExpirationDays=60
`);
    expect(r.config.values).toMatchObject({
      adminPasswordPolicyMinLen: 12,
      adminPasswordPolicyFailedLockoutCount: 4,
      adminPasswordPolicyUnlockTime: 7,
      adminPasswordExpirationDays: 60
    });
  });

  it('imports numbered SSH public-key file paths', () => {
    const r = importIni('[General]\nsshEnabled=true\nsshKeyAccessEnabled=true\nsshPublicKey1=C:\\keys\\admin.pub\nsshPublicKey2=keys\\backup.pub');
    expect(r.config.values.sshPublicKeys).toBe('C:\\keys\\admin.pub\nkeys\\backup.pub');
    expect(r.unmapped).toEqual([]);
    expect(generateIni(r.config)).toContain('sshPublicKey1=C:\\keys\\admin.pub');
    expect(generateIni(r.config)).toContain('sshPublicKey2=keys\\backup.pub');
  });
  it('preserves legacy runtime-only values without emitting them', () => {
    const r = importIni('[Runtime]\nrun_noSSLVerify=true\nrun_disableVerification=true');
    expect(r.config.values).toMatchObject({ run_noSSLVerify: true, run_disableVerification: true });
    expect(r.unmapped).toEqual([]);
    expect(generateIni(r.config)).not.toMatch(/Runtime|run_noSSLVerify|run_disableVerification/);
  });

  it('normalizes imported DNS and NTP values for row editors', () => {
    const c = importIni('[General]\ndns=192.0.2.1   192.0.2.2\ndnsSearch=corp.local  example.local\nntpServers=ntp1.corp.local  ntp2.corp.local\nfallBackNtpServers=pool.ntp.org').config;
    expect(c.values.dns).toBe('192.0.2.1 192.0.2.2');
    expect(c.values.dnsSearch).toBe('corp.local example.local');
    expect(c.values.ntpServers).toBe('ntp1.corp.local ntp2.corp.local');
    expect(c.values.fallBackNtpServers).toBe('pool.ntp.org');
  });
});

describe('round trip', () => {
  it('INI -> config -> INI -> config is stable for every template', () => {
    for (const t of TEMPLATES) {
      const cfg = t.build(defaultConfig());
      const ini = generateIni(cfg, { secrets: 'include' });
      const back = importIni(ini, cfg).config;
      expect(generateIni(back, { secrets: 'include' })).toBe(ini);
    }
  });
  it('JSON -> config -> JSON is stable for every template', () => {
    for (const t of TEMPLATES) {
      const cfg = t.build(defaultConfig());
      const json = generateJson(cfg, { secrets: 'include' });
      const res = importJson(json, cfg);
      expect(res.unmapped).toEqual([]);
      expect(generateJson(res.config, { secrets: 'include' })).toBe(json);
    }
  });
});

describe('JSON import', () => {
  it('rejects invalid JSON gracefully', () => {
    const r = importJson('{nope');
    expect(r.warnings[0]).toMatch(/Invalid JSON/);
  });
  it('imports an admin-UI style export and reports unsupported blocks', () => {
    const doc = {
      systemSettings: { uagName: 'U2', tls12Enabled: true, tls10Enabled: false, cipherSuites: ['A', 'B'], snmpEnabled: true, someFutureKey: 1 },
      edgeServiceSettingsList: {
        edgeServiceSettingsList: [
          { identifier: 'VIEW', enabled: true, proxyDestinationUrl: 'https://cs', blastEnabled: true, authMethods: 'radius-auth' },
          { identifier: 'WEB_REVERSE_PROXY', instanceId: 'wiki', proxyDestinationUrl: 'https://wiki', proxyPattern: '/(.*)' },
          { identifier: 'TUNNEL', enabled: true }
        ]
      },
      authMethodSettingsList: { authMethodSettingsList: [{ name: 'radius-auth', enabled: true, hostName: 'r', authPort: 1812 }, { name: 'securid-auth' }] },
      unknownTop: {}
    };
    const r = importText(JSON.stringify(doc));
    expect(r.format).toBe('json');
    expect(r.config.values).toMatchObject({ uagName: 'U2', cipherSuites: 'A,B', horizon_enabled: true, radius_enabled: true, radius_hostName: 'r', snmp_enabled: true });
    expect(r.config.wrp[0].instanceId).toBe('wiki');
    const keys = r.unmapped.map((u) => u.key);
    expect(keys).toEqual(expect.arrayContaining(['someFutureKey', 'identifier=TUNNEL', 'name=securid-auth', 'unknownTop']));
  });
  it('autodetects format', () => {
    expect(importText('{"systemSettings":{}}').format).toBe('json');
    expect(importText('[General]\nuagName=a').format).toBe('ini');
  });
  it('round-trips Horizon origin objects and expanded authentication methods', () => {
    const doc = {
      edgeServiceSettingsList: {
        edgeServiceSettingsList: [{
          identifier: 'VIEW',
          enabled: true,
          proxyDestinationUrl: 'https://cs.example.com',
          authMethods: 'saml-auth-and-unauthenticated',
          originCheckEnabled: true,
          originHeaderDetailsList: [
            { origin: 'https://uag.example.com', rewriteEnabled: true, autoGenerated: false }
          ]
        }]
      }
    };
    const r = importJson(JSON.stringify(doc));
    expect(r.unmapped).toEqual([]);
    expect(r.config.values.origin).toBe('https://uag.example.com | true | false');
    expect((generateJsonObject(r.config) as any).edgeServiceSettingsList.edgeServiceSettingsList[0].originHeaderDetailsList).toEqual(doc.edgeServiceSettingsList.edgeServiceSettingsList[0].originHeaderDetailsList);
  });

  it('imports UAG SSH public-key name/data objects', () => {
    const r = importJson(JSON.stringify({
      systemSettings: {
        sshEnabled: true,
        sshKeyAccessEnabled: true,
        sshPublicKeys: [{ name: 'admin.pub', data: SSH_PUBLIC_KEY }]
      }
    }));
    expect(r.unmapped).toEqual([]);
    expect(r.config.values.sshPublicKeys).toBe(SSH_PUBLIC_KEY);
    expect((generateJsonObject(r.config) as any).systemSettings.sshPublicKeys).toEqual([
      { name: 'admin.pub', data: SSH_PUBLIC_KEY }
    ]);
  });
});

describe('cascading (double DMZ)', () => {
  const outer = () => TEMPLATES.find((t) => t.id === 'cascade-outer')!.build(defaultConfig());
  const inner = () => TEMPLATES.find((t) => t.id === 'cascade-inner')!.build(defaultConfig());

  it('outer UAG emits a Horizon-WRP reverse proxy, forward rules and no Horizon section', () => {
    const c = applyPatch(outer(), { values: { cascade_innerThumbprints: 'sha1=c5 51 2f a8 1e ef a9 f8 ed fa 1b 80 05 a9 c8 bc 6e 2c 64 b1' } });
    const ini = generateIni(c);
    expect(ini).not.toContain('[Horizon]');
    expect(ini).toContain('[WebReverseProxy1]\ninstanceId=Horizon-WRP\nproxyDestinationUrl=https://uag-dmz2-01.corp.local');
    expect(ini).toContain('proxyDestinationUrlThumbprints=sha1=c5 51');
    expect(ini).toContain('proxyPattern=(/broker/xml(.*)|/xmlapi(.*)|/broker/resources/(.*)|/ice/(.*)|/r/(.*)|/portal(.*)|/view-client/(.*)|/)');
    expect(ini).toContain('forwardrules=tcp/8443/192.168.2.101:8443,udp/8443/192.168.2.101:8443,udp/443/192.168.2.101:443');
    expect(generateIni(applyPatch(c, { values: { cascade_opswat: true } }))).toContain('/gateway/resources/(.*)');
  });

  it('keeps forward rules out of the JSON but emits the reverse proxy edge service', () => {
    const o = generateJsonObject(outer()) as any;
    expect(JSON.stringify(o)).not.toContain('forwardrules');
    expect(o.edgeServiceSettingsList.edgeServiceSettingsList).toEqual([
      expect.objectContaining({ identifier: 'WEB_REVERSE_PROXY', instanceId: 'Horizon-WRP' })
    ]);
  });

  it('user reverse proxies are renumbered after the cascade proxy', () => {
    const c = applyPatch(outer(), { wrp: [{ instanceId: 'wiki', proxyDestinationUrl: 'https://wiki.corp.local' }] });
    expect(generateIni(c)).toContain('[WebReverseProxy2]\ninstanceId=wiki');
  });

  it('round-trips the outer UAG through INI and JSON', () => {
    const c = applyPatch(outer(), { values: { cascade_opswat: true } });
    const ini = generateIni(c);
    const back = importIni(ini).config;
    expect(back.values).toMatchObject({ cascade_role: 'outer', cascade_innerUrl: c.values.cascade_innerUrl, cascade_innerIp: '192.168.2.101', cascade_opswat: true, cascade_fwdBlastUdp: true, cascade_fwdPcoipTcp: false });
    expect(back.wrp).toHaveLength(0);
    expect(generateIni(back)).toBe(ini);
    const json = generateJson(c);
    expect(generateJson(importJson(json).config)).toBe(json);
  });

  it('inner UAG is a standard Horizon edge with an informational lint', () => {
    const c = inner();
    expect(generateIni(c)).toContain('[Horizon]');
    expect(generateIni(c)).not.toContain('Horizon-WRP');
    expect(validateConfig(c).map((i) => i.message).join('\n')).toMatch(/Inner UAG: allow only the outer/);
    expect(validateConfig(applyPatch(c, { values: { horizon_enabled: false } })).map((i) => i.message).join('\n')).toMatch(/inner UAG of a cascade must have the Horizon/);
  });

  it('validates the outer UAG inputs', () => {
    const m = (c: Config) => validateConfig(c).map((i) => `${i.level}:${i.message}`).join('\n');
    expect(m(applyPatch(outer(), { values: { cascade_innerUrl: '' } }))).toMatch(/error:Inner UAG URL is required/);
    expect(m(applyPatch(outer(), { values: { cascade_innerIp: '' } }))).toMatch(/error:Inner UAG IP.*required/);
    expect(m(applyPatch(outer(), { values: { cascade_fwdPcoipTcp: true } }))).toMatch(/PCoIP needs both/);
  });
});

describe('trusted CA certificates and legacy TLS', () => {
  it('emits trustedCert1 in [Horizon] and silences the thumbprint hint', () => {
    const c = TEMPLATES.find((t) => t.id === 'horizon-radius')!.build(defaultConfig());
    c.values.trustedCert1 = 'C:\\certs\\corp-root-ca.pem';
    const ini = generateIni(c);
    expect(ini).toMatch(/\[Horizon\][\s\S]*trustedCert1=C:\\certs\\corp-root-ca\.pem/);
    expect(JSON.stringify(generateJsonObject(c))).not.toContain('corp-root-ca');
    expect(importIni(ini).config.values.trustedCert1).toBe('C:\\certs\\corp-root-ca.pem');
    const msgs = (cfg: Config) => validateConfig(cfg).map((i) => i.message).join('\n');
    expect(msgs(c)).not.toMatch(/No Connection Server thumbprint/);
    c.values.trustedCert1 = '';
    expect(msgs(c)).toMatch(/thumbprint or trusted CA certificate/);
  });
  it('cascade outer UAG can trust the inner UAG CA instead of a thumbprint', () => {
    const c = applyPatch(TEMPLATES.find((t) => t.id === 'cascade-outer')!.build(defaultConfig()), { values: { cascade_innerTrustedCert: 'C:\\ca.pem' } });
    const ini = generateIni(c);
    expect(ini).toContain('[WebReverseProxy1]');
    expect(ini).toContain('trustedCert1=C:\\ca.pem');
    expect(importIni(ini).config.values.cascade_innerTrustedCert).toBe('C:\\ca.pem');
  });
  it('hides TLS 1.0/1.1 from the form output on newer releases', () => {
    const v = { tls10Enabled: true, tls11Enabled: true };
    const old = applyPatch(defaultConfig(), { version: '2406', values: v });
    expect(generateIni(old)).toContain('tls11Enabled=true');
    expect(validateConfig(old).map((i) => i.message).join('\n')).toMatch(/TLS 1.0\/1.1 are enabled/);
    const cur = applyPatch(defaultConfig(), { version: '2412', values: v });
    expect(generateIni(cur)).not.toContain('tls10Enabled');
    expect(generateIni(cur)).not.toContain('tls11Enabled');
    expect(validateConfig(cur).map((i) => i.message).join('\n')).not.toMatch(/TLS 1.0\/1.1/);
  });
});

describe('patching', () => {
  it('writes OIDC, SecurID, certificate auth and outbound proxy sections (INI only)', () => {
    const c = applyPatch(defaultConfig(), {
      values: {
        oidc_enabled: true, oidc_oidcConfigurationId: 'idp1', oidc_oidcConfigUrl: 'https://login.example.com/.well-known/openid-configuration', oidc_oidcClientId: 'cid',
        securid_enabled: true, securid_serverHostname: 'rsa.corp.local', securid_accessKey: 'k3y',
        certauth_enabled: true, certauth_pemCerts: 'C:\\ca.pem', certauth_enableOCSP: true,
        obp_enabled: true, obp_name: 'px', obp_proxyUrl: 'http://proxy.corp.local:3128'
      }
    });
    const ini = generateIni(c, { secrets: 'include' });
    expect(ini).toContain('[OidcProviderSetting]\noidcConfigurationId=idp1');
    expect(ini).toContain('[SecurIDAuth]');
    expect(ini).toContain('accessKey=k3y');
    expect(ini).toContain('[CertificateAuth]');
    expect(ini).toContain('enableOCSP=true');
    expect(ini).toContain('[OutboundProxySettings1]');
    expect(generateIni(c)).not.toContain('k3y');
    expect(generateJson(c, { secrets: 'include' })).not.toContain('rsa.corp.local');
    const back = importIni(ini, defaultConfig()).config;
    expect(back.values).toMatchObject({ oidc_enabled: true, securid_enabled: true, certauth_enabled: true, obp_enabled: true, securid_serverHostname: 'rsa.corp.local' });
  });
  it('gates the strict certificate validation key to UAG 2609', () => {
    const v = { certauth_enabled: true, certauth_pemCerts: 'a.pem', certauth_enableStrictCertificateValidation: true };
    expect(generateIni(applyPatch(defaultConfig(), { values: v }))).toContain('enableStrictCertificateValidation=true');
    expect(generateIni(applyPatch(defaultConfig(), { version: '2606', values: v }))).not.toContain('enableStrictCertificateValidation');
  });
  it('applyPatch keeps defaults for list items', () => {
    const c = applyPatch(defaultConfig(), { wrp: [{ instanceId: 'a' }] });
    expect(c.wrp[0].proxyPattern).toBe('/(.*)');
  });
});
