import { GROUPS, LISTS, type Field, type Values } from './schema';
import { cloneConfig, type Config } from './model';
import { buildVCenterTarget, parseVCenterTarget } from './vcenterTarget';

// Only actively edited guided parts may rewrite a locator. Imports/full locators stay opaque.
const guidedTargets = new WeakSet<Values>();
export function markGuidedTarget(values: Values, guided: boolean): void {
  if (guided) guidedTargets.add(values);
  else guidedTargets.delete(values);
}
export function trailingWhitespace(value: string): string {
  return value.replace(/\s+$/u, '');
}
export function ordinaryField(field: Field): boolean {
  return field.type === 'text' && !field.secret && !field.certificateInput && field.id !== 'target' && !field.escapeNewlines && field.rule !== 'customConfig';
}
export function normalizeField(field: Field, value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (field.rows && field.rows.rule !== 'sshPublicKeys') {
    // Keep separators and leading/internal spelling, including CRLF, exactly as entered.
    return value.replace(/[^\r\n]+/g, trailingWhitespace);
  }
  return ordinaryField(field) && !/[\r\n]/.test(value) ? trailingWhitespace(value) : value;
}
function normalizeValues(original: Values, output: Values, fields: Field[]): void {
  for (const field of fields) {
    if (Object.hasOwn(output, field.id)) output[field.id] = normalizeField(field, output[field.id]) as Values[string];
  }
  if (guidedTargets.has(original)) {
    const target = parseVCenterTarget(String(original.target ?? ''));
    if (target) output.target = buildVCenterTarget({ username: trailingWhitespace(target.username), server: trailingWhitespace(target.server), inventoryPath: trailingWhitespace(target.inventoryPath) });
  }
}
/** Snapshot normalization never edits a live input/model or walks unknown opaque strings. */
export function normalizeConfig(config: Config): Config {
  const result = cloneConfig(config);
  normalizeValues(config.values, result.values, GROUPS.flatMap(group => group.fields));
  for (const list of LISTS) {
    for (let index = 0; index < (result[list.id]?.length ?? 0); index++) normalizeValues(config[list.id][index], result[list.id][index], list.fields);
  }
  return result;
}
