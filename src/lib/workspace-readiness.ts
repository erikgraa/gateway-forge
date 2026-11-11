import { fleetExportIssues } from './fleet';
import { normalizeConfig } from './ordinary-whitespace';
import { validateConfig } from './validate';
import type { Workspace } from './scenario-workspaces';

export function workspaceExportReadiness(workspace: Workspace) {
  const issues = workspace.fleet
    ? fleetExportIssues(workspace.fleet)
    : validateConfig(normalizeConfig(workspace.config));
  const blocking = issues.filter(issue => issue.level === 'error').length;
  return {
    ready: blocking === 0,
    blocking,
    warnings: issues.filter(issue => issue.level === 'warn').length,
    format: workspace.fleet ? 'Fleet ZIP' : 'INI / JSON',
    planningRequired: !!workspace.fleet && !workspace.fleet.unlocked
  };
}
