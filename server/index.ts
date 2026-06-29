import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = process.env.STATE_PATH ?? '/data/state.json';
const PORT = parseInt(process.env.PORT ?? '8080', 10);

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, '../dist')));

function readState(): unknown {
  try {
    if (!fs.existsSync(STATE_PATH)) return null;
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function writeState(data: unknown): void {
  const dir = path.dirname(STATE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = STATE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf-8');
  fs.renameSync(tmp, STATE_PATH);
}

app.get('/api/state', (_req, res) => {
  res.json(readState());
});

app.post('/api/state', (req, res) => {
  try {
    writeState(req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Farm RPG Tracker running on port ${PORT}`);
  console.log(`State file: ${STATE_PATH}`);
});
