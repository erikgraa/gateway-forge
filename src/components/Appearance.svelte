<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/store.svelte';
  import { appearancePreference, resolvedTheme, type Appearance, type Palette, type ThemePreference } from '../lib/review-appearance';
  import { APPEARANCE_KEY } from '../lib/scenario-workspaces';
  let preference = $state<Appearance>(appearancePreference(null));
  let open = $state(false);
  let toggle: HTMLButtonElement;
  let control: HTMLDivElement;
  let systemDark = $state(false);
  const palettes: { value: Palette; label: string; colors: string[] }[] = [
    { value: 'original', label: 'Original purple', colors: ['#7c3aed', '#3b82f6', '#14b8a6'] },
    { value: 'harbor', label: 'Harbor', colors: ['#23679b', '#3f6790', '#267871'] },
    { value: 'slate', label: 'Warm slate', colors: ['#9e5537', '#91641f', '#82566f'] },
  ];
  const themes: { value: ThemePreference; label: string; icon: string }[] = [
    { value: 'system', label: 'System', icon: 'M3 4h18v13H3z M8 21h8 M12 17v4' },
    { value: 'light', label: 'Light', icon: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M5 19l1.5-1.5 M17.5 6.5 19 5' },
    { value: 'dark', label: 'Dark', icon: 'M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10Z' },
  ];
  function close() { open = false; toggle?.focus(); }
  function apply(persist = true) {
    document.documentElement.dataset.palette = preference.palette;
    app.setTheme(resolvedTheme(preference.theme, systemDark), false);
    if (persist) try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(preference)); } catch { app.say('Appearance is session-only: browser storage is unavailable.'); }
  }
  onMount(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)'); systemDark = mq.matches;
    try { preference = appearancePreference(JSON.parse(localStorage.getItem(APPEARANCE_KEY) || 'null')); } catch { preference = appearancePreference(null); }
    apply(false);
    const changed = () => { systemDark = mq.matches; if (preference.theme === 'system') apply(false); };
    const outside = (event: Event) => {
      if (open && event.target instanceof Node && !control.contains(event.target)) open = false;
    };
    mq.addEventListener('change', changed);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      mq.removeEventListener('change', changed);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  });
</script>
<svelte:window onkeydown={e => { if (e.key === 'Escape' && open) { e.preventDefault(); close(); } }} />
<div class="appearance-control" bind:this={control}>
  <button bind:this={toggle} id="appearance-toggle" aria-expanded={open} aria-controls="appearance-options" onclick={() => open = !open}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.5-3.3 1.7 1.7 0 0 1 1.3-2.8H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3Z"/><circle cx="7.5" cy="10" r=".7"/><circle cx="10" cy="6.5" r=".7"/><circle cx="15" cy="6.5" r=".7"/><circle cx="18" cy="10" r=".7"/></svg>
    Appearance
    <svg class="appearance-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg>
  </button>
  <div class="appearance-popover" id="appearance-options" hidden={!open}>
    <div class="appearance-heading">
      <div><strong>Make it yours</strong><p>One look, across every workspace.</p></div>
      <button class="appearance-close" aria-label="Close appearance settings" onclick={close}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m5 5 10 10 M15 5 5 15"/></svg></button>
    </div>
    <fieldset>
      <legend>Palette</legend>
      <div class="palette-options">
        {#each palettes as palette}
          <label class="appearance-choice palette-option">
            <input type="radio" name="appearance-palette" value={palette.value} checked={preference.palette === palette.value} onchange={() => { preference.palette = palette.value; apply(); }} />
            <span class="palette-preview" aria-hidden="true">{#each palette.colors as color}<span style:background={color}></span>{/each}</span>
            <span>{palette.label}</span>
            {#if preference.palette === palette.value}<svg class="palette-check" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 10 3 3 7-7"/></svg>{/if}
          </label>
        {/each}
      </div>
    </fieldset>
    <fieldset aria-describedby="appearance-theme-help">
      <legend>Theme</legend>
      <div class="theme-options">
        {#each themes as theme}
          <label class="appearance-choice theme-option">
            <input type="radio" name="appearance-theme" value={theme.value} checked={preference.theme === theme.value} onchange={() => { preference.theme = theme.value; apply(); }} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={theme.icon}/></svg>
            <span>{theme.label}</span>
          </label>
        {/each}
      </div>
      <p class="appearance-hint" id="appearance-theme-help">{preference.theme === 'system' ? `Follows your device’s ${systemDark ? 'dark' : 'light'} appearance.` : `Always ${preference.theme}, regardless of your device.`}</p>
    </fieldset>
  </div>
</div>

<style>
  #appearance-toggle { display: inline-flex; align-items: center; gap: 8px; border-radius: 10px; }
  #appearance-toggle > svg { width: 17px; height: 17px; }
  #appearance-toggle .appearance-chevron { width: 14px; height: 14px; transition: transform 160ms ease; }
  #appearance-toggle[aria-expanded=true] .appearance-chevron { transform: rotate(180deg); }
  .appearance-popover { position: absolute; right: 0; top: calc(100% + 10px); z-index: 40; width: 360px; max-width: calc(100vw - 24px); padding: 18px; box-sizing: border-box; display: grid; gap: 18px; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); color: var(--tx); box-shadow: 0 12px 40px color-mix(in srgb, var(--tx) 14%, transparent); }
  .appearance-popover[hidden] { display: none; }
  .appearance-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
  .appearance-heading strong { font-size: 15px; }
  .appearance-heading p { margin: 5px 0 0; color: var(--mut); font-size: 12px; }
  .appearance-popover .appearance-close { display: grid; place-items: center; width: 30px; min-height: 30px; padding: 0; flex-shrink: 0; border: 0; border-radius: 8px; background: var(--canvas); color: var(--mut); }
  .appearance-close svg { width: 16px; height: 16px; }
  fieldset { min-inline-size: 0; margin: 0; padding: 0; border: 0; }
  legend { margin-bottom: 10px; padding: 0; font-size: 12px; font-weight: 700; }
  .palette-options, .theme-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .appearance-choice { position: relative; min-width: 0; cursor: pointer; user-select: none; font-size: 12px; font-weight: 650; }
  .appearance-choice input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
  .appearance-choice:has(input:focus-visible) { outline: 3px solid var(--acc-strong); outline-offset: 3px; }
  .palette-option { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; min-height: 96px; padding: 10px 6px; box-sizing: border-box; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--canvas); text-align: center; transition: background 160ms ease, border-color 160ms ease, transform 160ms ease; }
  .palette-option:hover { transform: translateY(-1px); border-color: var(--acc-strong); }
  .palette-option:has(input:checked) { border-color: var(--acc-strong); background: var(--acc-soft); }
  .palette-preview { display: flex; gap: 3px; }
  .palette-preview > span { width: 19px; height: 23px; border-radius: 5px; }
  .palette-check { position: absolute; top: 4px; right: 4px; width: 13px; height: 13px; color: var(--acc-strong); pointer-events: none; }
  .theme-options { padding: 4px; gap: 4px; background: var(--canvas); border: 1px solid var(--line); border-radius: 12px; }
  .theme-option { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; min-height: 60px; border: 1px solid transparent; border-radius: 8px; color: var(--mut); }
  .theme-option svg { width: 19px; height: 19px; }
  .theme-option:hover { color: var(--tx); }
  .theme-option:has(input:checked) { color: var(--tx); background: var(--panel); border-color: var(--line-strong); box-shadow: 0 2px 5px color-mix(in srgb, var(--tx) 6%, transparent); }
  .appearance-hint { margin: 10px 0 0; color: var(--mut); font-size: 11px; line-height: 1.5; }
  @media (max-width: 420px) { #appearance-toggle { gap: 5px; } .appearance-popover { padding: 16px; } }
</style>
