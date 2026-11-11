import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FleetRemovalDialog from './FleetRemovalDialog.svelte';
const callbacks = { oncancel: () => {}, onconfirm: () => {} };

describe('Fleet removal confirmation', () => {
  it('names the appliance, explains retained settings and puts Cancel first', () => {
    const body = render(FleetRemovalDialog, { props: { kind: 'member', label: 'uag-dmz-01', ...callbacks } }).body;
    expect(body).toContain('Remove UAG?');
    expect(body).toContain('uag-dmz-01');
    expect(body).toContain('Undo removal restores it');
    expect(body).toContain('Nothing is removed from your live infrastructure');
    expect(body.indexOf('>Cancel</button>')).toBeLessThan(body.indexOf('id="confirm-fleet-removal"'));
    expect(body).toContain('aria-labelledby="fleet-remove-title"');
    expect(body).toContain('aria-describedby="fleet-remove-description"');
  });
  it.each([0, 1, 3])('explains group-wide removal of %s active members', count => {
    const body = render(FleetRemovalDialog, { props: { kind: 'group', label: 'UAG group A', count, ...callbacks } }).body;
    expect(body).toContain('Remove UAG group?');
    expect(body).toContain(`${count} active UAG${count === 1 ? '' : 's'}`);
    expect(body).toContain('restores the group and its appliances');
  });
  it('escapes imported names and does not add nested buttons', () => {
    const body = render(FleetRemovalDialog, { props: { kind: 'member', label: '<script>bad</script>', ...callbacks } }).body;
    expect(body).toContain('&lt;script>bad&lt;/script>');
    expect(body).not.toContain('<script>bad</script>');
    expect(body).not.toMatch(/<button\b[^>]*>(?:(?!<\/button>).)*<button\b/s);
  });
});
