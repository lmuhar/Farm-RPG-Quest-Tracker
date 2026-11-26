// Bundles server/index.ts (and the app code the widget endpoint shares) into
// dist-server/index.js. npm packages stay external and load from node_modules.
// Supabase details come from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, or
// fly.toml when those aren't set (the anon key is public, it ships in the app).
import { build } from 'rolldown';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fly = fs.readFileSync(path.join(root, 'fly.toml'), 'utf8');
const fromFly = (name) => fly.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`))?.[1];
const url = process.env.VITE_SUPABASE_URL || fromFly('VITE_SUPABASE_URL');
const key = process.env.VITE_SUPABASE_ANON_KEY || fromFly('VITE_SUPABASE_ANON_KEY');
if (!url || !key) throw new Error('Supabase URL and anon key not found');

fs.rmSync(path.join(root, 'dist-server'), { recursive: true, force: true });
await build({
  input: path.join(root, 'server/index.ts'),
  platform: 'node',
  external: (id) => !id.startsWith('.') && !path.isAbsolute(id),
  transform: { define: { __SUPABASE_URL__: JSON.stringify(url), __SUPABASE_ANON_KEY__: JSON.stringify(key) } },
  output: { file: path.join(root, 'dist-server/index.js'), format: 'esm' },
});
console.log('Built server → dist-server/index.js');
