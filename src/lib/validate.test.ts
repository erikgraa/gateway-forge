import { describe, expect, it } from 'vitest';
import { X509Certificate } from 'node:crypto';
import { defaultConfig, applyPatch } from './model';
import { TEMPLATES } from './templates';
import { checkRule, countBySection, parseThumbprint, validThumbprints, validateConfig } from './validate';
import { certToDer, powershellThumbprintCommand, thumbprints, uagThumbprint } from './thumbprint';
import { TEST_CERT_PEM } from './testcert';

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
    expect(checkRule('port', '70000')).not.toBeNull();
    expect(checkRule('ipv4Port', '10.1.2.3:4172')).toBeNull();
    expect(checkRule('ipv4Port', 'uag.corp.local:4172')).not.toBeNull();
    expect(checkRule('uagName', 'uag-dmz-01')).toBeNull();
    expect(checkRule('uagName', 'this-name-is-way-too-long-for-uag')).not.toBeNull();
    expect(checkRule('ipList', '10.0.0.1 10.0.0.2')).toBeNull();
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
      values: { source: 'C:\\a.ova', target: 'vi://a@vc/DC/host/C', ds: 'ds1', netInternet: 'a', netManagementNetwork: 'b', radius_sharedSecret: 'x' }
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

  it('flags duplicate web reverse proxy instance IDs', () => {
    const c = applyPatch(defaultConfig(), { wrp: [{ instanceId: 'a', proxyDestinationUrl: 'https://a' }, { instanceId: 'a', proxyDestinationUrl: 'https://b' }] });
    expect(messages(c).join('\n')).toMatch(/Duplicate web reverse proxy/);
  });

  it('validates DNS and NTP values independently per row', () => {
    const c = applyPatch(defaultConfig(), {
      values: {
        dns: '10.0.0.1 999.0.0.1',
        ntpServers: 'ntp1.corp.local bad!host',
        fallBackNtpServers: 'pool.ntp.org invalid!host'
      }
    });
    const rows = validateConfig(c).filter((issue) => issue.rowIndex !== undefined);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: 'dns', rowIndex: 1 }),
      expect.objectContaining({ fieldId: 'ntpServers', rowIndex: 1 }),
      expect.objectContaining({ fieldId: 'fallBackNtpServers', rowIndex: 1 })
    ]));
  });

  it('does not require fields hidden for the platform', () => {
    const c = applyPatch(defaultConfig(), { platform: 'azure' });
    expect(messages(c).join('\n')).not.toMatch(/vCenter target/);
    expect(messages(c).join('\n')).toMatch(/Subscription ID is required/);
  });

  it('summarises counts per section', () => {
    const counts = countBySection(validateConfig(defaultConfig()));
    expect(counts.horizon.error).toBeGreaterThan(0);
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
