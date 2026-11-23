export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type FieldChange = { from: JsonValue | undefined; to: JsonValue | undefined };
export type JsonDiff = Record<string, FieldChange>;

/** Normalises entities (Dates, undefined, nested objects) into plain JSON. */
export function toJson(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value ?? {})) as JsonObject;
}

/**
 * Shallow field-level diff between two snapshots. Nested values are compared structurally.
 * Fields listed in `ignore` (e.g. updatedAt, secrets) are dropped.
 */
export function jsonDiff(
  before: unknown,
  after: unknown,
  ignore: readonly string[] = ['updatedAt'],
): JsonDiff {
  const a = before == null ? {} : toJson(before);
  const b = after == null ? {} : toJson(after);
  const diff: JsonDiff = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (ignore.includes(key)) continue;
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      diff[key] = { from: a[key], to: b[key] };
    }
  }
  return diff;
}
