// Merging the app's saved state when the row changed underneath it.
export type Json = Record<string, unknown>;

// JSON with object keys sorted, so key order (which Postgres jsonb changes) doesn't matter
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => (v as Json)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable((v as Json)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'undefined';
}
export const same = (a: unknown, b: unknown) => stable(a) === stable(b);
const isPlainObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

// Three-way merge for when the saved row changed since this tab last read it
// (another device, or the Chrome extension updating inventory): whatever this
// tab changed since `base` wins, everything else is taken from `remote`.
// Objects such as inventory and questStatuses are merged entry by entry.
export function mergeStates(base: Json, local: Json, remote: Json): Json {
  const out: Json = { ...remote };
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const b = base[key], l = local[key], r = remote[key];
    if (same(l, b)) continue;                         // unchanged here: keep remote
    if (isPlainObject(l) && isPlainObject(r) && isPlainObject(b ?? {})) {
      out[key] = mergeStates((b ?? {}) as Json, l, r);
    } else {
      out[key] = l;
    }
  }
  for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key];
  return out;
}
