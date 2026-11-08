import { describe, expect, it } from 'vitest';
import { fieldHelp, GROUPS } from './schema';

const uagName = GROUPS.find((group) => group.id === 'appliance')!.fields.find(
  (field) => field.id === 'uagName'
)!;
const baseHelp = 'Up to 24 characters: A-Z, 0-9, minus and period; no spaces.';

describe('fieldHelp', () => {
  it('adds the Azure VM-name requirement only for Azure', () => {
    expect(fieldHelp(uagName, 'vsphere')).toBe(baseHelp);
    expect(fieldHelp(uagName, 'hyperv')).toBe(baseHelp);
    expect(fieldHelp(uagName, 'azure')).toBe(`${baseHelp} Must match the VM name on Azure.`);
  });

  it('returns static help unchanged', () => {
    expect(fieldHelp({ ...uagName, help: 'Static guidance.' }, 'azure')).toBe('Static guidance.');
  });
});
