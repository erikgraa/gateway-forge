<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { TEMPLATES } from '../lib/templates';
  import TemplateVisual from './TemplateVisual.svelte';

  const previews = $derived(TEMPLATES.map((template) => ({ template, config: template.build(app.config) })));

  function use(id: string) {
    const t = TEMPLATES.find((x) => x.id === id)!;
    app.config = t.build(app.config);
    app.goTo('general');
    app.say(`Loaded template: ${t.title}`);
  }
</script>

<details class="card collapsible-card" open>
  <summary class="card-head">
    <h3>Templates</h3>
    <span class="collapse-indicator" aria-hidden="true"></span>
  </summary>
  <p class="help">Start from a common design. Loading a template replaces the current configuration but keeps your UAG version and platform. Replace the example host names, URLs and thumbprints with your own.</p>
  <div class="tpl-grid">
    {#each previews as { template: t, config } (t.id)}
      <div class="tpl" data-accent={t.appearance.accent}>
        <div class="tpl-kind">{t.appearance.label}</div>
        <TemplateVisual {config} title={t.title} />
        <div class="tpl-body">
          <h4>{t.title}</h4>
          <div class="tags">{#each t.tags as tag (tag)}<span class="chip">{tag}</span>{/each}</div>
          <p>{t.description}</p>
          <button class="template-use small" onclick={() => use(t.id)} aria-label={`Use template: ${t.title}`}>Use template</button>
        </div>
      </div>
    {/each}
  </div>
</details>
