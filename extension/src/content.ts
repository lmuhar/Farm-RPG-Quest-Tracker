// Runs on farmrpg.com. Adds have/need badges to the Inventory page, item pages
// and Craftworks, reads the counts those pages show and sends them to the
// tracker. It only reads the page; it never clicks anything or talks to Farm RPG.
import { activeQuests, itemNeeds, type ItemNeed } from '../../src/itemNeeds';
import { send, type InventorySource, type Status } from './messages';
import { addMasteryCount } from '../../src/masteryParse';

let status: Status | null = null;
let needs = new Map<string, ItemNeed>();
let version = 0;                    // bumps whenever needs change, so badges redraw
let busy = false;
const lastPushed = new Map<string, string>();   // what we last sent per page, to skip repeats

const fmt = (n: number) => n.toLocaleString('en-US');
const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${Math.max(s, 1)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = `qt-x ${cls}`.trim();
  if (text !== undefined) e.textContent = text;
  return e;
}

// ── Styles ───────────────────────────────────────────────────────────────────
const style = document.createElement('style');
style.textContent = `
.qt-badge{display:inline-block;font:700 11px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;padding:0 7px;border-radius:10px;margin-left:6px;white-space:nowrap;cursor:pointer;vertical-align:middle;font-variant-numeric:tabular-nums}
.qt-short{background:#4a2a1c;color:#ffa26b;border:1px solid #7a3f22}
.qt-ok{background:#1f3a24;color:#7fdc8f;border:1px solid #2f6a3a}
.qt-hold{background:#33264a;color:#c9a2ff;border:1px solid #57408a}
.qt-pop{position:fixed;z-index:2147483646;width:260px;background:#15171b;color:#ddd;border:1px solid #444;border-radius:8px;padding:10px 12px;font:12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5)}
.qt-pop b{color:#fff}
.qt-row{display:flex;justify-content:space-between;gap:8px}
.qt-row span:last-child{font-variant-numeric:tabular-nums}
.qt-tot{border-top:1px solid #333;margin-top:4px;padding-top:4px;font-weight:700;color:#fff}
.qt-muted{color:#8a8f99}
.qt-itemcard{margin:8px 12px;padding:8px 12px;border-radius:8px;background:rgba(0,0,0,.25);font:12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;text-align:left}
.qt-itemcard .qt-badge{margin-left:0;margin-bottom:4px}
`;
document.documentElement.appendChild(style);

// ── Badges ───────────────────────────────────────────────────────────────────
function badgeText(n: ItemNeed) {
  return `${n.state === 'ok' ? '✓ ' : ''}${fmt(n.have)} / ${fmt(n.need)}`;
}

function breakdown(item: string, n: ItemNeed): HTMLElement {
  const box = el('div', '');
  const head = el('div', '');
  head.append(el('b', '', item), document.createTextNode(` · you have ${fmt(n.have)}`));
  box.append(head);
  for (const l of n.lines) {
    const row = el('div', 'qt-row');
    row.append(el('span', '', l.label + (l.kind === 'hold' ? ' (hold)' : '')), el('span', '', fmt(l.qty)));
    box.append(row);
  }
  const tot = el('div', 'qt-row qt-tot');
  const short = n.need - n.have;
  tot.append(el('span', '', 'Total needed'), el('span', '', `${fmt(n.need)}${short > 0 ? ` · short ${fmt(short)}` : ''}`));
  box.append(tot);
  if (n.lines.filter((l) => l.kind === 'hold').length > 1) {
    box.append(el('div', 'qt-muted', 'Held items count the largest amount, not the sum.'));
  }
  return box;
}

let pop: HTMLElement | null = null;
function closePop() { pop?.remove(); pop = null; }
document.addEventListener('click', (e) => {
  if (pop && !pop.contains(e.target as Node)) closePop();
}, true);

function badge(item: string, n: ItemNeed): HTMLElement {
  const b = el('span', `qt-badge qt-${n.state}`, badgeText(n));
  b.title = 'Needed for your active quests (tap for details)';
  b.addEventListener('click', (e) => {
    // The badge sits inside the game's item link: don't follow it
    e.preventDefault();
    e.stopPropagation();
    const wasOpen = pop?.dataset.item === item;
    closePop();
    if (wasOpen) return;
    pop = el('div', 'qt-pop');
    pop.dataset.item = item;
    pop.append(breakdown(item, n));
    document.body.append(pop);
    const r = b.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.right - 260), window.innerWidth - 268);
    const top = r.bottom + 6 + pop.offsetHeight > window.innerHeight ? r.top - 6 - pop.offsetHeight : r.bottom + 6;
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(8, top)}px`;
  });
  return b;
}

// ── Reading the game's pages ─────────────────────────────────────────────────
const textNumber = (node: Element | null | undefined): number | null => {
  if (!node) return null;
  const own = [...node.childNodes].filter((c) => c.nodeType === Node.TEXT_NODE).map((c) => c.textContent).join('');
  const m = own.replace(/,/g, '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};

interface PageRead {
  source: InventorySource;
  full: boolean;
  counts: Record<string, number>;
  place: (needFor: (item: string) => ItemNeed | undefined) => void;
}

function readInventory(page: Element): PageRead | null {
  const rows: { name: string; after: Element }[] = [];
  const counts: Record<string, number> = {};
  for (const link of page.querySelectorAll('li a.item-link[href*="item.php?id="]')) {
    const name = link.querySelector('.item-title strong')?.textContent?.trim();
    const after = link.querySelector('.item-after');
    const qty = textNumber(after);
    if (!name || !after || qty === null) continue;
    rows.push({ name, after });
    if (qty > 0) counts[name] = qty;
  }
  if (!rows.length) return null;
  return {
    source: 'Inventory page',
    full: true,
    counts,
    place: (needFor) => {
      for (const { name, after } of rows) {
        const n = needFor(name);
        if (n) after.append(badge(name, n));
      }
    },
  };
}

function readItem(page: Element): PageRead | null {
  const img = page.querySelector<HTMLImageElement>('#img img.itemimglg, #img img');
  const name = img?.alt?.trim();
  if (!name) return null;
  const invRow = [...page.querySelectorAll('li .item-inner')].find((r) => r.querySelector('.item-title')?.textContent?.trim().startsWith('My Inventory'));
  const qty = textNumber(invRow?.querySelector('.item-after'));
  return {
    source: 'Item page',
    full: false,
    counts: qty === null ? {} : { [name]: qty },
    place: (needFor) => {
      const n = needFor(name);
      const anchor = page.querySelector('#img');
      if (!n || !anchor) return;
      const card = el('div', 'qt-itemcard');
      card.append(badge(name, n), breakdown(name, n));
      anchor.after(card);
    },
  };
}

function readCraftworks(page: Element): PageRead | null {
  const rows: { name: string; title: Element }[] = [];
  const counts: Record<string, number> = {};
  for (const li of page.querySelectorAll<HTMLElement>('.cwitems li[data-name]')) {
    const name = li.dataset.name?.trim();
    const title = li.querySelector('.item-title');
    const m = title?.textContent?.replace(/,/g, '').match(/Inventory:\s*(\d+)/);
    if (!name || !title) continue;
    rows.push({ name, title });
    if (m) counts[name] = parseInt(m[1], 10);
  }
  if (!rows.length) return null;
  return {
    source: 'Craftworks',
    full: false,
    counts,
    place: (needFor) => {
      for (const { name, title } of rows) {
        const n = needFor(name);
        if (n) (title.querySelector('strong') ?? title).after(badge(name, n));
      }
    },
  };
}

const READERS: Record<string, (page: Element) => PageRead | null> = {
  inventory: readInventory,
  item: readItem,
  craftworks: readCraftworks,
};

function currentPage(): Element | null {
  const main = document.querySelector('.view-main');
  if (!main) return null;
  return main.querySelector('.page.page-on-center[data-page]') ?? [...main.querySelectorAll('.page[data-page]')].pop() ?? null;
}

// ── Scanning ─────────────────────────────────────────────────────────────────
let scanned: { page: Element; version: number } | null = null;

async function scan(force = false) {
  const page = currentPage();
  if (!page) return;
  if (!force && scanned?.page === page && scanned.version === version) return;
  const pageName = (page as HTMLElement).dataset.page ?? '';
  scanned = { page, version };
  // Matched by page name, or by its "Mastery In-Progress" heading in case the name differs
  if (MASTERY_PAGES.has(pageName) || (!READERS[pageName] && page.textContent?.includes('Mastery In-Progress'))) {
    return syncMastery(page as HTMLElement, force);
  }
  const reader = READERS[pageName];
  if (!reader) return;
  const read = reader(page);
  if (!read) return;

  // Redraw this page's badges
  page.querySelectorAll('.qt-x').forEach((e) => e.remove());
  read.place((item) => needs.get(item));

  // Send the counts when they differ from what we last sent from this page
  if (!status?.signedIn || busy) return;
  const key = `${read.source}:${Object.keys(read.counts).sort().join('|')}`;
  const sig = JSON.stringify(read.counts);
  if (!force && lastPushed.get(key) === sig) return;
  if (!read.full && Object.entries(read.counts).every(([item, qty]) => (status!.inventory[item] ?? 0) === qty)) {
    lastPushed.set(key, sig);
    return;
  }
  if (read.full && !Object.keys(read.counts).length) return;
  lastPushed.set(key, sig);
  busy = true;
  renderPanel();
  try {
    setStatus(await send({ type: 'push', inventory: read.counts, full: read.full, source: read.source, allowRemovals: force }));
  } catch (e) {
    if (status) setStatus({ ...status, error: (e as Error).message });
  } finally {
    busy = false;
    renderPanel();
  }
}

// Mastery page: no badges, just send the levels and counts it shows. Uses the
// same tier rules as the tracker's mastery bookmarklet.
const MASTERY_PAGES = new Set(['mastery', 'masteries']);
async function syncMastery(page: HTMLElement, force: boolean) {
  if (!status?.signedIn || busy) return;
  // Every row has the item name in <strong> and "N / M Progress" under it.
  // Reading rows (not visible text) also picks up items in collapsed tiers.
  const levels: Record<string, number> = {};
  const progress: Record<string, number> = {};
  for (const title of page.querySelectorAll('.item-title')) {
    const name = title.querySelector('strong')?.textContent?.trim();
    const m = title.textContent?.match(/([\d,]+)\s*\/[^\n]*Progress/);
    if (name && m) addMasteryCount(levels, progress, name, parseInt(m[1].replace(/,/g, ''), 10));
  }
  if (!Object.keys(levels).length && !Object.keys(progress).length) return;
  const sig = JSON.stringify({ levels, progress });
  if (!force && lastPushed.get('mastery') === sig) return;
  lastPushed.set('mastery', sig);
  busy = true;
  renderPanel();
  try {
    setStatus(await send({ type: 'pushMastery', levels, progress }));
  } catch (e) {
    setStatus({ ...status, error: (e as Error).message });
  } finally {
    busy = false;
    renderPanel();
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
function scheduleScan() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void scan(); }, 200);
}

const isOurs = (n: Node) => n instanceof Element && (n.classList.contains('qt-x') || n.id === 'qt-host');
new MutationObserver((records) => {
  if (records.every((r) => isOurs(r.target) || ([...r.addedNodes, ...r.removedNodes].length > 0 && [...r.addedNodes, ...r.removedNodes].every(isOurs)))) return;
  scheduleScan();
}).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

function setStatus(s: Status) {
  status = s;
  needs = s.signedIn ? itemNeeds(s.questStatuses, s.inventory) : new Map();
  version++;
  renderPanel();
  scheduleScan();
}

// ── Panel ────────────────────────────────────────────────────────────────────
const host = document.createElement('div');
host.id = 'qt-host';
host.style.cssText = 'position:fixed;top:58px;right:10px;z-index:2147483645';
const shadow = host.attachShadow({ mode: 'open' });
document.body.append(host);
let panelOpen = false;

const PANEL_CSS = `
:host{all:initial}
*{box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
.dot{width:26px;height:26px;border-radius:50%;border:2px solid #15171b;box-shadow:0 2px 8px rgba(0,0,0,.5);cursor:pointer;display:block;margin-left:auto;padding:0}
.card{margin-top:6px;width:270px;background:#15171b;color:#ddd;border:1px solid #444;border-radius:10px;padding:12px;font-size:12px;box-shadow:0 6px 24px rgba(0,0,0,.5)}
.hd{display:flex;justify-content:space-between;align-items:center;font-weight:700;color:#fff;margin-bottom:8px;font-size:13px}
.hd span:last-child{font-weight:400;font-size:12px}
.row{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-top:1px solid #2a2d33}
.row span:first-child{white-space:nowrap}
.upd{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0 0 8px;padding:6px 8px;border-radius:6px;background:#172a45;border:1px solid #2f5a8f;color:#bcd8ff}
.upd a{color:#8cc2ff;font-weight:700;margin:0;font-size:12px}
.ver{color:#5d626b;font-size:10px;margin-top:8px}
.row span:last-child{text-align:right}
.btns{display:flex;gap:8px;margin-top:10px;align-items:center}
button.b{background:#3b2f5c;color:#e5d8ff;border:1px solid #57408a;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer}
button.b:disabled{opacity:.5;cursor:default}
a{color:#8a8f99;font-size:11px;cursor:pointer;margin-left:auto;text-decoration:underline}
.err{color:#ff8a8a;margin-top:8px}
.muted{color:#8a8f99}
`;

function dotColor() {
  if (!status) return '#666';
  if (status.error) return '#f87171';
  if (!status.signedIn) return '#fb923c';
  return busy ? '#fbbf24' : '#4ade80';
}

function renderPanel() {
  const parts: string[] = [`<style>${PANEL_CSS}</style>`];
  const upd = status?.update?.available ? status.update : null;
  parts.push(`<button class="dot" id="dot" title="${upd ? 'Quest tracker · update available' : 'Quest tracker'}" style="background:${dotColor()}${upd ? ';border-color:#60a5fa;box-shadow:0 0 0 2px #60a5fa' : ''}"></button>`);
  if (panelOpen) {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    let body = '';
    if (!status) {
      body = '<div class="muted">Loading…</div>';
    } else if (!status.signedIn) {
      body = `<div class="muted">Sign in with the Google account you use for the tracker to see what your quests need.</div>
        <div class="btns"><button class="b" id="signin">Sign in with Google</button></div>`;
    } else {
      const active = activeQuests(status.questStatuses).length;
      const short = [...needs.values()].filter((n) => n.state !== 'ok').length;
      const changes = status.lastChanges.length
        ? status.lastChanges.slice(0, 3).map((c) => c.label ? esc(c.label) : `${esc(c.item)} ${c.delta > 0 ? '+' : ''}${fmt(c.delta)}`).join(', ') + (status.lastChanges.length > 3 ? ` +${status.lastChanges.length - 3} more` : '')
        : 'None';
      body = `
        <div class="row"><span>Active quests</span><span>${active}</span></div>
        <div class="row"><span>Items still short</span><span style="color:#ffa26b">${short}</span></div>
        <div class="row"><span>Last read</span><span>${status.lastRead ? `${status.lastRead.source} · ${ago(status.lastRead.at)}` : 'Not yet'}</span></div>
        <div class="row"><span>Last change sent</span><span>${changes}</span></div>
        <div class="btns"><button class="b" id="sync" ${busy ? 'disabled' : ''}>${busy ? 'Syncing…' : 'Sync now'}</button><a id="signout">Sign out</a></div>`;
    }
    const synced = status?.signedIn
      ? (busy ? 'syncing…' : status.lastSync ? `<span style="color:#7fdc8f">● synced ${ago(status.lastSync)}</span>` : '')
      : '';
    const updRow = upd
      ? `<div class="upd"><span>Update available</span><a href="${esc(upd.url)}" target="_blank" rel="noopener">Download</a></div>`
      : '';
    const ver = status?.update?.current ? `<div class="ver">Version ${esc(status.update.current)}${upd ? ` · latest ${esc(upd.latest ?? '')}` : ''}</div>` : '';
    parts.push(`<div class="card"><div class="hd"><span>Quest tracker</span><span>${synced}</span></div>${updRow}${body}${status?.error ? `<div class="err">${esc(status.error)}</div>` : ''}${ver}</div>`);
  }
  shadow.innerHTML = parts.join('');
  shadow.getElementById('dot')?.addEventListener('click', () => { panelOpen = !panelOpen; renderPanel(); });
  shadow.getElementById('signin')?.addEventListener('click', () => { busy = true; renderPanel(); send({ type: 'signIn' }).then(setStatus).finally(() => { busy = false; renderPanel(); }); });
  shadow.getElementById('signout')?.addEventListener('click', () => { send({ type: 'signOut' }).then(setStatus); });
  shadow.getElementById('sync')?.addEventListener('click', async () => {
    busy = true; renderPanel();
    try { setStatus(await send({ type: 'status', refresh: true })); } finally { busy = false; }
    lastPushed.clear();
    await scan(true);
    renderPanel();
  });
}

setInterval(() => { if (panelOpen) renderPanel(); }, 15_000);
renderPanel();
send({ type: 'status' }).then(setStatus).catch((e) => setStatus({
  signedIn: false, email: null, questStatuses: {}, inventory: {}, lastSync: null, lastRead: null, lastChanges: [], error: (e as Error).message,
  update: { current: '', latest: null, available: false, url: '' },
}));
