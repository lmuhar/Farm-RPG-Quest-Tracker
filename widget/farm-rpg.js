// Farm RPG Quest Tracker — Scriptable Widget
// ─────────────────────────────────────────────
// Setup:
//   1. Install Scriptable (free) from the App Store
//   2. Create a new script, paste this entire file
//   3. Set APP_URL to your Fly.io app URL (no trailing slash)
//   4. Add a Scriptable widget to your home screen, select this script
//   5. Choose Medium widget size for best results

const APP_URL = "https://YOUR-APP.fly.dev"; // ← change this

// ── Colours ──────────────────────────────────────────────
const C = {
  bg:        new Color("#0f172a"),
  bgCard:    new Color("#1e293b"),
  green:     new Color("#4ade80"),
  yellow:    new Color("#fbbf24"),
  orange:    new Color("#fb923c"),
  red:       new Color("#f87171"),
  text:      new Color("#e2e8f0"),
  muted:     new Color("#94a3b8"),
  dim:       new Color("#475569"),
  dimmer:    new Color("#1e293b"),
  purple:    new Color("#c084fc"),
};

// ── Helpers ───────────────────────────────────────────────
function fmt(minutes) {
  if (!minutes) return "—";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function timeAgo(isoString) {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function addRow(parent, leftText, leftColor, rightText, rightColor, fontSize = 11) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  const l = row.addText(leftText);
  l.textColor = leftColor;
  l.font = Font.systemFont(fontSize);
  l.lineLimit = 1;
  row.addSpacer();
  const r = row.addText(rightText);
  r.textColor = rightColor;
  r.font = Font.regularMonospacedSystemFont(fontSize);
  return row;
}

// ── Fetch data ────────────────────────────────────────────
async function fetchData() {
  try {
    const req = new Request(`${APP_URL}/api/widget`);
    req.timeoutInterval = 8;
    return await req.loadJSON();
  } catch {
    return null;
  }
}

// ── Build widget ──────────────────────────────────────────
function buildWidget(data) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(12, 14, 10, 14);
  w.url = APP_URL;

  // ── Header ──
  const header = w.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();

  const titleText = header.addText("🌱 Farm RPG");
  titleText.textColor = C.green;
  titleText.font = Font.boldSystemFont(13);

  header.addSpacer();

  if (data) {
    const badge = header.addText(`${data.activeQuestCount} active`);
    badge.textColor = C.yellow;
    badge.font = Font.systemFont(11);
  }

  w.addSpacer(6);

  if (!data) {
    const err = w.addText("⚠️ Can't reach tracker");
    err.textColor = C.red;
    err.font = Font.systemFont(12);
    w.addSpacer();
    return w;
  }

  // ── Items still needed ──
  const needed = data.itemsStillNeeded ?? [];
  if (needed.length === 0) {
    const ok = w.addText("✓ All active quest items stocked");
    ok.textColor = C.green;
    ok.font = Font.systemFont(11);
  } else {
    const sectionLabel = w.addText("ITEMS NEEDED");
    sectionLabel.textColor = C.dim;
    sectionLabel.font = Font.boldSystemFont(8);
    w.addSpacer(3);

    const shown = needed.slice(0, 5);
    for (const item of shown) {
      addRow(w, item.item, C.text, `${item.have}/${item.needed}`, C.orange);
      w.addSpacer(1);
    }
    if (needed.length > 5) {
      const more = w.addText(`+${needed.length - 5} more`);
      more.textColor = C.dim;
      more.font = Font.systemFont(9);
    }
  }

  // ── Grow queue ──
  const queue = (data.growQueue ?? []).filter(g => g.grows > 0);
  if (queue.length > 0) {
    w.addSpacer(6);
    const gl = w.addText("GROW QUEUE");
    gl.textColor = C.dim;
    gl.font = Font.boldSystemFont(8);
    w.addSpacer(3);

    for (const g of queue.slice(0, 3)) {
      const label = `🌿 ${g.item} ×${g.grows}`;
      const time = g.totalMinutes ? fmt(g.totalMinutes) : `${g.grows} grow${g.grows !== 1 ? "s" : ""}`;
      addRow(w, label, C.green, time, C.muted);
      w.addSpacer(1);
    }
  }

  // ── Footer ──
  w.addSpacer();
  const footer = w.addStack();
  footer.layoutHorizontally();
  const updated = footer.addText(`Updated ${timeAgo(data.updatedAt)}`);
  updated.textColor = C.dim;
  updated.font = Font.systemFont(9);
  footer.addSpacer();
  const tap = footer.addText("tap to open →");
  tap.textColor = C.dimmer;
  tap.font = Font.systemFont(9);

  return w;
}

// ── Run ───────────────────────────────────────────────────
const data = await fetchData();
const widget = buildWidget(data);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
