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
  it('provides required addressing modes and multi-NIC IP examples', () => {
    for (const groupId of ['networking', 'native-ipv4']) {
      const group = GROUPS.find((candidate) => candidate.id === groupId)!;
      const modePrefix = groupId === 'networking' ? 'ipmode' : 'ipMode';
      expect(group.fields.find((field) => field.id === `${modePrefix}0`)?.default).toBe('STATICV4');
      expect(group.fields.find((field) => field.id === `${modePrefix}1`)?.default).toBe('STATICV4');
      expect(group.fields.find((field) => field.id === `${modePrefix}2`)?.default).toBe('STATICV4');
      expect(group.fields.find((field) => field.id === `${modePrefix}0`)?.options?.some((option) => option.value === '')).toBe(false);
      expect(group.fields.find((field) => field.id === 'ip1')?.placeholder).toBe('10.20.10.21');
      expect(group.fields.find((field) => field.id === 'netmask1')?.placeholder).toBe('255.255.255.0');
      expect(group.fields.find((field) => field.id === 'ip2')?.placeholder).toBe('172.16.10.21');
      expect(group.fields.find((field) => field.id === 'netmask2')?.placeholder).toBe('255.255.255.0');
    }
  });
});
