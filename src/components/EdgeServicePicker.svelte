<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { activeWrpItems, sectionSelected, setServiceSelected, type SelectableService } from '../lib/model';

  const services = [
    { id: 'horizon', icon: '🖥', title: 'Horizon', description: 'Connection Server, Blast, Tunnel, PCoIP, and double-DMZ cascade roles.' },
    { id: 'wrp', icon: '🔀', title: 'Web reverse proxy', description: 'Publish internal web applications and portals with one or more instances.' },
    { id: 'tunnel', icon: '🚇', title: 'Workspace ONE Tunnel', description: 'Per-app and device traffic tunnel connected to Workspace ONE UEM.' },
    { id: 'contentGateway', icon: '▣', title: 'Workspace ONE Content Gateway', description: 'Managed content access through Workspace ONE UEM.' },
    { id: 'seg', icon: '✉', title: 'Secure Email Gateway', description: 'Standalone Mobile Email Management gateway configured through Workspace ONE UEM.' }
  ] as const;

  function selected(id: SelectableService): boolean {
    return sectionSelected(app.config, id);
  }

  const selectedCount = $derived(services.filter((service) => selected(service.id)).length);

  function toggle(id: SelectableService) {
    setServiceSelected(app.config, id, !selected(id));
  }
</script>

<section class="card service-picker-panel" aria-labelledby="edge-service-picker-title">
  <div class="service-picker-head">
    <div>
      <h2 id="edge-service-picker-title">Services to publish</h2>
      <p class="help">Choose only the services this UAG needs. Defaults to none.</p>
    </div>
    <span class="service-count">{selectedCount} selected</span>
  </div>
  <div class="service-grid">
    {#each services as service (service.id)}
      {@const active = selected(service.id)}
      <button
        type="button"
        class="service-card"
        class:selected={active}
        aria-pressed={active}
        onclick={() => toggle(service.id)}
      >
        <span class="service-card-check" aria-hidden="true">✓</span>
        <span class="service-card-icon" aria-hidden="true">{service.icon}</span>
        <h3>{service.title}</h3>
        <p>{service.description}</p>
        <span class="service-card-status">{active ? (service.id === 'wrp' ? `Selected · ${activeWrpItems(app.config).length} instance${activeWrpItems(app.config).length === 1 ? '' : 's'}` : 'Selected') : 'Optional · not selected'}</span>
      </button>
    {/each}
  </div>
  <p class="service-picker-note"><strong>Selected services appear as active setup items.</strong> Unselected services remain optional, do not create configuration errors, and are omitted from generated INI/JSON and PowerShell output.</p>
</section>
