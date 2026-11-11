<script lang="ts">
  import type { Fleet } from '../lib/fleet';
  import { groupAccent, memberName, overviewTopology } from '../lib/fleet-topology';
  import { topologyLinks } from '../lib/topology-links';
  import TopologyIcon from './TopologyIcon.svelte';
  let { fleet }: { fleet: Fleet } = $props();
  let clientLoadBalancer = $state(false), loadBalancedDestinations = $state<string[]>([]);
  const overview = $derived(overviewTopology(fleet, { clientLoadBalancer, loadBalancedDestinations }));
  const hasServerPools = $derived(overview.destinations.some(destination => destination.loadBalanced));
  function toggleDestination(identity: string) {
    loadBalancedDestinations = loadBalancedDestinations.includes(identity) ? loadBalancedDestinations.filter(value => value !== identity) : [...loadBalancedDestinations, identity];
  }
</script>

<details class="fleet-overview" aria-labelledby="fleet-overview-heading" open>
  <summary><h3 id="fleet-overview-heading">Fleet overview</h3></summary>
  <fieldset class="overview-options"><legend>Show hypothetical load balancers</legend><label class:enabled={clientLoadBalancer}><input type="checkbox" role="switch" aria-checked={clientLoadBalancer} bind:checked={clientLoadBalancer} /> Client-facing LB</label>
    {#each overview.destinations as destination, index (destination.identity)}
      {#if destination.configured}<label class:enabled={destination.loadBalanced}><input type="checkbox" role="switch" aria-checked={destination.loadBalanced} checked={destination.loadBalanced} aria-describedby={destination.loadBalanced ? 'overview-lb-help overview-cpa-help' : 'overview-lb-help'} data-destination-lb={destination.key} onchange={() => toggleDestination(destination.identity)} /><span>LB / pool {index + 1} · {destination.label}</span></label>{/if}
    {/each}
  </fieldset>
  <p id="overview-lb-help" class="overview-help">Conceptual XML API relationships. Each configured endpoint may represent one Connection Server or an LB fronting several; the URL does not reveal its members. Enable an endpoint’s LB / pool option to show a dotted hypothetical LB and a 1–N server pool with unknown membership. These are not configured pools, pod routing or verified health checks/persistence. Display-protocol paths are not shown. Diagram options do not change or save configuration. Design reference: <a href="https://techzone.omnissa.com/resource/horizon-8-architecture" target="_blank" rel="noopener noreferrer">Horizon Architecture</a> (Omnissa Tech Zone).</p>
  {#if hasServerPools}<p id="overview-cpa-help" class="overview-help overview-cpa" role="note"><strong>Cloud Pod Architecture (CPA):</strong> these hypothetical Connection Server pools could belong to federated Horizon pods. An LB alone does not establish CPA; pod membership, federation, global entitlements and inter-pod connectivity are not configured or verified here.</p>{/if}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to focus this region to scroll an overflowing topology.) -->
  <div class="overview-scroll" role="region" aria-label="Scrollable fleet overview" tabindex="0">
    <div class="overview-map" class:with-client-lb={clientLoadBalancer} class:with-server-pools={hasServerPools} use:topologyLinks={overview.links}>
      <svg class="overview-connections" data-topology-connections aria-hidden="true"></svg>
      <div class="overview-node overview-client" data-topology-key="overview-clients"><TopologyIcon kind="client" /><strong>Horizon clients</strong></div>
      {#if clientLoadBalancer}<div class="overview-node overview-lb" data-topology-key="overview-client-lb"><strong>Client-facing LB</strong><small>Hypothetical</small></div>{/if}
      <div class="overview-groups">
        {#each overview.groups as { group, members, vip } (group.id)}
          <section class="overview-group" data-overview-group={group.id} aria-label={group.label || 'Unnamed UAG group'} style={'--group-accent: ' + groupAccent(group.id)}>
            <h4>{group.label || 'Unnamed UAG group'}</h4>
            {#if members.length}
              <div class="overview-group-content" class:with-vip={vip}>
                {#if vip}<div class="overview-node overview-vip" data-topology-key={'overview-vip-' + group.id}><strong>HA VIP</strong></div>{/if}
                <ul class="overview-members" aria-label="Active UAGs">
                  {#each members as member (member.id)}
                    <li class="overview-node" data-topology-key={'overview-uag-' + member.id}><TopologyIcon kind="uag" /><span>{memberName(member)}</span></li>
                  {/each}
                </ul>
              </div>
            {:else}<p class="overview-empty">No active UAGs</p>{/if}
          </section>
        {/each}
        {#if !overview.groups.length}<p class="overview-empty">No active UAG groups</p>{/if}
      </div>
      <ul class="overview-destinations" aria-label="Configured Connection Server destinations">
        {#each overview.destinations as destination, index (destination.identity)}
          <li class="overview-destination" class:with-pool={destination.loadBalanced}>
            <div class="overview-node overview-endpoint" class:overview-lb={destination.loadBalanced} data-topology-key={destination.key}>
              {#if !destination.loadBalanced}<TopologyIcon kind="server" />{/if}
              <div><strong>{destination.loadBalanced ? 'Hypothetical LB' : 'CS endpoint'} {index + 1}</strong><span>{destination.label}</span></div>
            </div>
            {#if destination.loadBalanced}<div class="overview-node overview-pool" data-topology-key={destination.key + '-pool'}><TopologyIcon kind="server" /><div><strong>Connection Servers</strong><small>1–N · unknown members</small><small>Hypothetical pool</small></div></div>{/if}
          </li>
        {/each}
      </ul>
    </div>
  </div>
</details>

<style>
  .fleet-overview { min-width: 0; margin: 18px 0; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); }
  summary { cursor: pointer; }
  summary:focus-visible { outline: 2px solid var(--acc-strong); outline-offset: 4px; border-radius: 4px; }
  h3 { display: inline; margin: 0; font-size: 15px; }
  .overview-options { display: flex; flex-wrap: wrap; gap: 8px; padding: 0; margin: 10px 0 0; border: 0; color: var(--tx); font-size: 11px; }
  .overview-options legend { margin-bottom: 6px; color: var(--mut); }
  .overview-options label { display: inline-flex; align-items: center; gap: 8px; min-width: 0; max-width: 100%; box-sizing: border-box; padding: 7px 10px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--panel-raised); cursor: pointer; }
  .overview-options label span { min-width: 0; overflow-wrap: anywhere; }
  .overview-options label:hover { border-color: var(--acc-strong); }
  .overview-options label.enabled { border-color: var(--acc-strong); background: var(--acc-soft); }
  .overview-options label:has(input:focus-visible) { outline: 2px solid var(--acc-strong); outline-offset: 3px; }
  .overview-options input { appearance: none; position: relative; flex: none; width: 30px; min-width: 30px; height: 18px; margin: 0; padding: 0; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--mut); cursor: pointer; }
  .overview-options input::before { content: ''; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--panel); }
  .overview-options input:checked { background: var(--acc-strong); border-color: var(--acc-strong); }
  .overview-options input:checked::before { transform: translateX(12px); }
  .overview-options input:focus-visible { outline: none; }
  @media (forced-colors: active) {
    .overview-options input { appearance: auto; }
    .overview-options input::before { display: none; }
  }
  .overview-node.overview-lb { flex-direction: column; text-align: center; border: 2px dotted var(--mut); }
  .overview-lb small { color: var(--mut); }
  .overview-map.with-client-lb { grid-template-columns: 78px 90px 260px var(--destination-width); }
  .overview-map.with-server-pools { --destination-width: 282px; }
  .overview-destination { display: grid; grid-template-columns: 150px; align-items: center; gap: 22px; }
  .overview-destination.with-pool { grid-template-columns: 110px 150px; }
  .overview-endpoint > div, .overview-pool > div { display: flex; flex-direction: column; min-width: 0; }
  .overview-node.overview-pool { border-style: dotted; }
  .overview-pool small { color: var(--mut); }
  .overview-help { margin: 6px 0 12px; color: var(--mut); font-size: 11px; line-height: 1.5; }
  .overview-cpa { padding: 6px 9px; border-left: 2px dotted var(--mut); border-radius: 0 6px 6px 0; background: var(--panel-raised); }
  .overview-scroll { overflow-x: auto; border-radius: 8px; }
  .overview-scroll:focus-visible { outline: 2px solid var(--acc-strong); outline-offset: 2px; }
  .overview-map { --destination-width: 150px; position: relative; display: grid; grid-template-columns: 78px 260px var(--destination-width); width: max-content; align-items: center; gap: 22px; padding: 6px; }
  .overview-connections { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; color: var(--mut); }
  .overview-connections :global(path) { stroke: currentColor; stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; fill: none; }
  .overview-groups, .overview-destinations, .overview-members { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; min-width: 0; }
  .overview-groups { gap: 12px; }
  .overview-destinations { gap: 14px; }
  .overview-group { min-width: 0; border: 1px solid var(--line); border-left: 3px solid var(--group-accent); border-radius: 8px; padding: 8px; background: color-mix(in srgb, var(--group-accent) 4%, var(--canvas)); }
  h4 { margin: 0 0 8px; color: var(--group-accent); font-size: 12px; overflow-wrap: anywhere; }
  .overview-group-content { display: grid; gap: 18px; align-items: center; }
  .overview-group-content.with-vip { grid-template-columns: 54px minmax(0, 1fr); }
  .overview-node { position: relative; display: flex; align-items: center; gap: 6px; min-width: 0; padding: 6px 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel); font-size: 11px; line-height: 1.4; }
  .overview-node span, .overview-node strong { min-width: 0; overflow-wrap: anywhere; }
  .overview-client { flex-direction: column; text-align: center; }
  .overview-vip { justify-content: center; color: var(--group-accent); text-align: center; }
  .overview-node :global(.topology-icon), .overview-node :global(svg) { width: 18px; height: 18px; }
  .overview-empty { margin: 0; color: var(--mut); font-size: 11px; }
</style>
