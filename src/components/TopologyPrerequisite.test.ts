import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import TopologyPrerequisite from './TopologyPrerequisite.svelte';

describe('Horizon topology prerequisite notice', () => {
  it('prominently warns about an incomplete baseline before continuing', () => {
    const { body } = render(TopologyPrerequisite, { props: { unlocked: false, blocked: true } });
    expect(body).toContain('id="topology-next-help"');
    expect(body).toContain('role="status"');
    expect(body).toContain('warning');
    expect(body).toMatch(/<strong[^>]*>Complete a valid Horizon baseline before planning the topology\.<\/strong>/);
    expect(body).toContain('Resolve the configuration errors and keep Horizon enabled');
    expect(body).toContain('aria-hidden="true"');
    expect(body).toContain('nothing is deployed');
  });

  it('replaces the warning with a next-step explanation once the baseline is valid', () => {
    const { body } = render(TopologyPrerequisite, { props: { unlocked: false, blocked: false } });
    expect(body).toContain('Your Horizon baseline is valid.');
    expect(body).not.toContain('warning');
    expect(body).not.toContain('<svg');
  });

  it('does not apply the initial-baseline warning to an already unlocked fleet', () => {
    const { body } = render(TopologyPrerequisite, { props: { unlocked: true, blocked: true } });
    expect(body).toContain('Save this appliance’s changes and return to the fleet plan.');
    expect(body).not.toContain('warning');
    expect(body).not.toContain('Complete a valid Horizon baseline');
  });
});
