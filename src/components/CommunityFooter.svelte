<script lang="ts">
  import packageInfo from '../../package.json';
</script>

<footer class="community-notice">
  <p><strong>Community-built.</strong> Not affiliated with or endorsed by Omnissa.</p>
  <nav aria-label="Project and vendor links">
    <span>UAG Foundry v{packageInfo.version}</span>
    <a href="https://github.com/erikgraa/uag-foundry" target="_blank" rel="noopener noreferrer">Source on GitHub</a>
    <a href="https://www.omnissa.com/" target="_blank" rel="noopener noreferrer">Omnissa</a>
  </nav>
</footer>

<style>
  .community-notice { margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--mut); font-size: 13px; line-height: 1.6; }
  p { margin: 0 0 8px; }
  strong { color: var(--tx); }
  nav { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; }
  a { color: var(--acc); text-underline-offset: 3px; }
</style>
