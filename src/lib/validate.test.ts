import { describe, expect, it } from 'vitest';
import { X509Certificate } from 'node:crypto';
import { defaultConfig, applyPatch } from './model';
import { TEMPLATES } from './templates';
import { checkRule, countBySection, parseThumbprint, validThumbprints, validateConfig } from './validate';
import { certToDer, powershellThumbprintCommand, thumbprints, uagThumbprint } from './thumbprint';
import { TEST_CERT_PEM } from './testcert';
import { fieldAvailable } from './model';
import { GROUPS } from './schema';

const messages = (c: ReturnType<typeof defaultConfig>) => validateConfig(c).map((i) => `${i.level}:${i.message}`);

describe('field validation', () => {
  it('validates IPv4, hosts, URLs and ports', () => {
    expect(checkRule('ipv4', '10.0.0.1')).toBeNull();
    expect(checkRule('ipv4', '192.0.2')).not.toBeNull();
    expect(checkRule('ipv4', '256.1.1.1')).not.toBeNull();
    expect(checkRule('hostOrIp', 'syslog.corp.local:514')).toBeNull();
    expect(checkRule('hostOrIp', 'bad host')).not.toBeNull();
    expect(checkRule('httpsUrl', 'https://cs01.corp.local')).toBeNull();
    expect(checkRule('httpsUrl', 'http://cs01.corp.local')).not.toBeNull();
    expect(checkRule('httpsOrigin', 'https://as1234.awmdm.com')).toBeNull();
    expect(checkRule('httpsOrigin', 'https://as1234.awmdm.com/')).toBeNull();
    expect(checkRule('httpsOrigin', 'https://as1234.awmdm.com:443')).toBeNull();
    expect(checkRule('httpsOrigin', 'https://as1234.awmdm.com/api')).not.toBeNull();
    expect(checkRule('httpsOrigin', 'https://as1234.awmdm.com?tenant=1')).not.toBeNull();
    expect(checkRule('httpsOrigin', 'https://as1234.awmdm.com#api')).not.toBeNull();
    expect(checkRule('port', '70000')).not.toBeNull();
    expect(checkRule('ipv4Port', '10.1.2.3:4172')).toBeNull();
    expect(checkRule('ipv4Port', 'uag.corp.local:4172')).not.toBeNull();
    expect(checkRule('uagName', 'uag-dmz-01')).toBeNull();
    expect(checkRule('uagName', 'this-name-is-way-too-long-for-uag')).not.toBeNull();
    expect(checkRule('ipList', '10.0.0.1 10.0.0.2')).toBeNull();
    expect(checkRule('ipv6', '2402:740:2:209::253')).toBeNull();
    expect(checkRule('ipv6', 'not:an:ipv6')).not.toBeNull();
    expect(checkRule('osLoginUsername', 'uag_admin-1')).toBeNull();
    expect(checkRule('osLoginUsername', 'Upper Case')).not.toBeNull();
    expect(checkRule('ascii', 'Banner\\nline two')).toBeNull();
    expect(checkRule('ascii', 'bannér')).not.toBeNull();
  });

  it('validates static routes and per-NIC custom configuration syntax', () => {
    expect(checkRule('staticRoutes', '10.108.172.32/32 10.108.172.253,192.168.20.0/24 192.168.10.1')).toBeNull();
    expect(checkRule('staticRoutes', '10.0.0.0/33 10.0.0.1')).toMatch(/CIDR/);
    expect(checkRule('staticRoutes', '10.0.0.0/8')).toMatch(/network.*gateway/i);
    expect(checkRule('customConfig', 'DHCP^UseDNS=false;Network^DNS=192.168.1.153#dns.example.com')).toBeNull();
    expect(checkRule('customConfig', 'UseDNS=false')).not.toBeNull();
  });

  it('validates thumbprint formats and lengths', () => {
    expect(validThumbprints('sha1=C3 89 A2 19 DC 7A 48 2B 85 1C 81 EC 5E 8F 6A 3C 33 F2 95 C3')).toBeNull();
    expect(validThumbprints('ad:5c:f1:48:47:94:7e:80:82:73:13:6c:83:52:0b:78:ed:ff:50:23:56:a8:42:8a:d9:30:fc:3a:33:d6:c6:db')).toBeNull();
    expect(validThumbprints('ad:5c:f1:48:47:94:7e:80:82:73:13:6c:83:52:b:e:78:ed:ff:50:23:56:a8:42:8a:d9:30:fc:3a:33:d6:c6')).toBeNull();
    expect(validThumbprints('sha1=AA:BB')).toMatch(/20 bytes/);
    expect(validThumbprints('sha256=zz')).toMatch(/not a valid/);
    expect(parseThumbprint('SHA256=AB:CD')).toEqual({ alg: 'sha256', hex: 'abcd' });
  });
});

describe('config validation', () => {
  it('flags required fields on a blank config', () => {
    const m = messages(defaultConfig()).join('\n');
    expect(m).toMatch(/error:UAG name.*required/);
    expect(m).toMatch(/error:Connection Server URL is required/);
  });

  it('accepts the RADIUS template without errors', () => {
    const c = applyPatch(TEMPLATES[0].build(defaultConfig()), {
      values: {
        source: 'C:\\a.ova',
        target: 'vi://a@vc/DC/host/C',
        ds: 'ds1',
        netInternet: 'a',
        netManagementNetwork: 'b',
        ip0: '192.0.2.21',
        netmask0: '255.255.255.0',
        ip1: '192.0.3.21',
        netmask1: '255.255.255.0',
        defaultGateway: '192.0.2.1',
        radius_sharedSecret: 'x'
      }
    });
    expect(validateConfig(c).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('lints best practices', () => {
    const c = applyPatch(defaultConfig(), {
      version: '2406',
      values: { tls11Enabled: true, sshEnabled: true, sshPasswordAccessEnabled: true, authMethods: 'passthrough', gatewayLocation: 'external', proxyDestinationUrl: 'https://cs', blastEnabled: true, blastExternalUrl: '' }
    });
    const m = messages(c).join('\n');
    expect(m).toMatch(/No syslog server/);
    expect(m).toMatch(/TLS 1.0\/1.1/);
    expect(m).toMatch(/SSH is enabled/);
    expect(m).toMatch(/passthrough authentication/);
    expect(m).toMatch(/Blast is enabled without an external URL/);
  });

  it('catches RADIUS timing and missing-method mismatches', () => {
    const c = applyPatch(defaultConfig(), { values: { authMethods: 'radius-auth', radius_enabled: false } });
    expect(messages(c).join('\n')).toMatch(/error:Horizon uses RADIUS/);
    const t = applyPatch(c, { values: { radius_enabled: true, radius_numAttempts: 10, radius_serverTimeout: 20, radius_hostName: 'r' } });
    expect(messages(t).join('\n')).toMatch(/must not exceed 120/);
  });

  it('detects duplicate NIC IPs and gateway outside subnet', () => {
    const c = applyPatch(defaultConfig(), { values: { ip0: '10.0.0.5', ip1: '10.0.0.5', netmask0: '255.255.255.0', defaultGateway: '10.0.1.1' } });
    const m = messages(c).join('\n');
    expect(m).toMatch(/share the same IP/);
    expect(m).toMatch(/gateway is not in the NIC0 subnet/);
  });

  it('rejects routes, custom NIC config and SSH interfaces for NICs that do not exist', () => {
    const one = applyPatch(defaultConfig(), {
      values: { deploymentOption: 'onenic', routes1: '10.0.0.0/8 192.0.2.1', eth2CustomConfig: 'DHCP^UseDNS=false', sshEnabled: true, sshInterface: 'eth1' }
    });
    const m = messages(one).join('\n');
    expect(m).toMatch(/routes1.*only NIC0/);
    expect(m).toMatch(/eth2CustomConfig.*only NIC0/);
    expect(m).toMatch(/eth1 is not present/);
    const two = applyPatch(defaultConfig(), { values: { deploymentOption: 'twonic', routes2: '10.0.0.0/8 192.0.2.1' } });
    expect(messages(two).join('\n')).toMatch(/two-NIC deployment has no NIC2/);
  });

  it('warns when a static IPv6 address conflicts with ipmode0', () => {
    const c = applyPatch(defaultConfig(), { values: { v6ip0: '2402:740:2:209::5', ipmode0: 'STATICV4' } });
    expect(messages(c).join('\n')).toMatch(/does not include STATICV6/);
  });

  it('flags duplicate web reverse proxy instance IDs', () => {
    const c = applyPatch(defaultConfig(), { wrp: [{ instanceId: 'a', proxyDestinationUrl: 'https://a' }, { instanceId: 'a', proxyDestinationUrl: 'https://b' }] });
    expect(messages(c).join('\n')).toMatch(/Duplicate web reverse proxy/);
  });

  it('validates DNS, search domain and NTP values independently per row', () => {
    const c = applyPatch(defaultConfig(), {
      values: {
        dns: '10.0.0.1 999.0.0.1',
        dnsSearch: 'corp.local -invalid.example bad_domain.example',
        ntpServers: 'ntp1.corp.local bad!host',
        fallBackNtpServers: 'pool.ntp.org invalid!host'
      }
    });
    const rows = validateConfig(c).filter((issue) => issue.rowIndex !== undefined);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: 'dns', rowIndex: 1 }),
      expect.objectContaining({ fieldId: 'dnsSearch', rowIndex: 1 }),
      expect.objectContaining({ fieldId: 'dnsSearch', rowIndex: 2 }),
      expect.objectContaining({ fieldId: 'ntpServers', rowIndex: 1 }),
      expect.objectContaining({ fieldId: 'fallBackNtpServers', rowIndex: 1 })
    ]));
    expect(rows).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: 'dnsSearch', rowIndex: 0 })
    ]));
  });

  it('does not require fields hidden for the platform', () => {
    const c = applyPatch(defaultConfig(), { platform: 'azure' });
    expect(messages(c).join('\n')).not.toMatch(/vCenter target/);
    expect(messages(c).join('\n')).toMatch(/Subscription ID is required/);
  });

  it('requires the network fields for every one-, two- and three-NIC size option', () => {
    const options = [
      ['onenic', 1], ['twonic', 2], ['threenic', 3],
      ['onenic-large', 1], ['twonic-large', 2], ['threenic-large', 3],
      ['onenic-XL', 1], ['twonic-XL', 2], ['threenic-XL', 3]
    ] as const;
    const topologyIds = ['netInternet', 'netManagementNetwork', 'netBackendNetwork', 'ip0', 'netmask0', 'ip1', 'netmask1', 'ip2', 'netmask2', 'defaultGateway'];
    const networkValues = {
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
      const blank = applyPatch(defaultConfig(), {
        values: { ...Object.fromEntries(topologyIds.map((id) => [id, ''])), deploymentOption }
      });
      const missing = validateConfig(blank)
        .filter((i) => i.level === 'error' && i.fieldId && topologyIds.includes(i.fieldId))
        .map((i) => i.fieldId);
      expect(missing).toContain('netInternet');
      expect(missing).toContain('ip0');
      expect(missing).toContain('netmask0');
      expect(missing).toContain('defaultGateway');
      expect(missing.includes('netManagementNetwork')).toBe(nicCount >= 2);
      expect(missing.includes('ip1')).toBe(nicCount >= 2);
      expect(missing.includes('netmask1')).toBe(nicCount >= 2);
      expect(missing.includes('netBackendNetwork')).toBe(nicCount === 3);
      expect(missing.includes('ip2')).toBe(nicCount === 3);
      expect(missing.includes('netmask2')).toBe(nicCount === 3);

      const complete = applyPatch(blank, { values: networkValues });
      const errors = validateConfig(complete).filter((i) => i.level === 'error' && i.fieldId && topologyIds.includes(i.fieldId));
      expect(errors).toEqual([]);
    }
  });

  it('ignores network values for NICs hidden by the deployment option', () => {
    const c = applyPatch(defaultConfig(), {
      values: {
        deploymentOption: 'onenic',
        netInternet: 'DMZ',
        ip0: '192.0.2.21',
        netmask0: '255.255.255.0',
        defaultGateway: '192.0.2.1',
        ip1: 'not-an-ip',
        netmask1: 'invalid',
        netManagementNetwork: '',
        ip2: '192.0.2.21'
      }
    });
    const issues = validateConfig(c);
    expect(issues.some((i) => i.fieldId === 'ip1' || i.fieldId === 'ip2')).toBe(false);
    expect(issues.some((i) => /applicable NICs share/.test(i.message))).toBe(false);
  });

  it('summarises counts per section', () => {
    const counts = countBySection(validateConfig(defaultConfig()));
    expect(counts.horizon.error).toBeGreaterThan(0);
  });

  it('validates required Workspace ONE Tunnel settings and proxy inputs', () => {
    const c = applyPatch(defaultConfig(), { values: { airwatch_enabled: true, airwatch_tunnelGatewayEnabled: false, airwatch_outboundProxyHost: 'proxy.corp.local' } });
    const m = messages(c).join('\n');
    expect(m).toMatch(/Workspace ONE UEM API server URL is required/);
    expect(m).toMatch(/Workspace ONE UEM API user is required/);
    expect(m).toMatch(/Workspace ONE UEM API password is required/);
    expect(m).toMatch(/Tunnel server hostname is required/);
    expect(m).toMatch(/Tunnel gateway must be enabled/);
    expect(m).toMatch(/Outbound proxy port is required/);
  });

  it('rejects paths after the Workspace ONE UEM API origin', () => {
    const c = applyPatch(defaultConfig(), {
      values: {
        airwatch_enabled: true,
        airwatch_apiServerUrl: 'https://as1234.awmdm.com/api',
        airwatch_apiServerUsername: 'api-user',
        airwatch_apiServerPassword: 'secret',
        airwatch_airwatchServerHostname: 'tunnel.example.com'
      }
    });
    expect(messages(c).join('\n')).toMatch(/Workspace ONE UEM API server URL: Must be an https:\/\/ origin with no path, query or fragment/);
  });

  it('gates Workspace ONE Tunnel to vSphere and Hyper-V', () => {
    const c = applyPatch(defaultConfig(), { platform: 'azure', values: { airwatch_enabled: true } });
    expect(messages(c).join('\n')).toMatch(/not Azure/);
  });

  it('validates host entries and surfaces ambiguous PAC source configuration', () => {
    const c = applyPatch(defaultConfig(), {
      values: {
        airwatch_enabled: true,
        airwatch_hostEntry1: 'not-an-ip api.corp.local',
        airwatch_pacFilePath: 'C:\\pac\\tunnel.pac',
        airwatch_pacFileURL: 'https://config.example.com/tunnel.pac'
      }
    });
    const m = messages(c).join('\n');
    expect(m).toMatch(/Host entries: Must contain comma-separated/);
    expect(m).toMatch(/Both PAC file path and URL/);
  });

  it('requires a valid SSH public key only while key access is enabled', () => {
    const appliance = GROUPS.find((g) => g.id === 'appliance')!;
    const keyField = appliance.fields.find((f) => f.id === 'sshPublicKeys')!;
    const blank = applyPatch(defaultConfig(), { values: { sshEnabled: true, sshKeyAccessEnabled: true } });
    expect(fieldAvailable(keyField, blank.version, blank.platform, blank.values)).toBe(true);
    expect(messages(blank).join('\n')).toMatch(/SSH public keys is required/);

    const valid = applyPatch(blank, { values: { sshPublicKeys: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7 admin@host' } });
    expect(messages(valid).join('\n')).not.toMatch(/SSH public keys/);

    const malformed = applyPatch(blank, { values: { sshPublicKeys: 'not an SSH key' } });
    expect(messages(malformed).join('\n')).toMatch(/OpenSSH RSA public key/);

    const disabled = applyPatch(defaultConfig(), { values: { sshEnabled: false, sshKeyAccessEnabled: true, sshPublicKeys: '' } });
    expect(fieldAvailable(keyField, disabled.version, disabled.platform, disabled.values)).toBe(false);
    expect(messages(disabled).join('\n')).not.toMatch(/SSH public keys is required/);
  });
});

describe('thumbprints', () => {
  it('computes SHA fingerprints that match Node X509', async () => {
    const x = new X509Certificate(TEST_CERT_PEM);
    const t = await thumbprints(TEST_CERT_PEM);
    expect(t['SHA-1']).toBe(x.fingerprint);
    expect(t['SHA-256']).toBe(x.fingerprint256);
    expect(t['SHA-512']).toBe(x.fingerprint512);
    expect(uagThumbprint(t)).toBe('sha256=' + x.fingerprint256.toLowerCase());
    expect(validThumbprints(uagThumbprint(t))).toBeNull();
    expect(validThumbprints(uagThumbprint(t, 'SHA-1'))).toBeNull();
  });
  it('accepts DER bytes, bare base64 and rejects garbage', async () => {
    const der = certToDer(TEST_CERT_PEM);
    const b64 = TEST_CERT_PEM.replace(/-----[A-Z ]+-----|\s/g, '');
    expect((await thumbprints(der))['SHA-1']).toBe((await thumbprints(b64))['SHA-1']);
    expect(() => certToDer('hello world')).toThrow();
    expect(() => certToDer(btoa('not a cert'))).toThrow();
  });
  it('builds a PowerShell one-liner for host:port', () => {
    const ps = powershellThumbprintCommand('https://cs01.corp.local:8443/portal');
    expect(ps).toContain("$h='cs01.corp.local'");
    expect(ps).toContain('$p=8443');
    expect(ps).not.toContain('\n');
  });
});
