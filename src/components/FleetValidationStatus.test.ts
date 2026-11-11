import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FleetValidationStatus from './FleetValidationStatus.svelte';

describe('Fleet configuration status', () => {
  it('shows a decorative checked box, readable zero-error text and an associated status ID', () => {
    const body = render(FleetValidationStatus, { props: { count: 0, id: 'uag-errors-1' } }).body;
    expect(body).toContain('Configuration ready');
    expect(body).toContain('Deployment, certificates and live failover still require verification');
    expect(body).toContain('id="uag-errors-1"');
    expect(body).toContain('<rect');
    expect(body).toContain('aria-hidden="true"');
    expect(body).not.toMatch(/class="[^"]*blocked/);
    expect(body).not.toContain('<input');
    expect(body).not.toContain('role="checkbox"');
  });
  it('does not claim an empty group is ready', () => {
    const body = render(FleetValidationStatus, { props: { count: 0, empty: true } }).body;
    expect(body).toContain('Add a UAG to validate');
    expect(body).not.toContain('Configuration ready');
    expect(body).not.toContain('<rect');
  });
  it.each([1, 3])('shows a warning icon and correctly pluralized blocking count for %s', count => {
    const body = render(FleetValidationStatus, { props: { count } }).body;
    expect(body).toMatch(/class="[^"]*blocked/);
    expect(body).toContain(`${count} blocking configuration error${count === 1 ? '' : 's'}`);
    expect(body).toContain('aria-hidden="true"');
    expect(body).not.toContain('<rect');
  });
});
