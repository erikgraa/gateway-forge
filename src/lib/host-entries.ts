import type { Field, Values } from './schema';

export const HOST_ENTRY_MAX = 6;

export function normalizeHostEntries(values: Values, fields: Field[]): void {
  const ordered = fields.filter((f) => f.hostEntryIndex !== undefined)
    .sort((a, b) => a.hostEntryIndex! - b.hostEntryIndex!);
  const entries = hostEntryValues(values, ordered);
  ordered.forEach((f, index) => {
    // Keep an oversized legacy list visible and invalid rather than discarding entries.
    values[f.id] = index === HOST_ENTRY_MAX - 1 ? entries.slice(index).join(',') : entries[index] ?? '';
  });
}

export function hostEntryValues(values: Values, fields: Field[]): string[] {
  return fields.filter((f) => f.hostEntryIndex !== undefined)
    .sort((a, b) => a.hostEntryIndex! - b.hostEntryIndex!)
    .flatMap((f) => String(values[f.id] ?? '').split(',').map((s) => s.trim()).filter(Boolean));
}

export function removeHostEntry(values: Values, fields: Field[], index: number): void {
  const ordered = fields.filter((f) => f.hostEntryIndex !== undefined)
    .sort((a, b) => a.hostEntryIndex! - b.hostEntryIndex!);
  const entries = hostEntryValues(values, ordered);
  entries.splice(index, 1);
  ordered.forEach((f, i) => { values[f.id] = entries[i] ?? ''; });
}
