import { describe, expect, it } from 'vitest';
import { GROUPS, displayFieldLabel } from './schema';
import { defaultConfig, applyPatch, fieldAvailable, promoteIniExtras } from './model';
import { generateIni, generateJsonObject } from './generate';
import { importIni } from './importer';
import { validateConfig } from './validate';
import { legacyConfiguration } from './scenario-workspaces';
import { PLATFORMS } from './versions';
const field = (id: string) => GROUPS.flatMap(g => g.fields).find(f => f.id === id)!;
const azure = () => { const c = defaultConfig(); c.platform = 'azure'; return c; };
describe('Evidence-backed Azure/TLS settings and legacy promotion', () => {
  it('exposes the working optional VNet resource group without an ignored-flag toggle or gate', () => {
    const c = azure(), f = field('az_vNetResourceGroupName');
    expect(f.key).toBe('vNetResourceGroupName'); expect(f.required).not.toBe(true); expect(f.json).toBe(false); expect(f.showIf).toBeUndefined();
    expect(f.label).toBe('Virtual network resource group'); expect(f.help).toContain('resourceGroupName');
    expect(GROUPS.flatMap(g => g.fields).some(f => f.key === 'isVNetInDifferentResourceGroup')).toBe(false);
    expect(generateIni(c)).not.toContain('isVNetInDifferentResourceGroup');
  });
  it('round-trips the old ignored flag and unrelated opaque spelling without interpreting them', () => {
    const imported = importIni('[Azure]\nvNetResourceGroupName=Networking RG\nisVNetInDifferentResourceGroup=false\nfutureSetting=  Preserve  Internal  Spelling  ').config;
    expect(imported.values.az_vNetResourceGroupName).toBe('Networking RG');
    const text = generateIni(imported); expect(text).toContain('vNetResourceGroupName=Networking RG'); expect(text).toContain('isVNetInDifferentResourceGroup=false'); expect(text).toContain('futureSetting=  Preserve  Internal  Spelling  ');
  });
  it.each(PLATFORMS.map(p => p.id))('supports the INI-only TLS cipher preference on %s', platform => {
    const c = defaultConfig(); c.platform = platform; const f = field('honorCipherOrder');
    expect(c.values.honorCipherOrder).toBe(true); expect(fieldAvailable(f,c.version,c.platform,c.values)).toBe(true);
    c.values.honorCipherOrder = false; expect(generateIni(c)).toContain('honorCipherOrder=false');
    expect(JSON.stringify(generateJsonObject(c))).not.toContain('honorCipherOrder');
    expect(f.showIf).toBeUndefined();
  });
  it.each(['onenic','twonic','threenic'])('requires only the applicable indexed subnets for %s and retains hidden values', deploymentOption => {
    const c = azure(); c.values.deploymentOption = deploymentOption;
    const count = deploymentOption === 'onenic' ? 1 : deploymentOption === 'twonic' ? 2 : 3;
    const errors = validateConfig(c).filter(i => i.fieldId?.startsWith('az_subnetName') && i.level === 'error');
    expect(errors.map(i => i.fieldId)).toEqual(Array.from({length:count},(_,i) => `az_subnetName${i}`));
    for (let i=0;i<3;i++) c.values[`az_subnetName${i}`] = `Subnet ${i}`;
    const text = generateIni(c); for (let i=0;i<3;i++) { expect(c.values[`az_subnetName${i}`]).toBe(`Subnet ${i}`); expect(text.includes(`subnetName${i}=Subnet ${i}`)).toBe(i<count); }
    expect(validateConfig(c).filter(i => i.fieldId?.startsWith('az_subnetName') && i.level==='error')).toEqual([]);
  });
  it('uses Management-only NIC1 labels on three NICs', () => {
    const c = azure(); c.values.deploymentOption = 'threenic'; expect(displayFieldLabel(field('az_subnetName1'),c.values)).toContain('Management'); expect(displayFieldLabel(field('az_subnetName1'),c.values)).not.toContain('Backend');
  });
  it('keeps PIP resource group hidden and un-emitted until the resource name is set', () => {
    const c=azure(); c.values.az_publicIpAddrResourceGroupName='Public IP RG'; c.values.az_vNetResourceGroupName='VNet RG';
    expect(generateIni(c)).not.toContain('publicIpAddrResourceGroupName='); expect(generateIni(c)).toContain('vNetResourceGroupName=VNet RG');
    c.values.az_publicIPAddressName0='Public IP Resource'; expect(generateIni(c)).toContain('publicIPAddressName0=Public IP Resource'); expect(generateIni(c)).toContain('publicIpAddrResourceGroupName=Public IP RG');
    c.values.az_publicIpAddrResourceGroupName=''; expect(generateIni(c)).not.toContain('publicIpAddrResourceGroupName='); expect(field('az_publicIpAddrResourceGroupName').help).toContain('VM deployment resource group');
  });
  it('fresh INI parsing preserves explicit honor=false and both resource names', () => {
    const c=importIni('[General]\nhonorCipherOrder=false\n[Azure]\npublicIPAddressName0=Public IP Name\nvNetResourceGroupName=Network RG').config;
    expect(c.values.honorCipherOrder).toBe(false); expect(c.values.az_publicIPAddressName0).toBe('Public IP Name'); expect(c.values.az_vNetResourceGroupName).toBe('Network RG'); expect(c.iniExtras).toEqual([]);
    const text=generateIni(c); expect(text.match(/^honorCipherOrder=/gm)).toHaveLength(1); expect(text.match(/^publicIPAddressName0=/gm)).toHaveLength(1); expect(text.match(/^vNetResourceGroupName=/gm)).toHaveLength(1);
  });
  it.each(['merge','stored-resume','direct-export'])('promotes old extras before new defaults through %s without mutating the original', path => {
    const old=azure(); delete old.values.honorCipherOrder; delete old.values.az_publicIPAddressName0; delete old.values.az_vNetResourceGroupName;
    old.iniExtras=[{section:'General',key:'honorCipherOrder',value:'false'},{section:'Azure',key:'publicIPAddressName0',value:'Public IP Name'},{section:'Azure',key:'vNetResourceGroupName',value:'Legacy Network RG'},{section:'Azure',key:'isVNetInDifferentResourceGroup',value:'false'},{section:'Azure',key:'opaqueFutureKey',value:' preserve me  '}];
    const raw=JSON.stringify(old), c=path==='merge'?applyPatch(defaultConfig(),old):path==='stored-resume'?legacyConfiguration(raw):promoteIniExtras(old);
    expect(c.values.honorCipherOrder).toBe(false); expect(c.values.az_publicIPAddressName0).toBe('Public IP Name'); expect(c.values.az_vNetResourceGroupName).toBe('Legacy Network RG'); expect(c.iniExtras).toHaveLength(2);
    const text=generateIni(path==='direct-export'?old:c); expect(text.match(/^honorCipherOrder=/gm)).toHaveLength(1); expect(text).toContain('honorCipherOrder=false'); expect(text.match(/^publicIPAddressName0=/gm)).toHaveLength(1); expect(text.match(/^vNetResourceGroupName=/gm)).toHaveLength(1); expect(text).toContain('isVNetInDifferentResourceGroup=false'); expect(text).toContain('opaqueFutureKey= preserve me  '); expect(JSON.stringify(old)).toBe(raw);
  });
  it('explicit typed values win over stale opaque duplicates, including an explicit true', () => {
    const old=azure(); old.values.honorCipherOrder=true; old.values.az_publicIPAddressName0='Known PIP'; old.values.az_vNetResourceGroupName='Known RG'; old.iniExtras=[{section:'GENERAL',key:'HONORCIPHERORDER',value:'false'},{section:'Azure',key:'publicIPAddressName0',value:'Old PIP'},{section:'Azure',key:'vNetResourceGroupName',value:'Old RG'}];
    const c=applyPatch(defaultConfig(),old), text=generateIni(c); expect(c.values.honorCipherOrder).toBe(true); expect(c.iniExtras).toEqual([]); expect(text).toContain('honorCipherOrder=true'); expect(text).toContain('publicIPAddressName0=Known PIP'); expect(text).toContain('vNetResourceGroupName=Known RG'); expect(text).not.toContain('Old RG');
  });
});
