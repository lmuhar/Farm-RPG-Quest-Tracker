// Builds the Chrome extension into extension/dist (load it with "Load unpacked").
// Supabase details come from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, or
// fly.toml when those aren't set (the anon key is public, it ships in the app).
import { build } from 'rolldown';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'dist');
const fly = fs.readFileSync(path.join(here, '../fly.toml'), 'utf8');
const fromFly = (name) => fly.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`))?.[1];
const url = process.env.VITE_SUPABASE_URL || fromFly('VITE_SUPABASE_URL');
const key = process.env.VITE_SUPABASE_ANON_KEY || fromFly('VITE_SUPABASE_ANON_KEY');
if (!url || !key) throw new Error('Supabase URL and anon key not found');

// The extension only needs a few fields of each quest
const slimQuests = {
  name: 'slim-quests',
  load(id) {
    if (!id.replace(/\\/g, '/').endsWith('src/data/quests.json')) return null;
    const quests = JSON.parse(fs.readFileSync(id, 'utf8'))
      .map(({ id, name, questline, itemsRequired, rewardItems }) => ({ id, name, questline, itemsRequired, rewardItems }));
    return { code: `export default ${JSON.stringify(quests)};`, moduleType: 'js' };
  },
};

fs.rmSync(out, { recursive: true, force: true });
const define = {
  __SUPABASE_URL__: JSON.stringify(url),
  __SUPABASE_ANON_KEY__: JSON.stringify(key),
  'process.env.NODE_ENV': '"production"',
};
for (const [entry, format] of [['content', 'iife'], ['background', 'esm']]) {
  await build({
    input: path.join(here, `src/${entry}.ts`),
    plugins: [slimQuests],
    transform: { define },
    output: { file: path.join(out, `${entry}.js`), format, minify: true },
  });
}
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'manifest.json'), 'utf8'));
manifest.host_permissions = [`${new URL(url).origin}/*`];
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Built extension → ${path.relative(process.cwd(), out)}`);
