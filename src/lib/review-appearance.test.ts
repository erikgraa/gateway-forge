import { describe, it, expect } from 'vitest';
import { appearancePreference, resolvedTheme } from './review-appearance';
describe('isolated appearance preferences', () => {
  it.each([undefined,null,'bad',{palette:'unknown',theme:'bad'}])('uses original/system for invalid %s', value => expect(appearancePreference(value)).toEqual({palette:'original',theme:'system'}));
  it.each(['original','harbor','slate'] as const)('keeps %s independent of theme', palette => expect(appearancePreference({palette,theme:'dark'})).toEqual({palette,theme:'dark'}));
  it('resolves system live and preserves manual overrides', () => { expect(resolvedTheme('system',false)).toBe('light');expect(resolvedTheme('system',true)).toBe('dark');expect(resolvedTheme('light',true)).toBe('light');expect(resolvedTheme('dark',false)).toBe('dark'); });
});
