import { describe, expect, it } from 'vitest';
import { X509Certificate } from 'node:crypto';
import { defaultConfig, applyPatch } from './model';
import { TEMPLATES } from './templates';
import { checkRule, countBySection, parseThumbprint, validThumbprints, validateConfig } from './validate';
import { certToDer, powershellThumbprintCommand, thumbprints, uagThumbprint } from './thumbprint';
import { TEST_CERT_PEM } from './testcert';
import { fieldAvailable } from './model';
import { GROUPS, SECTIONS } from './schema';

const messages = (c: ReturnType<typeof defaultConfig>) => validateConfig(c).map((i) => `${i.level}:${i.message}`);

describe('field validation', () => {
  it('validates IPv4, hosts, URLs and ports', () => {
    expect(checkRule('ipv4', '10.0.0.1')).toBeNull();
    expect(checkRule('ipv4', '192.0.2')).not.toBeNull();
    expect(checkRule('ipv4', '256.1.1.1')).not.toBeNull();
    expect(checkRule('netmask', '255.255.255.0')).toBeNull();
    expect(checkRule('netmask', '255.255.255.128')).toBeNull();
    expect(checkRule('netmask', '255.255.0.255')).not.toBeNull();
    expect(checkRule('netmask', '255.0.255.0')).not.toBeNull();
    expect(checkRule('netmask', '24')).not.toBeNull();
    expect(checkRule('pemPath', 'C:\\certs\\chain.pem')).toBeNull();
    expect(checkRule('pemPath', 'C:\\certs\\chain.crt')).toBeNull();
    expect(checkRule('pemPath', 'C:\\certs\\chain.cer')).toBeNull();
    expect(checkRule('pemPath', 'C:\\certs\\chain.txt')).not.toBeNull();
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
    expect(checkRule('hostPortList', 'uag.example.com:8443,_empty_')).toBeNull();
    expect(checkRule('hostPortList', 'bad host')).not.toBeNull();
    expect(checkRule('hostEntry', '192.0.2.10 cs.example.com cs')).toBeNull();
    expect(checkRule('redirectMappings', 'client.example.com_uag-01.example.com:443')).toBeNull();
    expect(checkRule('ipv6', '2402:740:2:209::253')).toBeNull();
    expect(checkRule('ipv6', 'not:an:ipv6')).not.toBeNull();
    expect(checkRule('osLoginUsername', 'uag_admin-1')).toBeNull();
    expect(checkRule('osLoginUsername', 'Upper Case')).not.toBeNull();
    expect(checkRule('ascii', 'Banner\\nline two')).toBeNull();
    expect(checkRule('ascii', 'bannér')).not.toBeNull();
    expect(checkRule('sourceImage', 'C:\\images\\uag.ova', 'vsphere')).toBeNull();
    expect(checkRule('sourceImage', 'https://images.example.com/uag.ova?download=1', 'vsphere')).toBeNull();
    expect(checkRule('sourceImage', 'C:\\images\\uag.vhdx', 'hyperv')).toBeNull();
    expect(checkRule('sourceImage', 'https:\\\\broken.example\\uag.ova', 'vsphere')).toMatch(/valid local path/);
    expect(checkRule('sourceImage', 'C:\\images\\uag.vhdx', 'vsphere')).toMatch(/\.ova/);
    expect(checkRule('sourceImage', 'https://images.example.com/uag.vhdx', 'hyperv')).toMatch(/local/);
    expect(checkRule('sourceImage', 'not-an-image', 'hyperv')).toMatch(/\.vhdx/);
    expect(checkRule('monitoringUserName', 'MonitorUser_1')).toBeNull();
    expect(checkRule('monitoringUserName', 'DOMAIN\\Monitor')).toBeNull();
    expect(checkRule('monitoringUserName', 'Bad User!')).not.toBeNull();
    expect(checkRule('monitoringUserName', 'a'.repeat(36))).not.toBeNull();
    expect(checkRule('hostPort', '_empty_')).toBeNull();
    expect(checkRule('hostPort', 'uag.example.com:8443')).toBeNull();
    expect(checkRule('hostPort', 'bad host')).not.toBeNull();
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
    expect(m).not.toMatch(/Connection Server URL is required/);
    expect(messages(applyPatch(defaultConfig(), { values: { horizon_enabled: true } })).join('\n')).toMatch(/error:Connection Server URL is required/);
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
      values: { horizon_enabled: true, tls11Enabled: true, sshEnabled: true, sshPasswordAccessEnabled: true, authMethods: 'passthrough', gatewayLocation: 'external', proxyDestinationUrl: 'https://cs', blastEnabled: true, blastExternalUrl: '' }
    });
    const m = messages(c).join('\n');
    expect(m).toMatch(/No syslog server/);
    expect(m).toMatch(/TLS 1.0\/1.1/);
    expect(m).toMatch(/SSH is enabled/);
    expect(m).toMatch(/passthrough authentication/);
    expect(m).toMatch(/Blast is enabled without an external URL/);
  });

  it('warns about missing Horizon trust configuration and accepts every supported trust source', () => {
    const base = applyPatch(defaultConfig(), {
      values: {
        horizon_enabled: true,
        proxyDestinationUrl: 'https://cs.example.com',
        proxyDestinationUrlThumbprints: '',
        ...Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`trustedCert${index + 1}`, '']))
      }
    });
    const trustWarning = (config: ReturnType<typeof defaultConfig>) => validateConfig(config)
      .find((issue) => issue.message.startsWith('No Connection Server thumbprint'));

    expect(trustWarning(base)).toMatchObject({
      level: 'warn',
      section: 'horizon',
      fieldId: 'trustedCert1'
    });
    expect(trustWarning(applyPatch(base, {
      values: { proxyDestinationUrlThumbprints: 'sha256=ad:5c:f1:48:47:94:7e:80:82:73:13:6c:83:52:0b:78:ed:ff:50:23:56:a8:42:8a:d9:30:fc:3a:33:d6:c6:db' }
    }))).toBeUndefined();
    expect(trustWarning(applyPatch(base, {
      values: { trustedCert1: 'C:\\certs\\corp-root-ca.pem' }
    }))).toBeUndefined();
    expect(trustWarning(applyPatch(base, {
      values: { trustedCert9: 'C:\\certs\\issuer-ca.pem' }
    }))).toBeUndefined();
  });

  it('catches RADIUS timing and missing-method mismatches', () => {
    const c = applyPatch(defaultConfig(), { values: { horizon_enabled: true, authMethods: 'radius-auth', radius_enabled: false } });
    expect(messages(c).join('\n')).toMatch(/error:Horizon uses RADIUS/);
    const t = applyPatch(c, { values: { radius_enabled: true, radius_numAttempts: 10, radius_serverTimeout: 20, radius_hostName: 'r' } });
    expect(messages(t).join('\n')).toMatch(/must not exceed 120/);
  });
  it('validates combined authentication methods and Horizon interactions', () => {
    const c = applyPatch(defaultConfig(), {
      values: {
        authMethods: 'saml-auth-and-unauthenticated',
        horizon_enabled: true,
        blastEnabled: true,
        gatewayLocation: 'external',
        saml_enabled: false,
        origin: 'not an origin',
        additionalBlastExternalUrls: 'https://vdi.example.com:443,https://vdi.example.com:8443',
        blastExternalUrl: 'https://vdi.example.com:10443',
        canonicalizationEnabled: false
      }
    });
    const m = messages(c).join('\n');
    expect(m).toMatch(/SAML authentication but no SAML/);
    expect(m).toMatch(/Unauthenticated Horizon authentication methods require Gateway location/);
    expect(m).toMatch(/Allowed origin 1/);
    expect(m).toMatch(/Blast external URLs must be unique/);
    expect(m).toMatch(/canonicalization is disabled/);
    expect(messages(applyPatch(defaultConfig(), {
      values: { horizon_enabled: true, authMethods: 'securid-auth-and-unauthenticated', gatewayLocation: 'internal' }
    })).join('\n')).toMatch(/RSA SecurID is not configured/);
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

  it('warns when no edge service is configured and suppresses it for each service type', () => {
    const warning = (config: ReturnType<typeof defaultConfig>) => validateConfig(config)
      .find((issue) => issue.message.startsWith('No edge service'));
    expect(warning(defaultConfig())).toMatchObject({ level: 'warn', section: 'general' });
    expect(warning(applyPatch(defaultConfig(), { values: { horizon_enabled: true } }))).toBeUndefined();
    expect(warning(applyPatch(defaultConfig(), { values: { airwatch_enabled: true, airwatch_tunnelGatewayEnabled: true } }))).toBeUndefined();
    expect(warning(applyPatch(defaultConfig(), { values: { contentGateway_enabled: true } }))).toBeUndefined();
    expect(warning(applyPatch(defaultConfig(), { values: { cascade_role: 'outer' } }))).toBeUndefined();
    expect(warning(applyPatch(defaultConfig(), { wrp: [{ instanceId: 'web' }] }))).toBeUndefined();
  });

  it('rejects missing, invalid and duplicate additional admin users', () => {
    const c = applyPatch(defaultConfig(), {
      adminUsers: [
        { name: '' },
        { name: 'MonitorUser1' },
        { name: 'monitoruser1' },
        { name: 'Bad User!' }
      ]
    });
    const issues = validateConfig(c).filter((issue) => issue.section === 'adminUsers');
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ list: { id: 'adminUsers', index: 0 }, fieldId: 'name', message: expect.stringContaining('required') }),
      expect.objectContaining({ list: { id: 'adminUsers', index: 2 }, fieldId: 'name', message: expect.stringContaining('Duplicate') }),
      expect.objectContaining({ list: { id: 'adminUsers', index: 3 }, fieldId: 'name', message: expect.stringContaining('letters') })
    ]));
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

  it('validates Blast allowed hosts independently per comma-separated row', () => {
    const c = applyPatch(defaultConfig(), {
      values: {
        horizon_enabled: true,
        blastEnabled: true,
        blastAllowedHostHeaderValues: 'uag.example.com:8443,bad host,_empty_'
      }
    });
    expect(validateConfig(c).filter((issue) => issue.fieldId === 'blastAllowedHostHeaderValues')).toEqual([
      expect.objectContaining({ rowIndex: 1, message: expect.stringContaining('Allowed host header 2') })
    ]);
  });

  it('validates source images against the selected platform inline', () => {
    const vsphere = applyPatch(defaultConfig(), { values: { source: 'https://images.example.com/uag.vhdx' } });
    expect(messages(vsphere).join('\n')).toMatch(/Source image: VMware source image URLs must point to a \.ova/);
    const hyperv = applyPatch(defaultConfig(), { platform: 'hyperv', values: { source: 'C:\\images\\uag.ova' } });
    expect(messages(hyperv).join('\n')).toMatch(/Source image: Hyper-V source images must be local \.vhdx paths/);
  });

  it('shows only addressing-mode controls for NICs in the active topology', () => {
    const fields = GROUPS.find((group) => group.id === 'deploy')!.fields
      .filter((field) => /^ipmode[0-2]$/.test(field.id));
    const available = (deploymentOption: string) => fields
      .filter((field) => fieldAvailable(field, '2609', 'vsphere', { deploymentOption }))
      .map((field) => field.id);

    expect(available('onenic')).toEqual(['ipmode0']);
    expect(available('twonic')).toEqual(['ipmode0', 'ipmode1']);
    expect(available('threenic')).toEqual(['ipmode0', 'ipmode1', 'ipmode2']);
  });

  it('rejects undocumented addressing mode values from imports', () => {
    const c = applyPatch(defaultConfig(), { values: { ipmode0: 'STATICV4+AUTOMAGICV6' } });
    expect(messages(c).join('\n')).toMatch(/NIC0 addressing mode: "STATICV4\+AUTOMAGICV6" is not an allowed value/);
  });

  it('does not require fields hidden for the platform', () => {
    const c = applyPatch(defaultConfig(), { platform: 'azure' });
    expect(messages(c).join('\n')).not.toMatch(/vCenter target/);
    expect(messages(c).join('\n')).toMatch(/Subscription ID is required/);
  });
  it('validates Nutanix and OpenShift platform requirements and NIC modes', () => {
    const nutanix = applyPatch(TEMPLATES.find((t) => t.id === 'nutanix-ahv')!.build(defaultConfig()), {
      values: { ntnx_cluster: '', ntnx_subnet1: '', ntnx_image: 'uag.ova', ipMode0: 'STATICV4', ip0: '', netmask0: '' }
    });
    const nutanixMessages = messages(nutanix).join('\n');
    expect(nutanixMessages).toMatch(/Cluster is required/);
    expect(nutanixMessages).toMatch(/NIC1 \/ eth1 subnet is required/);
    expect(nutanixMessages).toMatch(/NIC0 \/ eth0 IPv4 address is required/);
    expect(nutanixMessages).toMatch(/NIC0 \/ eth0 netmask is required/);
    expect(nutanixMessages).toMatch(/native .qcow2 artifact/);

    const openshift = applyPatch(TEMPLATES.find((t) => t.id === 'openshift-virtualization')!.build(defaultConfig()), {
      values: { ocp_diskSizeGi: 19, ocp_namespace: 'Invalid.Namespace', ocp_nadName1: '', ocp_labels: 'missing-value', ocp_qcow2Url: 'https://images.corp.local/uag.ova' }
    });
    const openshiftMessages = messages(openshift).join('\n');
    expect(openshiftMessages).toMatch(/Root disk size.*20/);
    expect(openshiftMessages).toMatch(/Namespace \/ project: Must be a lowercase DNS label/);
    expect(openshiftMessages).toMatch(/NIC1 \/ eth1 NAD is required/);
    expect(openshiftMessages).toMatch(/labels must be comma-separated key=value/);
    expect(openshiftMessages).toMatch(/Limited Availability/);
    expect(openshiftMessages).toMatch(/image URL must point to a .qcow2 artifact/);
  });
  it('rejects Nutanix and OpenShift output on unsupported UAG versions', () => {
    expect(messages(applyPatch(defaultConfig(), { version: '2603', platform: 'nutanix' })).join('\n')).toMatch(/Nutanix AHV deployment output.*2606/);
    expect(messages(applyPatch(defaultConfig(), { version: '2606', platform: 'openshift' })).join('\n')).toMatch(/OpenShift.*2609/);
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
    expect(counts.horizon.error).toBe(0);
    expect(counts.network.error).toBeGreaterThan(0);
    expect(Object.keys(counts)).toEqual(SECTIONS.map((section) => section.id));
  });

  it('rejects non-contiguous netmasks on active NIC fields', () => {
    const c = applyPatch(defaultConfig(), {
      values: {
        deploymentOption: 'threenic',
        netmask0: '255.255.0.255',
        netmask1: '255.255.254.1',
        netmask2: '255.255.255.0'
      }
    });
    const issues = validateConfig(c).filter((issue) => issue.fieldId?.startsWith('netmask'));
    expect(issues.map((issue) => issue.fieldId)).toEqual(['netmask0', 'netmask1']);
    expect(issues.every((issue) => issue.message.includes('contiguous IPv4 netmask'))).toBe(true);
  });

  it('validates static routes per comma-separated row', () => {
    const c = applyPatch(defaultConfig(), {
      values: {
        deploymentOption: 'threenic',
        routes0: '10.0.0.0/8 192.0.2.1,10.1.0.0/33 192.0.2.1,not-a-route'
      }
    });
    const routeIssues = validateConfig(c).filter((issue) => issue.fieldId === 'routes0');
    expect(routeIssues.map((issue) => issue.rowIndex)).toEqual([1, 2]);
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

  it('allows Workspace ONE Tunnel on Azure, Nutanix and OpenShift', () => {
    for (const platform of ['azure', 'nutanix', 'openshift'] as const) {
      const c = applyPatch(defaultConfig(), { platform, values: { airwatch_enabled: true } });
      expect(messages(c).join('\n')).not.toMatch(/not Azure|vSphere and Hyper-V|unsupported platform/i);
    }
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
    expect(m).toMatch(/Host entry 1: Use IPv4_address hostname/);
    expect(m).toMatch(/Both PAC file path and URL/);
  });

  it('validates standalone and shared Content Gateway prerequisites', () => {
    const standalone = applyPatch(defaultConfig(), { values: { contentGateway_enabled: true } });
    expect(messages(standalone).join('\n')).toMatch(/Workspace ONE UEM API server URL is required/);
    expect(messages(standalone).join('\n')).toMatch(/Content Gateway hostname is required/);

    const shared = applyPatch(defaultConfig(), {
      values: {
        contentGateway_enabled: true,
        contentGateway_mode: 'shared'
      }
    });
    expect(messages(shared).join('\n')).toMatch(/Shared Content Gateway requires the \[Airwatch\]/);

    const proxy = applyPatch(standalone, {
      values: { contentGateway_outboundProxyHost: 'proxy.corp.local' }
    });
    expect(messages(proxy).join('\n')).toMatch(/Outbound proxy port is required/);
  });

  it('validates host entries independently for every WRP instance', () => {
    const c = applyPatch(defaultConfig(), {
      wrp: [
        { instanceId: 'one', proxyDestinationUrl: 'https://one.local', hostEntry1: 'not-an-ip one.local' },
        { instanceId: 'two', proxyDestinationUrl: 'https://two.local', hostEntry1: '10.0.0.2 two.local' }
      ]
    });
    const hostIssues = validateConfig(c).filter((issue) => issue.fieldId === 'hostEntry1');
    expect(hostIssues).toHaveLength(1);
    expect(hostIssues[0].list).toEqual({ id: 'wrp', index: 0 });
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
