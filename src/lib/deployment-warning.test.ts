import { describe, expect, it } from 'vitest';
import { DEFAULT_VERSION, VERSIONS, olderDeploymentWarning } from './versions';
import { applyPatch, defaultConfig } from './model';
import { validateConfig } from './validate';

describe('older UAG deployment advisory', () => {
  it.each(VERSIONS.filter((version) => version.id < DEFAULT_VERSION).map((version) => version.id))('warns without blocking UAG %s or mutating its selected release', (version) => {
    const config = applyPatch(defaultConfig(), { version });
    const message = olderDeploymentWarning(version)!;
    expect(message).toContain(`documentation for UAG ${version}`);
    expect(message).toContain('may not be compatible');
    expect(validateConfig(config).filter((issue) => issue.message === message)).toEqual([expect.objectContaining({ level: 'warn', section: 'general' })]);
    expect(config.version).toBe(version);
  });
  it('does not issue an older-release warning for the current or newer release', () => {
    expect(olderDeploymentWarning(DEFAULT_VERSION)).toBeNull();
    expect(olderDeploymentWarning('2612')).toBeNull();
    expect(validateConfig(defaultConfig()).some((issue) => issue.message.includes('Newer uagdeploy.ps1'))).toBe(false);
  });
});
