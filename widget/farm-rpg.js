// Farm RPG Quest Tracker — Scriptable widget (iOS)
// ─────────────────────────────────────────────────
// Setup:
//   1. Install Scriptable (free) from the App Store.
//   2. In the tracker, go to Settings → iOS widget and create a widget key.
//   3. In Scriptable, create a new script and paste this whole file.
//   4. Add a Scriptable widget to your home screen (Medium or Large), long-press
//      it → Edit Widget: pick this script, and paste your widget key into
//      "Parameter".
//   (Running the script inside Scriptable asks for the key once instead and
//   keeps it in the Keychain.)
//
// Medium: STARMAPS & PAMRATS, items your active quests are short on, grow queue.
// Large: adds the mastery milestones you're closest to.

const APP_URL = "https://farm-rpg-tracker.fly.dev";
const KEYCHAIN_KEY = "farm-rpg-widget-key";

// ── Colours ──────────────────────────────────────────────
const C = {
  bg:     new Color("#0f172a"),
  card:   new Color("#1e293b"),
  green:  new Color("#4ade80"),
  yellow: new Color("#fbbf24"),
  orange: new Color("#fb923c"),
  red:    new Color("#f87171"),
  purple: new Color("#c084fc"),
  text:   new Color("#e2e8f0"),
  muted:  new Color("#94a3b8"),
  dim:    new Color("#64748b"),
};

// ── Helpers ──────────────────────────────────────────────
function num(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function minutes(m) {
  if (m == null) return "";
  if (m < 60) return `${Math.max(1, Math.round(m))}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
}

function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function text(stack, str, color, font) {
  const t = stack.addText(str);
  t.textColor = color;
  t.font = font;
  t.lineLimit = 1;
  return t;
}

function label(stack, str) {
  text(stack, str, C.dim, Font.boldSystemFont(8));
  stack.addSpacer(3);
}

function row(stack, left, leftColor, right, rightColor, size = 10) {
  const r = stack.addStack();
  r.layoutHorizontally();
  r.centerAlignContent();
  const l = text(r, left, leftColor, Font.systemFont(size));
  l.minimumScaleFactor = 0.8;
  r.addSpacer();
  text(r, right, rightColor, Font.mediumMonospacedSystemFont(size));
  stack.addSpacer(2);
}

// ── Key & data ───────────────────────────────────────────
async function widgetKey() {
  const param = (args.widgetParameter || "").trim();
  if (param) return param;
  if (Keychain.contains(KEYCHAIN_KEY)) return Keychain.get(KEYCHAIN_KEY);
  if (config.runsInWidget) return null;
  const a = new Alert();
  a.title = "Widget key";
  a.message = "Paste the key from the tracker's Settings → iOS widget.";
  a.addTextField("Widget key");
  a.addAction("Save");
  a.addCancelAction("Cancel");
  if ((await a.present()) === -1) return null;
  const key = a.textFieldValue(0).trim();
  if (key) Keychain.set(KEYCHAIN_KEY, key);
  return key || null;
}

async function fetchData(key) {
  try {
    const req = new Request(`${APP_URL}/api/widget`);
    req.headers = { "X-Widget-Key": key };
    req.timeoutInterval = 10;
    const data = await req.loadJSON();
    const code = req.response && req.response.statusCode;
    if (code === 401) return { error: "Widget key not recognised. Make a new one in Settings → iOS widget." };
    if (code !== 200) return { error: data && data.error ? data.error : "Can't reach the tracker" };
    return data;
  } catch {
    return { error: "Can't reach the tracker" };
  }
}

// ── Sections ─────────────────────────────────────────────
function holdSection(stack, data) {
  label(stack, "STARMAPS & PAMRATS");
  for (const h of data.holdLines) {
    if (!h.quest) {
      row(stack, `${h.line}`, C.text, "done ✓", C.green);
    } else {
      row(stack, h.quest, C.purple, h.short ? `${h.short}/${h.items} short` : "ready ✓", h.short ? C.orange : C.green);
    }
  }
}

function neededSection(stack, data, max) {
  label(stack, `ITEMS NEEDED · ${data.itemsShort}`);
  if (!data.needed.length) {
    text(stack, "✓ Everything stocked", C.green, Font.systemFont(10));
    return;
  }
  for (const n of data.needed.slice(0, max)) {
    row(stack, n.item, C.text, `${num(n.have)}/${num(n.need)}`, n.hold ? C.purple : C.orange);
  }
  if (data.itemsShort > max) text(stack, `+${data.itemsShort - max} more`, C.dim, Font.systemFont(9));
}

function growSection(stack, data, max) {
  if (!data.growQueue.length) return;
  stack.addSpacer(4);
  label(stack, "GROW QUEUE");
  for (const g of data.growQueue.slice(0, max)) {
    row(stack, `🌿 ${g.item} ×${g.grows}`, C.green, minutes(g.totalMinutes), C.muted);
  }
}

function masterySection(stack, data, max) {
  if (!data.mastery.length) return;
  label(stack, "CLOSEST MASTERY MILESTONES");
  for (const m of data.mastery.slice(0, max)) {
    const pct = Math.floor((m.count / m.target) * 100);
    row(stack, m.item, C.text, `${num(m.count)}/${num(m.target)} · ${pct}%`, C.yellow);
  }
}

// ── Build ────────────────────────────────────────────────
function header(w, data) {
  const h = w.addStack();
  h.layoutHorizontally();
  h.centerAlignContent();
  text(h, "🌱 Farm RPG", C.green, Font.boldSystemFont(13));
  h.addSpacer();
  if (data && !data.error) text(h, `${data.activeQuestCount} active`, C.yellow, Font.systemFont(11));
  w.addSpacer(6);
}

function footer(w, data) {
  w.addSpacer();
  const f = w.addStack();
  f.layoutHorizontally();
  text(f, `Synced ${ago(data.updatedAt)}`, C.dim, Font.systemFont(9));
  f.addSpacer();
  text(f, "tap to open →", C.dim, Font.systemFont(9));
}

function buildWidget(data) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(12, 14, 10, 14);
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  header(w, data);

  if (!data || data.error) {
    const t = w.addText(`⚠️ ${data ? data.error : "Add your widget key in the widget's Parameter"}`);
    t.textColor = C.red;
    t.font = Font.systemFont(11);
    w.addSpacer();
    return w;
  }

  const family = config.widgetFamily || "large";
  if (family === "small") {
    holdSection(w, data);
    w.addSpacer(4);
    text(w, `${data.itemsShort} items short`, C.orange, Font.systemFont(10));
    footer(w, data);
    return w;
  }

  // Two columns: quest items on the left, STARMAPS/PAMRATS + grow queue on the right
  const cols = w.addStack();
  cols.layoutHorizontally();
  const left = cols.addStack();
  left.layoutVertically();
  cols.addSpacer(12);
  const right = cols.addStack();
  right.layoutVertically();

  const large = family === "large" || family === "extraLarge";
  neededSection(left, data, large ? 8 : 4);
  holdSection(right, data);
  growSection(right, data, large ? 3 : 1);

  if (large) {
    w.addSpacer(8);
    masterySection(w, data, 5);
  }
  footer(w, data);
  return w;
}

// ── Run ──────────────────────────────────────────────────
const key = await widgetKey();
const data = key ? await fetchData(key) : null;
const widget = buildWidget(data);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentLarge();
}
Script.complete();
