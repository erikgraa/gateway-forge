import { render } from 'svelte/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyPatch, defaultConfig } from './model';
import { GROUPS, LISTS } from './schema';
import { generateIni, generateJsonObject } from './generate';
import { importIni, importJson } from './importer';
import { validateConfig } from './validate';
import { hostEntryValues, removeHostEntry } from './host-entries';
import HostEntryEditor from '../components/HostEntryEditor.svelte';
import AllowedOriginEditor from '../components/AllowedOriginEditor.svelte';
import RowListEditor from '../components/RowListEditor.svelte';
import FieldInput from '../components/FieldInput.svelte';

const horizonFields = GROUPS.find((g) => g.id === 'horizon')!.fields;
const hostFields = horizonFields.filter((f) => f.hostEntryIndex !== undefined);
const samlValues = {
  adminSaml_enable: true,
  adminSaml_entityId: 'https://idp.example.com',
  adminSaml_spEntityId: 'https://uag.example.com/admin',
  adminSaml_signAuthNRequest: true,
  saml_enabled: true,
  saml_entityID: 'https://idp.example.com',
  saml_metadataXmlFile: 'C:\\certs\\idp.xml'
};

describe('UAG workflow follow-ups', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders UAG types as buttons with standalone selected by default', () => {
    const field = GROUPS.find((group) => group.id === 'cascade')!.fields
      .find((candidate) => candidate.id === 'cascade_role')!;
    const body = render(FieldInput, { props: {
      field, values: { cascade_role: 'none' }, platform: 'vsphere'
    } }).body;
    expect(body).toContain('role="group"');
    expect(body).toContain('Standalone (default)');
    expect(body).toContain('aria-pressed="true"');
    expect(body).not.toContain('<select');
  });

  it('renders allowed origins as rows with per-origin flags', () => {
    const field = horizonFields.find((candidate) => candidate.id === 'origin')!;
    const body = render(AllowedOriginEditor, { props: {
      field,
      values: { origin: 'https://uag.example.com | true | false\nuag-internal.example.com | false | true' },
      platform: 'vsphere',
      issues: []
    } }).body;
    expect(body).toContain('Allowed origin 1');
    expect(body).toContain('Allowed origin 2');
    expect(body).toContain('Rewrite allowed origin 1');
    expect(body).toContain('Allowed origin 1 auto-generated');
    expect(body).toContain('https://uag.example.com');
    expect(body).toContain('uag-internal.example.com');
  });

  it('disables Horizon, Blast and Tunnel on both fresh browser load and reset', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    const { app } = await import('./store.svelte');
    const disabled = { horizon_enabled: false, blastEnabled: false, tunnelEnabled: false };
    expect(app.config.values).toMatchObject(disabled);
    app.config.values.horizon_enabled = true;
    app.config.values.blastEnabled = true;
    app.config.values.tunnelEnabled = true;
    app.clearDraft();
    expect(app.config.values).toMatchObject(disabled);
    expect(generateIni(app.config)).not.toContain('[Horizon]');
  });

  it('exports administrator SAML to INI and the documented settings JSON object', () => {
    const c = applyPatch(defaultConfig(), { values: samlValues });
    expect(generateIni(c)).toContain('[adminSAMLSettings]\nenable=true\nentityId=https://idp.example.com\nspEntityId=https://uag.example.com/admin\nsignAuthNRequestWithAdminCert=true');
    expect(generateJsonObject(c).adminSAMLSettings).toEqual({
      enable: true, entityId: samlValues.adminSaml_entityId,
      spEntityId: samlValues.adminSaml_spEntityId, signAuthNRequestWithAdminCert: true
    });
    expect(validateConfig(c).filter((i) => i.section === 'auth' && i.level === 'error')).toEqual([]);
  });

  it('round-trips administrator SAML in both formats without enabling Horizon', () => {
    const c = applyPatch(defaultConfig(), { values: samlValues });
    for (const result of [importIni(generateIni(c)), importJson(JSON.stringify(generateJsonObject(c)))]) {
      expect(result.config.values).toMatchObject({
        adminSaml_enable: true, adminSaml_entityId: samlValues.adminSaml_entityId,
        adminSaml_spEntityId: samlValues.adminSaml_spEntityId, adminSaml_signAuthNRequest: true
      });
      expect(result.config.values.horizon_enabled).toBe(false);
      expect(result.unmapped).toEqual([]);
    }
  });

  it('gates administrator SAML to 2609 and excludes it when disabled', () => {
    for (const c of [
      applyPatch(defaultConfig(), { version: '2606', values: samlValues }),
      applyPatch(defaultConfig(), { values: { ...samlValues, adminSaml_enable: false } })
    ]) {
      expect(generateIni(c)).not.toContain('[adminSAMLSettings]');
      expect(generateJsonObject(c).adminSAMLSettings).toBeUndefined();
    }
  });

  it('requires an administrator IdP and matching metadata', () => {
    const c = applyPatch(defaultConfig(), { values: { adminSaml_enable: true } });
    expect(validateConfig(c)).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: 'adminSaml_entityId', level: 'error' }),
      expect.objectContaining({ fieldId: 'saml_enabled', level: 'error' })
    ]));
    const mismatch = applyPatch(c, { values: { ...samlValues, saml_entityID: 'other-idp' } });
    expect(validateConfig(mismatch)).toContainEqual(expect.objectContaining({
      fieldId: 'adminSaml_entityId', message: expect.stringContaining('must match')
    }));
  });

  it('exports and imports separate admin PEM paths without putting paths into JSON', () => {
    const values = { adminCert_pemCerts: 'C:\\certs\\admin.pem', adminCert_pemPrivKey: 'C:\\certs\\admin.key' };
    const c = applyPatch(defaultConfig(), { values });
    expect(generateIni(c)).toContain('[SSLCertAdmin]\npemCerts=C:\\certs\\admin.pem\npemPrivKey=C:\\certs\\admin.key');
    expect(importIni(generateIni(c)).config.values).toMatchObject(values);
    expect(JSON.stringify(generateJsonObject(c))).not.toContain('C:\\\\certs');
    expect(validateConfig(c).filter((i) => i.fieldId?.startsWith('adminCert_'))).toEqual([]);
  });

  it('supports admin PFX and validates incomplete or conflicting certificate inputs', () => {
    const c = applyPatch(defaultConfig(), { values: { adminCert_pfxCerts: 'C:\\admin.pfx', adminCert_pfxCertAlias: 'admin' } });
    expect(generateIni(c)).toContain('[SSLCertAdmin]\npfxCerts=C:\\admin.pfx\npfxCertAlias=admin');
    expect(importIni(generateIni(c)).config.values).toMatchObject(c.values);
    expect(validateConfig(applyPatch(c, { values: { adminCert_pemCerts: 'C:\\admin.pem' } })))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ fieldId: 'adminCert_mode', level: 'error', message: expect.stringContaining('not both') })
      ]));
  });

  it('renders six populated host rows and disables addition at the limit for both services', () => {
    for (const group of GROUPS.filter((g) => g.id === 'horizon' || g.id === 'airwatch')) {
      const fields = group.fields.filter((f) => f.hostEntryIndex !== undefined);
      expect(fields).toHaveLength(6);
      const values = Object.fromEntries(fields.map((f, i) => [f.id, `192.0.2.${i + 1} host${i + 1}.example.com`]));
      const { body } = render(HostEntryEditor, { props: { fields, values, issues: [] } });
      expect(body).toContain('6 of 6');
      expect(body).toMatch(/disabled[^>]*aria-label="Add host entry"/);
      expect(body).toContain('Remove host entry 6');
    }
  });

  it('compacts removed host entries and exports contiguous INI keys plus Horizon JSON arrays', () => {
    const c = applyPatch(defaultConfig(), { values: {
      horizon_enabled: true, hostEntry1: '192.0.2.1 one.example.com', hostEntry6: '192.0.2.6 six.example.com'
    } });
    expect(hostEntryValues(c.values, hostFields)).toEqual(['192.0.2.1 one.example.com', '192.0.2.6 six.example.com']);
    removeHostEntry(c.values, hostFields, 0);
    expect(c.values.hostEntry1).toBe('192.0.2.6 six.example.com');
    expect(c.values.hostEntry2).toBe('');
    expect(generateIni(c)).toContain('hostEntry1=192.0.2.6 six.example.com');
    expect(generateIni(c)).not.toContain('hostEntry6=');
    const doc = generateJsonObject(c);
    const edges = doc.edgeServiceSettingsList as { edgeServiceSettingsList: Record<string, unknown>[] };
    expect(edges.edgeServiceSettingsList[0].hostEntries).toEqual(['192.0.2.6 six.example.com']);
    expect(edges.edgeServiceSettingsList[0].hostEntry1).toBeUndefined();
    expect(importJson(JSON.stringify(doc)).config.values.hostEntry1).toBe(c.values.hostEntry1);
  });

  it('preserves imported six-slot and legacy comma-backed Workspace ONE host lists', () => {
    const result = importIni('[Airwatch]\nhostEntry1=192.0.2.1 one.example.com,192.0.2.2 two.example.com\nhostEntry6=192.0.2.6 six.example.com');
    expect(result.unmapped).toEqual([]);
    expect(result.config.values.airwatch_hostEntry2).toBe('192.0.2.2 two.example.com');
    expect(generateIni(result.config)).toContain('hostEntry3=192.0.2.6 six.example.com');
    const oversized = applyPatch(defaultConfig(), { values: {
      airwatch_enabled: true,
      airwatch_hostEntry1: Array.from({ length: 7 }, (_, i) => `192.0.2.${i + 1} host${i + 1}.example.com`).join(',')
    } });
    expect(validateConfig(oversized)).toContainEqual(expect.objectContaining({ message: expect.stringContaining('maximum of six') }));
    expect(oversized.values.airwatch_hostEntry6).toContain('host7.example.com');
  });

  it('keeps WRP host-entry rows isolated and exports contiguous keys per instance', () => {
    const wrpFields = LISTS.find((list) => list.id === 'wrp')!.fields;
    const c = applyPatch(defaultConfig(), {
      wrp: [
        { instanceId: 'one', proxyDestinationUrl: 'https://one.local', hostEntry1: '10.0.0.1 one.local', hostEntry6: '10.0.0.6 six-one.local' },
        { instanceId: 'two', proxyDestinationUrl: 'https://two.local', hostEntry1: '10.0.0.2 two.local' }
      ]
    });
    expect(render(HostEntryEditor, {
      props: { fields: wrpFields.filter((field) => field.hostEntryIndex !== undefined), values: c.wrp[0], issues: [], uid: 'wrp0', list: { id: 'wrp', index: 0 } }
    }).body).toContain('2 of 6');
    expect(c.wrp[0]).toMatchObject({ hostEntry1: '10.0.0.1 one.local', hostEntry2: '10.0.0.6 six-one.local' });
    expect(c.wrp[1].hostEntry2).toBe('');
    const ini = generateIni(c);
    expect(ini).toMatch(/\[WebReverseProxy1\][\s\S]*hostEntry1=10\.0\.0\.1 one\.local\nhostEntry2=10\.0\.0\.6 six-one\.local/);
    expect(ini).toMatch(/\[WebReverseProxy2\][\s\S]*hostEntry1=10\.0\.0\.2 two\.local/);
  });

  it('edits Additional Blast URLs as rows while preserving INI/JSON representations and validation', () => {
    const field = horizonFields.find((f) => f.id === 'additionalBlastExternalUrls')!;
    const c = applyPatch(defaultConfig(), { values: {
      horizon_enabled: true, blastEnabled: true,
      additionalBlastExternalUrls: 'https://one.example.com:8443,https://two.example.com:443'
    } });
    expect(render(RowListEditor, { props: { field, values: c.values, platform: 'vsphere', issues: [] } }).body)
      .toContain('aria-label="Remove blast external url 2"');
    expect(generateIni(c)).toContain('additionalBlastExternalUrls=https://one.example.com:8443,https://two.example.com:443');
    expect(JSON.stringify(generateJsonObject(c))).toContain('"additionalBlastExternalUrls":["https://one.example.com:8443","https://two.example.com:443"]');
    c.values.additionalBlastExternalUrls = 'https://one.example.com,bad-url';
    expect(validateConfig(c)).toContainEqual(expect.objectContaining({ fieldId: field.id, rowIndex: 1, level: 'error' }));
  });

  it('renders NIC0-NIC2 static routes as separate network and gateway fields', () => {
    const fields = GROUPS.find((group) => group.id === 'networking')!.fields.filter((field) => /^routes[0-2]$/.test(field.id));
    const c = applyPatch(defaultConfig(), {
      values: {
        deploymentOption: 'threenic',
        routes0: '10.0.0.0/8 192.0.2.1,10.1.0.0/16 192.0.2.1',
        routes1: '172.16.0.0/12 10.0.0.1',
        routes2: '192.168.0.0/16 10.20.0.1'
      }
    });
    expect(fields).toHaveLength(3);
    const gateways = ['192.0.2.1', '10.0.0.1', '10.20.0.1'];
    for (const [index, field] of fields.entries()) {
      const body = render(RowListEditor, { props: { field, values: c.values, platform: 'vsphere', issues: [] } }).body;
      expect(body).toContain('aria-label="Add static route"');
      expect(body).toContain('aria-label="Static route 1 network"');
      expect(body).toContain('aria-label="Static route 1 gateway"');
      expect(body).toContain(`value="${gateways[index]}"`);
    }
    expect(generateIni(c)).toContain('routes0=10.0.0.0/8 192.0.2.1,10.1.0.0/16 192.0.2.1');
  });

  it('labels NIC1 management-only and NIC2 backend-only for three NICs without changing two-NIC roles', () => {
    const fields = GROUPS.find((g) => g.id === 'networking')!.fields;
    const renderField = (id: string, option: string) => render(FieldInput, { props: {
      field: fields.find((f) => f.id === id)!, values: { deploymentOption: option }, platform: 'vsphere'
    } }).body;
    expect(renderField('netManagementNetwork', 'threenic')).toContain('Management-only network NIC1');
    expect(renderField('ip1', 'threenic')).toContain('NIC1 Management-only IPv4');
    expect(renderField('ip2', 'threenic')).toContain('NIC2 Backend-only IPv4');
    expect(renderField('netManagementNetwork', 'twonic')).toContain('Management / Backend network (NIC1)');
    expect(render(FieldInput, { props: {
      field: fields.find((field) => field.id === 'ipmode1')!,
      values: { deploymentOption: 'twonic', ipmode1: 'STATICV4' },
      platform: 'vsphere'
    } }).body).toContain('required=""');
  });
});
