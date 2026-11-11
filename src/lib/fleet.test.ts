import { describe, expect, it } from 'vitest';
import { freshFleet, unlockFleet, addMember, addGroup, activeMembers, editMember, setDestination, removeMember, removeGroup, undoRemoval, moveMember, fleetIssues, nicRows, copy, propagate } from './fleet';
import { fleetBundle, importFleet, safeLabel, zipBytes } from './fleet-export';
import { validateConfig } from './validate';
import { createWorkspace, emptyRegistry, savedRegistry, upgradedRegistry, registryShape, legacyConfiguration, safeImport } from './scenario-workspaces';
function baseline() {
 const f=freshFleet(); Object.assign(f.members[0].config.values,{name:'review-uag',uagName:'review-uag',source:'C:\\images\\euc-unified-access-gateway-demo.ova',target:'vi://operator@vc.example.com/Datacenter/host/Compute',ds:'Datastore',deploymentOption:'threenic',netInternet:'DMZ',netManagementNetwork:'Management',netBackendNetwork:'Backend',ipmode0:'STATICV4',ipmode1:'STATICV4',ipmode2:'STATICV4',ip0:'198.51.100.21',netmask0:'255.255.255.0',ip1:'192.0.2.21',netmask1:'255.255.255.0',ip2:'198.18.0.21',netmask2:'255.255.255.0',defaultGateway:'198.51.100.1',dns:'192.0.2.53',ntpServers:'ntp.example.com',proxyDestinationUrl:'https://cs.example.com'});
 expect(validateConfig(f.members[0].config).filter(i=>i.level==='error')).toEqual([]); unlockFleet(f); return f;
}
function configureGroupNetwork(fleet: ReturnType<typeof freshFleet>, group: ReturnType<typeof addGroup>) {
 for (const key of ['netmask0','netmask1','netmask2','defaultGateway','dns']) group.templateConfig.values[key] = fleet.groups[0].templateConfig.values[key];
}
function pair() { const f=baseline(), m=addMember(f,f.groups[0]);Object.assign(m.config.values,{ip0:'198.51.100.22',ip1:'192.0.2.22',ip2:'198.18.0.22'});return f; }
describe('Native fleet templates, checked exports and fixed workspaces',()=>{
 it('safely upgrades an old draft with missing newer lists without changing its raw spelling',()=>{const config=baseline().members[0].config;const old=JSON.parse(JSON.stringify(config));delete old.oidc;delete old.values.honorCipherOrder;old.iniExtras=[{section:'General',key:'honorCipherOrder',value:'false'},{section:'Legacy',key:'unknown',value:' exact  '}];const raw=JSON.stringify(old), upgraded=legacyConfiguration(raw);expect(upgraded.oidc).toEqual([]);expect(upgraded.values.honorCipherOrder).toBe(false);expect(upgraded.iniExtras).toEqual([{section:'Legacy',key:'unknown',value:' exact  '}]);expect(JSON.stringify(old)).toBe(raw);});
 it('does not serialize raw/partial unsupported import passwords',()=>{const r=emptyRegistry(),w=createWorkspace('single','safe');r.drafts.push(w);w.retainedImports.push({filename:'raw.json',raw:'password=sentinel secret'},{values:{adminPassword:'sentinel secret'}});expect(JSON.stringify(savedRegistry(r))).not.toContain('sentinel secret');expect(safeImport(w.retainedImports[0])).toEqual({filename:'raw.json',metadataOnly:true});expect(w.retainedImports[0]).toHaveProperty('raw');});
 it('resumes compatible legacy topology names without changing individual destination intent',()=>{const f=pair();const legacy={format:'gateway-forge-scenarios-review-4',workspace:{unlocked:true,nextNodeId:f.nextMember,nextGroupId:f.nextGroup,pendingDestinations:[],groups:f.groups.map(g=>({...g,members:[1,2],subnetAnchors:g.subnetAnchors.map(ip=>({ip}))})),nodes:f.members.map(m=>({...m,parked:false,destinationIntent:m.id===2?'individual':'group'}))}};const resumed=importFleet(JSON.stringify(legacy));expect(resumed.members[1].individualDestination).toBe(true);expect(resumed.members[1].config.values.ip1).toBe('192.0.2.22');expect(resumed.groups[0].templateId).toBe(1);});
 it('refuses unsupported old configuration versions/platforms rather than silently defaulting',()=>{expect(()=>legacyConfiguration(JSON.stringify({version:'9999',platform:'azure',values:{}}))).toThrow();expect(()=>legacyConfiguration(JSON.stringify({version:'2609',platform:'unknown',values:{}}))).toThrow();});
 it('promotes newly recognized fields in stored scenario workspaces without mutating raw originals',()=>{const r=emptyRegistry(),w=createWorkspace('single','old');r.drafts.push(w);delete w.config.values.honorCipherOrder;w.config.iniExtras=[{section:'General',key:'honorCipherOrder',value:'false'}];const before=JSON.stringify(r),upgraded=upgradedRegistry(r);expect(upgraded.drafts[0].config.values.honorCipherOrder).toBe(false);expect(upgraded.drafts[0].config.iniExtras).toEqual([]);expect(JSON.stringify(r)).toBe(before);});
 it('shows applicable real NIC0 IPv6 while retaining independent addresses',()=>{const f=pair();f.members[0].config.values.v6ip0='2001:db8::21';f.members[0].config.values.v6ipprefix0=64;expect(nicRows(f.members[0].config)[0].value).toContain('IPv6 2001:db8::21/64');expect(nicRows(f.members[0].config).slice(1).every(n=>n.ipv6===undefined)).toBe(true);f.members[0].config.platform='azure';expect(nicRows(f.members[0].config)[0].ipv6).toBeUndefined();});
 it('blocks inconsistent actual per-member HA without rewriting imported settings',()=>{const f=pair();f.members[1].config.values.ha_enabled=true;f.members[1].config.values.ha_groupId=20;f.members[1].config.values.ha_virtualIPAddress='198.51.100.99';const before=JSON.stringify(f);expect(fleetIssues(f).some(i=>i.message.includes('differ from the shared group template'))).toBe(true);expect(()=>fleetBundle(f)).toThrow();expect(JSON.stringify(f)).toBe(before);});
 it('rejects unsupported future topology formats rather than claiming safe compatibility',()=>{const f=pair();expect(()=>importFleet(JSON.stringify({format:'gateway-forge-fleet-999',workspace:f}))).toThrow('Not a supported');});
 it('starts with a single genuine blank member and rejects an incomplete baseline',()=>{const f=freshFleet();expect(activeMembers(f)).toHaveLength(1);expect(f.unlocked).toBe(false);expect(()=>unlockFleet(f)).toThrow();});
 it('adds members with no inherited addresses and independent names',()=>{const f=baseline(), m=addMember(f,f.groups[0]);expect([m.config.values.ip0,m.config.values.ip1,m.config.values.ip2]).toEqual(['','','']);expect(m.config.values.name).not.toBe(f.members[0].config.values.name);});
 it('starts a new UAG group with blank network settings and no inherited subnet anchors',()=>{
  const f=baseline(); Object.assign(f.groups[0].templateConfig.values,{v6ip0:'2001:db8::21',v6ipprefix0:64,v6DefaultGateway:'2001:db8::1',dnsSearch:'old.example.com',routes0:'198.18.0.0/24 198.51.100.1',routes1:'192.0.2.0/24 192.0.2.1',routes2:'198.18.1.0/24 198.18.0.1',eth0CustomConfig:'[Network]^DNS=192.0.2.53',eth1CustomConfig:'[Network]^Gateway=192.0.2.1',eth2CustomConfig:'[Network]^Address=198.18.0.21/24'});
  const original=JSON.stringify({group:f.groups[0],member:f.members[0]}), group=addGroup(f), member=addMember(f,group);
  for(const key of ['ip0','ip1','ip2','v6ip0','v6ipprefix0','netmask0','netmask1','netmask2','defaultGateway','v6DefaultGateway','dns','dnsSearch','routes0','routes1','routes2','eth0CustomConfig','eth1CustomConfig','eth2CustomConfig']) {
   expect(group.templateConfig.values[key],key).toBe(''); expect(member.config.values[key],key).toBe('');
  }
  expect(group.subnetAnchors).toEqual(['','','']); expect(member.config.values.proxyDestinationUrl).toBe('https://cs.example.com');
  expect(JSON.stringify({group:f.groups[0],member:f.members[0]})).toBe(original);
 });
 it('shares only the new group owner network settings with followers and validates against its own subnet',()=>{
  const f=baseline(), group=addGroup(f), owner=addMember(f,group), config=copy(owner.config);
  Object.assign(config.values,{ip0:'203.0.113.21',ip1:'192.0.2.121',ip2:'198.18.1.21',netmask0:'255.255.255.0',netmask1:'255.255.255.0',netmask2:'255.255.255.0',defaultGateway:'203.0.113.1',dns:'203.0.113.53'}); editMember(f,owner.id,config);
  const follower=addMember(f,group); expect(follower.config.values.ip0).toBe(''); expect(follower.config.values.dns).toBe('203.0.113.53'); expect(follower.config.values.defaultGateway).toBe('203.0.113.1');
  Object.assign(follower.config.values,{ip0:'203.0.113.22',ip1:'192.0.2.122',ip2:'198.18.1.22'});
  expect(fleetIssues(f).filter(i=>i.level==='error')).toEqual([]);
  follower.config.values.ip0='198.51.100.23'; expect(fleetIssues(f).some(i=>i.memberId===follower.id&&i.message.includes('stable group template subnet'))).toBe(true);
  expect(f.members[0].config.values.dns).toBe('192.0.2.53');
 });
 it('keeps follower identity and destination override when the stable owner changes shared settings',()=>{const f=pair(), c=copy(f.members[1].config);c.values.proxyDestinationUrl='https://individual.example.com';editMember(f,2,c);const owner=copy(f.members[0].config);owner.values.dns='192.0.2.54';editMember(f,1,owner);expect(f.members[1].config.values.dns).toBe('192.0.2.54');expect(f.members[1].config.values.ip0).toBe('198.51.100.22');expect(f.members[1].config.values.proxyDestinationUrl).toBe('https://individual.example.com');setDestination(f,f.groups[0],'https://new-group.example.com');expect(f.members[1].config.values.proxyDestinationUrl).toBe('https://individual.example.com');});
 it('does not turn arbitrary group counts into presets or erase removed drafts',()=>{const f=pair(), g=addGroup(f);addMember(f,g);expect(activeMembers(f,f.groups[0].id)).toHaveLength(2);expect(activeMembers(f,g.id)).toHaveLength(1);removeMember(f,2);expect(activeMembers(f)).toHaveLength(2);undoRemoval(f);expect(f.members[1].config.values.ip2).toBe('198.18.0.22');removeGroup(f,g.id);expect(activeMembers(f,g.id)).toHaveLength(0);undoRemoval(f);expect(activeMembers(f,g.id)).toHaveLength(1);});
 it('retains the shared snapshot after removing the template owner',()=>{const f=pair();removeMember(f,1);const before=JSON.stringify(f.groups[0].templateConfig);addMember(f,f.groups[0]);expect(JSON.stringify(f.groups[0].templateConfig)).toBe(before);undoRemoval(f);expect(f.members[0].config.values.ip0).toBe('198.51.100.21');});
 it('adopts destination shared fields while preserving individual addresses on explicit move',()=>{const f=pair(), g=addGroup(f);setDestination(f,g,'https://second.example.com');g.templateConfig.values.dns='192.0.2.60';moveMember(f,f.members[1],g);expect(f.members[1].config.values.proxyDestinationUrl).toBe('https://second.example.com');expect(f.members[1].config.values.ip0).toBe('198.51.100.22');expect(f.members[1].config.values.dns).toBe('192.0.2.60');});
 it('blocks a member gateway equal to its NIC0 in fleet validation and checked exports without changing imported data',()=>{const f=pair();f.members[1].config.values.defaultGateway=f.members[1].config.values.ip0;const before=JSON.stringify(f);const issues=fleetIssues(f).filter(i=>i.memberId===2&&i.message.includes('Default gateway must differ'));expect(issues.map(i=>i.fieldId)).toEqual(['defaultGateway','ip0']);expect(issues.every(i=>i.level==='error')).toBe(true);expect(()=>fleetBundle(f)).toThrow('Resolve fleet validation errors');expect(JSON.stringify(f)).toBe(before);f.members[1].config.values.defaultGateway='198.51.100.1';expect(fleetIssues(f).filter(i=>i.level==='error')).toEqual([]);expect(fleetBundle(f).filter(x=>x.name.endsWith('.ini'))).toHaveLength(2);});
 it('rejects an extension-only source in the baseline and checked fleet exports without rewriting it',()=>{const f=baseline();const config=copy(f.members[0].config);config.values.source='C:\\images\\.ova';editMember(f,1,config);const before=JSON.stringify(f);expect(fleetIssues(f)).toContainEqual(expect.objectContaining({level:'error',fieldId:'source',message:expect.stringContaining('filename before the .ova extension')}));expect(()=>fleetBundle(f)).toThrow('Resolve fleet validation errors');expect(JSON.stringify(f)).toBe(before);f.unlocked=false;expect(()=>unlockFleet(f)).toThrow('Complete a valid Horizon baseline');});
 it('blocks cross-member collisions and out-of-anchor-subnet addresses',()=>{const f=pair();f.members[1].config.values.ip2=f.members[0].config.values.ip0;expect(fleetIssues(f).filter(i=>i.message.includes('collides'))).toHaveLength(2);f.members[1].config.values.ip2='198.19.0.22';expect(fleetIssues(f).some(i=>i.message.includes('stable group template subnet'))).toBe(true);});
 it('identifies both sides of address collisions by INI name, not appliance hostname', () => {
  const f = pair();
  Object.assign(f.members[0].config.values, { name: 'ini-edge-a', uagName: 'os-host-a' });
  Object.assign(f.members[1].config.values, { name: 'ini-edge-b', uagName: 'os-host-b', ip2: f.members[0].config.values.ip0 });
  const before = JSON.stringify(f), issues = fleetIssues(f).filter(i => i.message.includes('collides'));
  expect(issues).toContainEqual(expect.objectContaining({ memberId: 1, fieldId: 'ip0', message: 'Address 198.51.100.21 collides with UAG “ini-edge-b” (#2) NIC2.' }));
  expect(issues).toContainEqual(expect.objectContaining({ memberId: 2, fieldId: 'ip2', message: 'Address 198.51.100.21 collides with UAG “ini-edge-a” (#1) NIC0.' }));
  expect(issues.every(i => !i.message.includes('os-host-'))).toBe(true);
  expect(JSON.stringify(f)).toBe(before);
  expect(() => fleetBundle(f)).toThrow('Resolve fleet validation errors');
 });
 it('disambiguates duplicate INI names using member IDs and labels hostname conflicts with INI names', () => {
  const f = pair();
  for (const member of f.members) Object.assign(member.config.values, { name: 'same-ini-name', uagName: 'same-hostname' });
  const issues = fleetIssues(f).filter(i => i.fieldId === 'name' || i.fieldId === 'uagName');
  for (const fieldId of ['name', 'uagName']) {
   expect(issues).toContainEqual(expect.objectContaining({ memberId: 1, fieldId, message: expect.stringContaining('UAG “same-ini-name” (#2)') }));
   expect(issues).toContainEqual(expect.objectContaining({ memberId: 2, fieldId, message: expect.stringContaining('UAG “same-ini-name” (#1)') }));
  }
 });
 it('falls back to the member ID for a missing INI name without substituting the OS hostname', () => {
  const f = pair(); Object.assign(f.members[1].config.values, { name: '', uagName: 'not-the-ini-name', ip2: f.members[0].config.values.ip0 });
  const issue = fleetIssues(f).find(i => i.memberId === 1 && i.message.includes('collides'));
  expect(issue?.message).toBe('Address 198.51.100.21 collides with UAG 2 NIC2.');
 });
 it('names the conflicting appliance and NIC in VIP collisions and excludes removed members', () => {
  const f = pair(); f.members[0].config.values.name = 'ini-vip-conflict';
  Object.assign(f.groups[0].templateConfig.values, { ha_enabled: true, ha_virtualIPAddress: f.members[0].config.values.ip0 });
  expect(fleetIssues(f).find(i => i.message.includes('VIP collides'))?.message).toContain('UAG “ini-vip-conflict” (#1) NIC0');
  removeMember(f, 1);
  expect(fleetIssues(f).some(i => i.message.includes('VIP collides'))).toBe(false);
 });
 it('blocks HA with one member, duplicate appliance VIP and off-subnet VIP without rewriting imported HA',()=>{const f=pair();f.groups[0].templateConfig.values.ha_enabled=true;f.groups[0].templateConfig.values.ha_virtualIPAddress='198.51.100.21';expect(fleetIssues(f).some(i=>i.message.includes('VIP collides'))).toBe(true);f.groups[0].templateConfig.values.ha_virtualIPAddress='192.0.2.99';expect(fleetIssues(f).some(i=>i.message.includes('Internet NIC0 subnet'))).toBe(true);removeMember(f,2);expect(fleetIssues(f).some(i=>i.message.includes('at least two'))).toBe(true);});
 it('blocks duplicate active HA Group IDs and VIPs without rewriting imports, and excludes removed or disabled groups',()=>{
  const f=pair(), second=addGroup(f); configureGroupNetwork(f,second);
  for(const last of [23,24]) { const node=addMember(f,second); Object.assign(node.config.values,{ip0:`198.51.100.${last}`,ip1:`192.0.2.${last}`,ip2:`198.18.0.${last}`}); }
  for(const [index,group] of f.groups.entries()) { Object.assign(group.templateConfig.values,{ha_enabled:true,ha_groupId:index?'041':41,ha_virtualIPAddress:`198.51.100.${99-index}`}); propagate(f,group); }
  const before=JSON.stringify(f);
  expect(fleetIssues(f).filter(i=>i.id.startsWith('fleet-')&&i.fieldId==='ha_groupId')).toHaveLength(4);
  expect(()=>fleetBundle(f)).toThrow('Resolve fleet validation errors'); expect(JSON.stringify(f)).toBe(before);
  second.templateConfig.values.ha_groupId=42; propagate(f,second); expect(fleetIssues(f).filter(i=>i.level==='error')).toEqual([]);
  second.templateConfig.values.ha_virtualIPAddress='198.51.100.99'; propagate(f,second);
  expect(fleetIssues(f).filter(i=>i.message==='Active HA groups must use distinct VIPs.')).toHaveLength(4);
  removeGroup(f,second.id); expect(fleetIssues(f).filter(i=>i.level==='error')).toEqual([]); undoRemoval(f);
  second.templateConfig.values.ha_enabled=false; propagate(f,second); expect(fleetIssues(f).filter(i=>i.level==='error')).toEqual([]);
 });
 it('keeps HA Group IDs unique across different NIC0 subnets and ignores unsupported retained HA',()=>{
  const f=pair(), second=addGroup(f); configureGroupNetwork(f,second); second.subnetAnchors[0]='198.51.101.23'; second.templateConfig.values.defaultGateway='198.51.101.1';
  for(const last of [23,24]) { const node=addMember(f,second); Object.assign(node.config.values,{ip0:`198.51.101.${last}`,ip1:`192.0.2.${last}`,ip2:`198.18.0.${last}`}); }
  for(const [index,group] of f.groups.entries()) { Object.assign(group.templateConfig.values,{ha_enabled:true,ha_groupId:41,ha_virtualIPAddress:`198.51.${100+index}.99`}); propagate(f,group); }
  expect(fleetIssues(f).filter(i=>i.id.startsWith('fleet-')&&i.fieldId==='ha_groupId')).toHaveLength(4);
  second.templateConfig.values.ha_groupId=42; propagate(f,second); expect(fleetIssues(f).filter(i=>i.level==='error')).toEqual([]);
  second.templateConfig.platform='azure'; second.templateConfig.values.ha_groupId=41; propagate(f,second);
  expect(fleetIssues(f).filter(i=>i.id.startsWith('fleet-')&&i.fieldId==='ha_groupId')).toEqual([]);
 });
 it('shows all applicable role-labelled NICs, not stale inactive values',()=>{const f=pair();expect(nicRows(f.members[0].config).map(n=>n.role)).toEqual(['Internet','Management','Backend']);f.members[0].config.values.deploymentOption='twonic';expect(nicRows(f.members[0].config).map(n=>n.role)).toEqual(['Internet','Management / Backend']);});
 it('creates deterministic safe collision-proof group/member paths and linked current manifests',()=>{const f=pair();f.groups[0].label='../CON';const g=addGroup(f,'..\\con');configureGroupNetwork(f,g);const n=addMember(f,g);Object.assign(n.config.values,{ip0:'198.51.100.23',ip1:'192.0.2.23',ip2:'198.18.0.23'});const files=fleetBundle(f), ini=files.filter(x=>x.name.endsWith('.ini'));expect(ini).toHaveLength(3);expect(new Set(ini.map(x=>x.name.toLowerCase())).size).toBe(3);expect(ini.every(x=>x.name.split('/').length===2&&!x.name.includes('../'))).toBe(true);const manifest=JSON.parse(files.find(x=>x.name==='topology.json')!.text);manifest.nodes.forEach((node:{iniFile:string;config:{values:{name:string}}})=>expect(files.find(x=>x.name===node.iniFile)!.text).toContain('name='+node.config.values.name));expect(files.some(x=>x.name==='topology-review.json')).toBe(false);expect(files.find(x=>x.name==='README.txt')!.text).toContain('[ ]');expect(files.find(x=>x.name==='README.txt')!.text).toContain('reachable group VIP or public/NAT address for direct access');expect(files.find(x=>x.name==='README.txt')!.text).toContain('load-balancer frontend or health-aware DNS/GSLB routing when used');expect(files.find(x=>x.name==='README.txt')!.text).not.toContain('create a DNS A record');expect(importFleet(JSON.stringify(manifest)).members).toHaveLength(3);expect(zipBytes(files).slice(0,4)).toEqual(new Uint8Array([80,75,3,4]));});
 it('exports space-free INI paths without changing labels, contents or round-trip data', () => {
   const fleet = pair();
   fleet.groups[0].label = 'Site A';
   fleet.members[0].config.values.name = 'edge-uag';
   fleet.members[0].config.values.netInternet = 'DMZ Network';
   fleet.members[1].config.values.name = 'edge-uag-2';
   const before = JSON.stringify(fleet);
   expect(fleetIssues(fleet).filter(issue => issue.level === 'error')).toEqual([]);
   const files = fleetBundle(fleet);
   const iniFiles = files.filter(file => file.name.endsWith('.ini'));
   expect(iniFiles.map(file => file.name)).toEqual([
     'Site-A--g1/edge-uag--uag-1.ini',
     'Site-A--g1/edge-uag-2--uag-2.ini'
   ]);
   expect(iniFiles.every(file => !/\s/u.test(file.name))).toBe(true);
   expect(iniFiles[0].text).toContain('name=edge-uag');
   expect(iniFiles[0].text).toContain('netInternet=DMZ Network');
   expect(iniFiles[1].text).toContain('name=edge-uag-2');
   const manifest = JSON.parse(files.find(file => file.name === 'topology.json')!.text);
   expect(manifest.nodes.map((node: { iniFile: string }) => node.iniFile)).toEqual(iniFiles.map(file => file.name));
   const readme = files.find(file => file.name === 'README.txt')!.text;
   for (const file of iniFiles) expect(readme).toContain(file.name);
   const restored = importFleet(JSON.stringify(manifest));
   expect(restored.groups.map(group => ({ id: group.id, label: group.label }))).toEqual(fleet.groups.map(group => ({ id: group.id, label: group.label })));
   expect(restored.members.map(member => ({ id: member.id, groupId: member.groupId, values: member.config.values }))).toEqual(fleet.members.map(member => ({ id: member.id, groupId: member.groupId, values: member.config.values })));
   expect(JSON.stringify(fleet)).toBe(before);
 });
 it.each(['edge uag', 'edge\tuag', 'edge\u00a0uag', 'edge\u2003uag'])('replaces whitespace in export label %s with a hyphen', label => {
   expect(safeLabel(label, 'UAG')).toBe('edge-uag');
 });
 it.each(['CON','prn.txt','NUL','...','  ','..\\..','a/b','a\\b'])('sanitizes unsafe label %s',label=>{expect(safeLabel(label,'Fallback')).not.toMatch(/[\\/]/);expect(safeLabel(label,'Fallback')).not.toMatch(/^\.+$/);});
 it('excludes removed appliances from downloadable entries and restores them through Undo',()=>{const f=pair();removeMember(f,2);expect(fleetBundle(f).filter(x=>x.name.endsWith('.ini'))).toHaveLength(1);expect(importFleet(fleetBundle(f).find(x=>x.name==='topology.json')!.text).members).toHaveLength(1);undoRemoval(f);expect(fleetBundle(f).filter(x=>x.name.endsWith('.ini'))).toHaveLength(2);});
 it('uses fixed scenarios and normalized secret-safe snapshots, leaving live typing untouched',()=>{const r=emptyRegistry(), w=createWorkspace('web','test');r.drafts.push(w);r.current=w.id;w.name=' Web internal spaces  ';w.config.values.name='live internal spaces  ';w.config.values.radius_sharedSecret='secret sentinel  ';const saved=savedRegistry(r);expect(saved.drafts[0].name).toBe(' Web internal spaces');expect(w.config.values.name).toBe('live internal spaces  ');expect(JSON.stringify(saved)).not.toContain('secret sentinel');expect(w.config.wrp).toHaveLength(1);expect(registryShape(saved)).toBe(true);});
});
