import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ScenarioIcon from './ScenarioIcon.svelte';
import type { Scenario } from '../lib/scenario-workspaces';

describe('scenario icons', () => {
  it.each([
    ['single', 'M8 7h4 M8 11h4'],
    ['horizon', 'M5 7V3h10v4'],
    ['web', 'M3 6h14m-4-3 4 3-4 3 M17 14H3m4-3-4 3 4 3'],
  ] as [Scenario, string][])('renders a decorative %s icon', (scenario, path) => {
    const { body } = render(ScenarioIcon, { props: { scenario } });
    expect(body).toContain(`data-scenario-icon="${scenario}"`);
    expect(body).toContain('aria-hidden="true"');
    expect(body).toContain('focusable="false"');
    expect(body).toContain('stroke="currentColor"');
    expect(body).toContain(`d="${path}"`);
    expect(body).not.toContain('tabindex');
  });
});
