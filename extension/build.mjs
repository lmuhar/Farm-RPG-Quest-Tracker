// Builds the Chrome extension into extension/dist (load it with "Load unpacked").
// Supabase details come from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, or
// fly.toml when those aren't set (the anon key is public, it ships in the app).
import { build } from 'rolldown';
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'dist');
const fly = fs.readFileSync(path.join(here, '../fly.toml'), 'utf8');
const fromFly = (name) => fly.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`))?.[1];
const url = process.env.VITE_SUPABASE_URL || fromFly('VITE_SUPABASE_URL');
const key = process.env.VITE_SUPABASE_ANON_KEY || fromFly('VITE_SUPABASE_ANON_KEY');
if (!url || !key) throw new Error('Supabase URL and anon key not found');
// Where the tracker app is served; it hosts the latest extension zip for updates
const appUrl = (process.env.EXTENSION_APP_URL || `https://${fly.match(/^app\s*=\s*"([^"]+)"/m)?.[1]}.fly.dev`).replace(/\/$/, '');

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
  __APP_URL__: JSON.stringify(appUrl),
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
manifest.host_permissions = [`${new URL(url).origin}/*`, `${new URL(appUrl).origin}/*`];

// The build id is a hash of the code, so the same source always gets the same
// id and the extension can tell when the app has a different (newer) build.
const id = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(out, 'content.js')))
  .update(fs.readFileSync(path.join(out, 'background.js')))
  .update(JSON.stringify(manifest))
  .digest('hex').slice(0, 10);
manifest.version_name = `${manifest.version} (${id})`;
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(out, 'build.json'), JSON.stringify({ id }));

// Release copy for the app to serve: extension.zip + extension.json
const release = path.join(here, 'release');
fs.rmSync(release, { recursive: true, force: true });
fs.mkdirSync(release);
const files = fs.readdirSync(out).sort().map((name) => ({ name, data: fs.readFileSync(path.join(out, name)) }));
fs.writeFileSync(path.join(release, 'extension.zip'), zip(files));
fs.writeFileSync(path.join(release, 'extension.json'), JSON.stringify({ id }));
console.log(`Built extension ${id} → ${path.relative(process.cwd(), out)} (+ release/extension.zip)`);

// Minimal zip writer (deflate, no dependencies)
function zip(entries) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const DOS_DATE = (1 << 5) | 1; // 1980-01-01, fixed so the zip is reproducible
  const local = [], central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name);
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0, 6);
    head.writeUInt16LE(8, 8); head.writeUInt16LE(0, 10); head.writeUInt16LE(DOS_DATE, 12);
    head.writeUInt32LE(crc, 14); head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBuf.length, 26); head.writeUInt16LE(0, 28);
    local.push(head, nameBuf, packed);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0, 8); dir.writeUInt16LE(8, 10); dir.writeUInt16LE(0, 12); dir.writeUInt16LE(DOS_DATE, 14);
    dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(packed.length, 20); dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28); dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);
    offset += 30 + nameBuf.length + packed.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuf, end]);
}
