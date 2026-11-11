export type Palette = 'original' | 'harbor' | 'slate';
export type ThemePreference = 'system' | 'light' | 'dark';
export interface Appearance { palette: Palette; theme: ThemePreference }
export function appearancePreference(value: unknown): Appearance {
  const candidate = value && typeof value === 'object' ? value as Partial<Appearance> : {};
  return { palette: ['original','harbor','slate'].includes(candidate.palette || '') ? candidate.palette! : 'original', theme: ['system','light','dark'].includes(candidate.theme || '') ? candidate.theme! : 'system' };
}
export function resolvedTheme(preference: ThemePreference, systemDark: boolean): 'light' | 'dark' {
  return preference === 'system' ? systemDark ? 'dark' : 'light' : preference;
}
