import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FleetActionIcon from './FleetActionIcon.svelte';

describe('Decorative action icons', () => {
  it.each(['add-group', 'add-uag', 'remove', 'undo', 'export', 'edit'] as const)('keeps the %s icon theme-aware and out of the tab order', (action) => {
    const { body } = render(FleetActionIcon, { props: { action } });
    expect(body).toContain('stroke="currentColor"');
    expect(body).toContain('aria-hidden="true"');
    expect(body).toContain('focusable="false"');
    expect(body).not.toContain('tabindex');
    expect(body).toContain('<path');
  });
});
