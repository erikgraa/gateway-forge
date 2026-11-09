import { describe, expect, it } from 'vitest';
import { GROUPS } from './schema';

describe('schema integrity', () => {
  it('uses unique field and select-option keys within each group', () => {
    expect(new Set(GROUPS.map((group) => group.id)).size).toBe(GROUPS.length);
    for (const group of GROUPS) {
      const ids = group.fields.map((field) => field.id);
      expect(new Set(ids).size, group.id).toBe(ids.length);
      for (const field of group.fields) {
        if (!field.options) continue;
        const values = field.options.map((option) => option.value);
        expect(new Set(values).size, `${group.id}.${field.id}`).toBe(values.length);
      }
    }
  });

  it('keeps network addressing separate from deployment target settings', () => {
    const deploy = GROUPS.find((group) => group.id === 'deploy')!;
    const networking = GROUPS.find((group) => group.id === 'networking')!;
    expect(deploy.fields.map((field) => field.id)).not.toContain('netInternet');
    expect(networking.fields.map((field) => field.id)).toEqual(expect.arrayContaining([
      'netInternet',
      'ip0',
      'defaultGateway',
      'routes0',
      'ipmode0',
      'v6ip0',
      'eth0CustomConfig'
    ]));
  });
});
