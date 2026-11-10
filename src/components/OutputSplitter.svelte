<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { OUTPUT_WIDTH_KEY, clampOutputWidth, defaultOutputWidth, outputWidthBounds, savedOutputWidth } from '../lib/output-layout';

  let { layout, collapsed = false }: { layout?: HTMLElement; collapsed?: boolean } = $props();
  const helpId = $props.id();
  let preferred: number | undefined;
  let width = $state(440);
  let minimum = $state(280);
  let maximum = $state(1000);
  let drag: { pointer: number; x: number; width: number } | undefined;
  let dragging = $state(false);

  function update(element: HTMLElement) {
    if (!matchMedia('(min-width: 981px)').matches) return;
    const style = getComputedStyle(element);
    const bounds = outputWidthBounds(element.clientWidth, parseFloat(style.getPropertyValue('--nav-width')), parseFloat(style.getPropertyValue('--form-min-width')));
    minimum = bounds.min;
    maximum = bounds.max;
    width = clampOutputWidth(preferred ?? defaultOutputWidth(innerWidth), bounds);
    element.style.setProperty('--resized-output-width', `${width}px`);
  }

  onMount(() => {
    try { preferred = savedOutputWidth(localStorage.getItem(OUTPUT_WIDTH_KEY)); } catch { /* Layout remains usable when storage is blocked. */ }
    if (layout) update(layout);
  });

  $effect(() => {
    const element = layout;
    if (!element) return;
    const observer = new ResizeObserver(() => update(element));
    observer.observe(element);
    untrack(() => update(element));
    return () => observer.disconnect();
  });

  function save() {
    try {
      if (preferred === undefined) localStorage.removeItem(OUTPUT_WIDTH_KEY);
      else localStorage.setItem(OUTPUT_WIDTH_KEY, String(preferred));
    } catch { /* Resizing does not depend on persistent storage. */ }
  }

  function resize(value: number) {
    preferred = clampOutputWidth(value, { min: minimum, max: maximum });
    if (layout) update(layout);
  }

  function begin(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag = { pointer: event.pointerId, x: event.clientX, width };
    dragging = true;
  }

  function move(event: PointerEvent) {
    if (drag?.pointer === event.pointerId) resize(drag.width + drag.x - event.clientX);
  }

  function finish() {
    if (drag) save();
    drag = undefined;
    dragging = false;
  }

  function onKey(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 50 : 20;
    resize(event.key === 'Home' ? minimum : event.key === 'End' ? maximum : width + (event.key === 'ArrowLeft' ? step : -step));
    save();
  }

  function reset() {
    preferred = undefined;
    if (layout) update(layout);
    save();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (Focusable separator follows the ARIA window-splitter pattern.) -->
<div
  class="output-splitter" class:dragging hidden={collapsed}
  role="separator" tabindex={collapsed ? -1 : 0} aria-orientation="vertical"
  aria-label="Resize configuration preview" aria-controls="generated-output"
  aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={width}
  aria-valuetext={`${width} pixels wide`} aria-describedby={helpId}
  title="Drag to resize the preview. Double-click to reset its width."
  onpointerdown={begin} onpointermove={move} onpointerup={finish}
  onpointercancel={finish} onlostpointercapture={finish} onkeydown={onKey} ondblclick={reset}
><span class="sr-only" id={helpId}>Drag left to widen the preview or right to narrow it. Use Left and Right arrow keys, or Home and End for the width limits. Double-click to restore the default width.</span></div>
