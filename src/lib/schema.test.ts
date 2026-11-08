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
});
