import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { workspaceExportReadiness } from '../lib/workspace-readiness';
const ready: ReturnType<typeof workspaceExportReadiness> = { ready: true, blocking: 0, warnings: 2, format: 'INI / JSON', planningRequired: false };
import DraftExportReadiness from './DraftExportReadiness.svelte';

describe('Saved draft export-readiness presentation', () => {
  it('shows only existing advisory warnings for ready drafts and uses readable export-only language', () => {
    const body = render(DraftExportReadiness, { props: { status: ready } }).body;
    expect(body).toContain('Ready to export');
    expect(body).not.toContain('0 blockers');
    expect(body).toContain('warnings');
    expect(body).not.toContain('INI / JSON');
    expect(body).toContain('Deployment, network connectivity, security and live failover remain unverified');
    expect(body).toContain('aria-hidden="true"');
    expect(body).not.toMatch(/class="draft-readiness[^\"]*blocked/);
  });
  it('omits the counts line entirely when a ready draft has no warnings', () => {
    const body = render(DraftExportReadiness, { props: { status: { ...ready, warnings: 0 } } }).body;
    expect(body).toContain('Ready to export');
    expect(body).not.toContain('readiness-counts');
    expect(body).not.toContain('0 blockers');
    expect(body).not.toContain('0 warnings');
    expect(body).not.toContain('INI / JSON');
    expect(body).not.toContain('readiness-scope');
  });
  it('keeps ready Horizon cards compact with fleet scope in accessible help only', () => {
    const body = render(DraftExportReadiness, { props: { status: { ...ready, format: 'Fleet ZIP' } } }).body;
    expect(body).toContain('Ready to export');
    expect(body).not.toContain('Fleet ZIP');
    expect(body).not.toContain('readiness-scope');
    expect(body).toContain('Horizon fleet export readiness');
    expect(body).not.toContain('0 blockers');
  });
  it('makes an unplanned Horizon draft explicitly fleet-ZIP blocked', () => {
    const status = { ...ready, ready: false, blocking: 1, format: 'Fleet ZIP', planningRequired: true };
    const body = render(DraftExportReadiness, { props: { status } }).body;
    expect(body).toContain('Needs fixes');
    expect(body).toContain('1 blocker');
    expect(body).not.toContain('Fleet ZIP');
    expect(body).not.toContain('INI / JSON');
    expect(body).toContain('Topology not planned');
    expect(body).toMatch(/class="draft-readiness[^\"]*blocked/);
  });
  it('pluralizes blocking counts and does not mutate its status', () => {
    const status = { ...ready, ready: false, blocking: 3, warnings: 0 }, before = JSON.stringify(status);
    const body = render(DraftExportReadiness, { props: { status } }).body;
    expect(body).toContain('Needs fixes');
    expect(body).toContain('3 blockers');
    expect(body).toContain('0 warnings');
    expect(JSON.stringify(status)).toBe(before);
  });
});
