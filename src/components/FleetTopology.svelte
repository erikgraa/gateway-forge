<script lang="ts">
  import { activeMembers, addGroup, addMember, removeGroup, removeMember, undoRemoval, setDestination, propagate, editMember, nicRows, fleetIssues, templateChanges, moveMember, type Fleet, type Member, type BackendGroup } from '../lib/fleet';
  import { cloneConfig } from '../lib/model';
  import type { Issue } from '../lib/validate';
  import { groupAccent, hasVIP, individualTarget, memberName, supportsHA } from '../lib/fleet-topology';
  import FleetOverview from './FleetOverview.svelte';
  import { modalFocus } from '../lib/modal-focus';
  import TopologyIcon from './TopologyIcon.svelte';
  import FleetActionIcon from './FleetActionIcon.svelte';
  import FleetRemovalDialog from './FleetRemovalDialog.svelte';
  import FleetValidationStatus from './FleetValidationStatus.svelte';
  import FleetFieldIssues from './FleetFieldIssues.svelte';
  import { topologyLinks, type TopologyLink } from '../lib/topology-links';
  import { tick } from 'svelte';
  import { trailingWhitespace } from '../lib/ordinary-whitespace';
  import { downloadFleet } from '../lib/fleet-export';
  let { fleet, selected = $bindable(1), onedit, onsave }: { fleet: Fleet; selected?: number; onedit: (id: number, issue?: Issue) => void; onsave: () => void } = $props();
  let message = $state(''), adoption = $state<{ member: Member; group: BackendGroup; changes: string[] } | null>(null);
  const groups = $derived(fleet.groups.filter(g => !g.removed)), members = $derived(activeMembers(fleet)), member = $derived(members.find(m => m.id === selected));
  const selectedGroup = $derived(groups.find(group => group.id === member?.groupId));
  const errors = $derived(fleetIssues(fleet).filter(i => i.level === 'error'));
  const selectedErrors = $derived(errors.filter(issue => issue.memberId === selected));
  const showIPv6 = $derived(members.some(node => String(node.config.values.v6ip0 || '').trim() !== ''));
  const fieldErrors = (key: string) => selectedErrors.filter(issue => issue.fieldId === key);
  const groupErrors = (group: BackendGroup) => errors.filter(issue => activeMembers(fleet, group.id).some(node => node.id === issue.memberId));
  const groupFieldErrors = (group: BackendGroup, key: string) => [...new Map(groupErrors(group).filter(issue => issue.fieldId === key).map(issue => [issue.message, issue])).values()];
  let removal = $state<{ kind: 'member'; id: number; label: string } | { kind: 'group'; id: string; label: string; count: number } | null>(null);
  function connections(group: BackendGroup): TopologyLink[] {
    return activeMembers(fleet, group.id).flatMap(node => [
      { from: hasVIP(group) ? 'vip-' + group.id : 'entry-' + node.id, to: 'uag-' + node.id, route: hasVIP(group) ? 'fan-out' : 'direct' },
      { from: 'uag-' + node.id, to: individualTarget(node, group) ? 'destination-' + node.id : 'server-' + group.id, route: individualTarget(node, group) ? 'direct' : 'fan-in' }
    ] as TopologyLink[]);
  }
  async function confirmRemoval() {
    if (!removal) return;
    if (removal.kind === 'group') removeGroup(fleet, removal.id);
    else removeMember(fleet, removal.id);
    removal = null; repairSelection();
    await tick(); document.getElementById('fleet-undo')?.focus();
  }
  function add(group: BackendGroup) { try { selected = addMember(fleet, group).id; onsave(); } catch (e) { message = String(e); } }
  function update(key: string, value: string, blur = false) { if (!member) return; const config = cloneConfig(member.config); config.values[key] = blur ? trailingWhitespace(value) : value; editMember(fleet,member.id,config); if (blur) onsave(); }
  function ha(group: BackendGroup, key: string, value: string | boolean) { group.templateConfig.values[key] = value; propagate(fleet,group); onsave(); }
  function exported() { try { onsave(); downloadFleet(fleet); message = 'Fleet configuration ZIP downloaded. Review README.txt before manual deployment.'; } catch (e) { message = String(e); } }
  function move(value: string) { if (!member) return; const group = groups.find(g => g.id === value); if (group && group.id !== member.groupId) adoption = { member, group, changes: templateChanges(group,member) }; }
  function repairSelection() { if (!activeMembers(fleet).some(m => m.id === selected)) selected = activeMembers(fleet)[0]?.id ?? 1; onsave(); }
</script>

<style>
  .topology-node-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .topology-node-title > .topology-node-name { font: inherit; color: inherit; min-width: 0; overflow-wrap: anywhere; }
  .fleet-action { display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
  .remove-action { color: var(--bad); }
  .backend-group { container-type: inline-size; border-left: 4px solid var(--group-accent); background: color-mix(in srgb, var(--group-accent) 4%, var(--canvas)); }
  .backend-group-summary { cursor: pointer; }
  .backend-group-summary::marker { color: var(--group-accent); }
  .backend-group-summary :global(.fleet-check-status) { margin-left: 12px; }
  .backend-group-count { color: var(--mut); font-size: 12px; margin-left: 12px; }
  .backend-group-content { padding-top: 12px; }
  .backend-group-heading { color: var(--group-accent); margin: 0 0 10px; font-size: 17px; overflow-wrap: anywhere; }
  .backend-group-topology { position: relative; max-width: 660px; padding: 12px 16px; }
  .ha-guidance { margin: 10px 0 0; font-size: 12px; line-height: 1.5; color: var(--mut); }
  .uag-node { padding: 10px !important; }
  .node-destination { padding: 9px; }
  .group-connections { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;   color: var(--mut); }
    .group-connections :global(path) { stroke: currentColor; stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; fill: none; }
    .group-node-grid { position: relative; grid-template-columns: 1fr; gap: 20px; margin: 0; }
  .shared-vip, .shared-server { position: relative; max-width: 300px; margin: 0 auto; background: var(--panel); }
  .shared-vip { margin-bottom: 24px; display: flex; flex-direction: column; gap: 5px; }
  .shared-server { margin-top: 24px; text-align: center; }
  .shared-server .topology-node-title { justify-content: center; }
  .individual-entry { margin-bottom: 22px; }
  .individual-server { margin-top: 22px; }
  .uag-node { position: relative; }
  .blocked .uag-node { border: 2px solid var(--bad); background: color-mix(in srgb, var(--bad) 5%, var(--panel)); }
  .selected.blocked .uag-node { box-shadow: 0 0 0 2px var(--acc-strong); }
  .fleet-validation.has-blockers button { color: var(--tx); background: var(--panel); border-color: var(--line); }
  .fleet-validation.has-blockers { border-left: 3px solid color-mix(in srgb, var(--bad) 45%, var(--line)); background: var(--panel); }
  .fleet-validation summary { font-weight: 700; }
  .member-validation { border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
  .member-validation summary { cursor: pointer; }
  .member-validation ul { padding-left: 16px; font-size: 12px; overflow-wrap: anywhere; }
  .member-validation button { text-align: left; font-size: 12px; }
  .fleet-inspector input[aria-invalid='true'], .ha-controls input[aria-invalid='true'] { border-color: var(--bad); }
  @container (min-width: 580px) {
    .backend-group-topology { display: grid; grid-template-columns: minmax(0, 260px) minmax(0, 180px); gap: 24px; align-items: center; padding: 12px 0; }
    .backend-group-topology.with-vip { grid-template-columns: minmax(0, 150px) minmax(0, 260px) minmax(0, 180px); }
    .group-node-grid { grid-column: 1; grid-row: 1; gap: 18px; }
    .with-vip .group-node-grid { grid-column: 2; }
    .shared-vip { grid-column: 1; grid-row: 1; margin: 0; min-width: 0; }
    .shared-server { grid-column: 2; grid-row: 1; margin: 0; min-width: 0; }
    .with-vip .shared-server { grid-column: 3; }
  }
</style>
<div class="fleet-workspace">
  <section class="fleet-canvas" aria-label="Horizon topology"><div class="fleet-toolbar"><div><span class="eyebrow">Horizon topology</span><h2>{members.length} active UAG{members.length === 1 ? '' : 's'} · {groups.length} UAG group{groups.length === 1 ? '' : 's'}</h2></div><div><button id="fleet-add-group" class="fleet-action" onclick={() => { addGroup(fleet); onsave(); }}><FleetActionIcon action="add-group" />Add UAG group</button><button id="fleet-undo" class="fleet-action" disabled={!fleet.undo.length} onclick={() => { undoRemoval(fleet); repairSelection(); }}><FleetActionIcon action="undo" />Undo removal</button><button id="fleet-export" class="fleet-action" disabled={errors.length > 0 || !members.length} onclick={exported}><FleetActionIcon action="export" />Download fleet configuration</button></div></div>
    {#if message}<p class="scenario-message" role="status">{message}</p>{/if}
    <FleetOverview {fleet} />
    {#each groups as group (group.id)}<details class="backend-group" data-group={group.id} aria-label={group.label} style={'--group-accent: ' + groupAccent(group.id)} open><summary class="backend-group-summary"><span class="backend-group-heading">{group.label || 'Unnamed UAG group'}</span><span class="backend-group-count">{activeMembers(fleet, group.id).length} UAG{activeMembers(fleet, group.id).length === 1 ? '' : 's'}</span><FleetValidationStatus count={groupErrors(group).length} empty={!activeMembers(fleet, group.id).length} /></summary><div class="backend-group-content"><div class="backend-group-header"><div><label for={'group-label-' + group.id}>UAG group label</label><input id={'group-label-' + group.id} bind:value={group.label} onblur={() => { group.label = trailingWhitespace(group.label); onsave(); }} /></div><div class="group-destination"><label for={'group-server-' + group.id}>Shared Connection Server URL</label><input id={'group-server-' + group.id} value={group.server} oninput={e => setDestination(fleet, group, e.currentTarget.value)} onblur={e => { setDestination(fleet,group,trailingWhitespace(e.currentTarget.value)); onsave(); }} /></div><div class="group-actions"><button class="fleet-action" onclick={() => add(group)}><FleetActionIcon action="add-uag" />Add UAG</button><button class="fleet-action remove-action" onclick={() => removal = { kind: 'group', id: group.id, label: group.label || 'Unnamed UAG group', count: activeMembers(fleet,group.id).length }}><FleetActionIcon action="remove" />Remove UAG group</button></div></div>
      <div class="ha-controls"><label class="checkbox-label"><input type="checkbox" id={'ha-enabled-' + group.id} checked={group.templateConfig.values.ha_enabled === true} disabled={!supportsHA(group) || (activeMembers(fleet,group.id).length < 2 && group.templateConfig.values.ha_enabled !== true)} onchange={e => ha(group,'ha_enabled',e.currentTarget.checked)} />Native HA</label>{#if !supportsHA(group)}<span>Not supported on this platform; existing imported values remain retained.</span>{/if}{#if activeMembers(fleet,group.id).length < 2}<span>Needs two active appliances. Existing HA values are retained.</span>{/if}{#if group.templateConfig.values.ha_enabled === true}<label for={'ha-vip-' + group.id}>IPv4 VIP</label><input id={'ha-vip-' + group.id} aria-invalid={groupFieldErrors(group,'ha_virtualIPAddress').length ? 'true' : undefined} aria-describedby={groupFieldErrors(group,'ha_virtualIPAddress').length ? 'ha-vip-errors-' + group.id : undefined} value={String(group.templateConfig.values.ha_virtualIPAddress || '')} oninput={e => ha(group,'ha_virtualIPAddress',e.currentTarget.value)} onblur={e => ha(group,'ha_virtualIPAddress',trailingWhitespace(e.currentTarget.value))} /><FleetFieldIssues id={'ha-vip-errors-' + group.id} issues={groupFieldErrors(group,'ha_virtualIPAddress')} /><label for={'ha-id-' + group.id}>Group ID</label><input id={'ha-id-' + group.id} aria-invalid={groupFieldErrors(group,'ha_groupId').length ? 'true' : undefined} aria-describedby={groupFieldErrors(group,'ha_groupId').length ? 'ha-id-errors-' + group.id : undefined} value={String(group.templateConfig.values.ha_groupId || '')} oninput={e => ha(group,'ha_groupId',e.currentTarget.value)} onblur={e => ha(group,'ha_groupId',trailingWhitespace(e.currentTarget.value))} /><FleetFieldIssues id={'ha-id-errors-' + group.id} issues={groupFieldErrors(group,'ha_groupId')} /><span class="ha-warning">{supportsHA(group) ? 'Generated XML API HA settings; live failover, L2 and certificates still require verification. Display protocols need direct per-UAG endpoints.' : 'Retained native HA values are unsupported on this platform and are not emitted.'}</span>{/if}</div>
      <div class="backend-group-topology" class:with-vip={hasVIP(group)} use:topologyLinks={connections(group)}>
        <svg class="group-connections" aria-hidden="true"></svg>
        {#if hasVIP(group) && activeMembers(fleet,group.id).length}
          <div class="entry-point shared-vip" data-topology-key={'vip-' + group.id}><strong>UAG High Availability</strong><small>Shared XML API VIP</small><span>{String(group.templateConfig.values.ha_virtualIPAddress || 'IPv4 VIP required')}</span></div>
        {/if}
        <div class="group-node-grid">
          {#each activeMembers(fleet,group.id) as node (node.id)}
            {@const nodeErrors = errors.filter(i => i.memberId === node.id)}
            <article class="topology-node" class:selected={selected === node.id} class:blocked={nodeErrors.length > 0}>
              {#if !hasVIP(group)}<span class="entry-point individual-entry" data-topology-key={'entry-' + node.id}>Independent / external entry</span>{/if}
              <button class="uag-node" id={'uag-node-' + node.id} data-topology-key={'uag-' + node.id} aria-pressed={selected === node.id} aria-describedby={'uag-errors-' + node.id} onclick={() => selected = node.id}>
                <strong class="topology-node-title"><TopologyIcon kind="uag" /><span class="topology-node-name">{memberName(node)}</span></strong>
                {#if node.config.values.uagName && node.config.values.uagName !== node.config.values.name}<span>Hostname · {String(node.config.values.uagName)}</span>{/if}
                <span>{group.templateId === node.id ? 'Shared template owner' : 'Individual appliance'}</span>
                {#each nicRows(node.config) as nic}<span>NIC{nic.nic} · {nic.role}: {nic.value}</span>{/each}
                <FleetValidationStatus id={'uag-errors-' + node.id} count={nodeErrors.length} />
              </button>
              {#if individualTarget(node,group)}
                <div class="node-destination individual-server" data-topology-key={'destination-' + node.id}><strong class="topology-node-title"><TopologyIcon kind="server" />Connection Server</strong><span>{String(node.config.values.proxyDestinationUrl || 'URL required')}</span><small>{node.individualDestination ? 'Individual override' : 'Different destination — review group'}</small></div>
              {/if}
            </article>
          {/each}
        </div>
        {#if activeMembers(fleet,group.id).some(node => !individualTarget(node,group))}
          <div class="node-destination shared-server" data-topology-key={'server-' + group.id}><strong class="topology-node-title"><TopologyIcon kind="server" />Shared Connection Server</strong><span>{group.server || 'URL required'}</span><small>Shared destination for this group's connected UAGs</small></div>
        {/if}
      </div>
      {#if hasVIP(group) && activeMembers(fleet,group.id).length}<p class="ha-guidance">For direct access, resolve the client-facing hostname to the reachable group VIP or its public/NAT address. With a load balancer or health-aware DNS/GSLB, follow that entry-point design instead. Verify client DNS resolution and certificate coverage before deployment; Foundry does not configure or verify them.</p>{/if}
      {#if !activeMembers(fleet,group.id).length}<p>No appliances in this group. Add one when its destination is ready.</p>{/if}
    </div></details>{/each}
    {#if errors.length}<details class="fleet-validation" class:has-blockers={errors.length > 0} open={errors.length > 0}><summary><FleetValidationStatus count={errors.length} /></summary><ul>{#each errors as issue}{@const affected = members.find(node => node.id === issue.memberId)}<li>{#if affected}<button data-issue-member={affected.id} data-issue-field={issue.fieldId} onclick={() => onedit(affected.id, issue)}><strong>{memberName(affected)}</strong> · {issue.fieldId}: {issue.message}</button>{:else}<span>{issue.fieldId}: {issue.message}</span>    {/if}</li>{/each}</ul></details>{/if}
  </section>
  <aside class="fleet-inspector" aria-label="Selected UAG settings">{#if member}<span class="eyebrow">Appliance settings</span><h2>{memberName(member)}</h2>{#if selectedErrors.length}<details class="member-validation" open><summary><FleetValidationStatus count={selectedErrors.length} /></summary><ul>{#each selectedErrors as issue}<li><button data-issue-field={issue.fieldId} onclick={() => onedit(member.id, issue)}>{issue.fieldId}: {issue.message}</button></li>{/each}</ul></details>{:else}<FleetValidationStatus count={0} />{/if}<label for="member-config-name">VM name (INI name)</label><input id="member-config-name" value={String(member.config.values.name || '')} oninput={e => update('name',e.currentTarget.value)} onblur={e => update('name',e.currentTarget.value,true)} /><label for="member-name">Appliance name</label><input id="member-name" value={String(member.config.values.uagName || '')} oninput={e => update('uagName',e.currentTarget.value)} onblur={e => update('uagName',e.currentTarget.value,true)} />{#each nicRows(member.config) as nic}<label for={'member-ip-' + nic.nic}>NIC{nic.nic} {nic.role}</label><input id={'member-ip-' + nic.nic} value={String(member.config.values['ip' + nic.nic] || '')} disabled={!nic.ipv4} aria-invalid={fieldErrors('ip' + nic.nic).length > 0 ? 'true' : undefined} aria-describedby={fieldErrors('ip' + nic.nic).length ? 'member-ip-errors-' + nic.nic : undefined} oninput={e => update('ip' + nic.nic,e.currentTarget.value)} onblur={e => update('ip' + nic.nic,e.currentTarget.value,true)} /><FleetFieldIssues id={'member-ip-errors-' + nic.nic} issues={fieldErrors('ip' + nic.nic)} />{#if showIPv6 && nic.ipv6 !== undefined}<label for="member-ipv6-0">NIC0 Internet IPv6 address</label><input id="member-ipv6-0" value={nic.ipv6} oninput={e => update('v6ip0',e.currentTarget.value)} onblur={e => update('v6ip0',e.currentTarget.value,true)} />{/if}{/each}{#if selectedGroup && individualTarget(member, selectedGroup)}<label for="member-destination">{member.individualDestination ? 'Individual Connection Server override' : 'Different Connection Server destination'}</label><input id="member-destination" aria-describedby="member-destination-help" value={String(member.config.values.proxyDestinationUrl || '')} oninput={e => update('proxyDestinationUrl',e.currentTarget.value)} onblur={e => update('proxyDestinationUrl',e.currentTarget.value,true)} /><p id="member-destination-help" class="help-text">{member.individualDestination ? 'Individual override; shared group updates retain this URL.' : 'This retained destination differs from the group. Review it before adopting shared settings.'}</p>{:else}<p class="help-text">The shared Connection Server is configured in the UAG group.</p>{/if}<button id="member-full-editor" class="fleet-action" onclick={() => onedit(member.id)}><FleetActionIcon action="edit" />Full UAG configuration editor</button><label for="member-move-group">Move to UAG group</label><select id="member-move-group" value={member.groupId} onchange={e => { const destination = e.currentTarget.value; e.currentTarget.value = member?.groupId || ''; move(destination); }}>{#each groups as group}<option value={group.id}>{group.label}</option>{/each}</select><p class="help-text">Moving adopts the destination group's shared template after confirmation. Individual names and addresses stay intact.</p><button id="member-remove" class="fleet-action remove-action" onclick={() => { if (member) removal = { kind: 'member', id: member.id, label: memberName(member) }; }}><FleetActionIcon action="remove" />Remove selected UAG</button><p class="help-text">Removal excludes this member from exports; Undo restores its settings. Group labels do not prove separate pods or HA eligibility.</p>{:else}<h2>No selected UAG</h2><p>Add or restore an appliance to edit its configuration.</p>{/if}</aside>
</div>
{#if removal}<FleetRemovalDialog kind={removal.kind} label={removal.label} count={removal.kind === 'group' ? removal.count : 1} oncancel={() => removal = null} onconfirm={confirmRemoval} />{/if}
{#if adoption}<div class="scenario-dialog-backdrop"><div class="scenario-dialog" use:modalFocus={() => adoption = null} tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="adopt-title"><h2 id="adopt-title">Adopt {adoption.group.label}'s template?</h2><p>Names and IP addresses remain individual. Shared fields that will change:</p><ul>{#each adoption.changes as change}<li>{change}</li>{/each}</ul><div><button onclick={() => adoption = null}>Cancel</button><button id="confirm-adoption" onclick={() => { if (adoption) moveMember(fleet,adoption.member,adoption.group); adoption = null; onsave(); }}>Move & adopt template</button></div></div></div>{/if}
