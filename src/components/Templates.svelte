<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { TEMPLATES } from '../lib/templates';

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
    {#each TEMPLATES as t (t.id)}
      <div class="tpl">
        <h4>{t.title}</h4>
        <div class="tags">{#each t.tags as tag (tag)}<span class="chip">{tag}</span>{/each}</div>
        <p>{t.description}</p>
        <button class="primary small" onclick={() => use(t.id)}>Use template</button>
      </div>
    {/each}
  </div>
</details>
