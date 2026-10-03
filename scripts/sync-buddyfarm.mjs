#!/usr/bin/env node
// Sync quest and item-source data from buddy.farm.
//
//   npm run sync:buddyfarm             # quests + items
//   npm run sync:buddyfarm -- quests   # only quests
//   npm run sync:buddyfarm -- items    # only refresh item locations/sources
//   npm run sync:buddyfarm -- --dry-run
//
// Quests: diffs buddy.farm's quest listing against src/data/quests.json by id and
// appends any missing quests. Existing quests keep their data — some of our
// questline groupings are deliberately different from buddy.farm's — except for
// two fields refreshed on every quest: `towerLv` (required Tower level) and
// `prereqId` (id of the quest that unlocks it). Both are omitted when unset.
//
// Items: for every item a quest or recipe needs, fetches its buddy.farm page and
//   - merges drop locations (explore / fishing / mining) into item-locations.json,
//     adding a `rate` (average attempts per drop) to each location, and
//   - regenerates item-sources.json with every other way to get the item
//     (shop, crafting, NPC rewards, Wishing Well, Temple, passwords, ...), and
//   - regenerates wishing-well.json (item → what to throw in, with % chance).
//
// Behind a proxy (e.g. a cloud sandbox) run with NODE_USE_ENV_PROXY=1.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');
const BASE = 'https://buddy.farm/page-data';
const CONCURRENCY = 6;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const modes = args.filter(a => !a.startsWith('--'));
const runQuests = modes.length === 0 || modes.includes('quests');
const runItems = modes.length === 0 || modes.includes('items');

const readJson = file => JSON.parse(readFileSync(join(DATA, file), 'utf8'));

// Only files whose content actually changes are written, so an unchanged run
// leaves the repo clean (the scheduled GitHub Action relies on that).
const changedFiles = [];
function writeJson(file, data) {
  const path = join(DATA, file);
  const content = JSON.stringify(data, null, 2) + '\n';
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return;
  changedFiles.push(file);
  if (dryRun) return console.log(`  (dry run) would update ${file}`);
  writeFileSync(path, content);
  console.log(`  updated ${file}`);
}

// buddy.farm page slugs: lowercase, every run of non-alphanumerics becomes "-"
// (trailing dashes are kept, e.g. "What is Halloween?" → "what-is-halloween-").
const slugify = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

async function fetchPage(path) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${BASE}/${path}/page-data.json`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).result;
    } catch (err) {
      if (attempt >= 4) throw new Error(`${path}: ${err.message}`);
      await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

async function mapPool(list, fn) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i]);
    }
  }));
  return out;
}

const parseItems = str =>
  str === 'None' ? [] : str.split('; ').map(s => s.match(/^(\d+)x (.+)$/)).filter(Boolean).map(m => m[2]);

// ── Quests ──────────────────────────────────────────────────────────────────

// Quest dates are game-server (US Central) calendar days, e.g. an event ending
// 2026-10-01T04:59:59Z is stored as 09/30/2026.
const centralDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
});
const toDate = iso => (iso ? centralDate.format(new Date(iso)) : '');
const itemList = list => list.map(i => `${i.quantity}x ${i.item.name}`).join('; ') || 'None';

// Rebuild a quest with towerLv / prereqId placed before description (and
// dropped when unset), so the JSON stays in a stable key order.
function withChainFields(quest, towerLv, prereqId) {
  const { towerLv: _t, prereqId: _p, description, ...rest } = quest;
  return {
    ...rest,
    ...(towerLv > 0 ? { towerLv } : {}),
    ...(prereqId ? { prereqId } : {}),
    description,
  };
}

async function syncQuests() {
  console.log('Quests: fetching buddy.farm listing…');
  const listing = (await fetchPage('quests')).data.farmrpg.quests.filter(q => !q.isHidden);
  const quests = readJson('quests.json');
  // Match on name too: some quests were added by hand before buddy.farm had
  // them, under different ids.
  const byId = new Map(quests.map(q => [q.id, q]));
  const byName = new Map(quests.map(q => [q.name.toLowerCase(), q]));
  const localFor = summary => byId.get(String(summary.id)) ?? byName.get(summary.name.toLowerCase());
  const missing = listing.filter(q => !localFor(q));
  console.log(`  buddy.farm ${listing.length}, local ${quests.length}, missing ${missing.length}`);

  console.log(`  fetching ${listing.length} quest pages for tower levels / prerequisites…`);
  const pages = await mapPool(listing, async summary => {
    const page = await fetchPage(`q/${slugify(summary.name)}`);
    return page?.data.farmrpg.quests[0] ?? null;
  });

  const newQuests = [];
  listing.forEach((summary, i) => {
    const q = pages[i];
    if (localFor(summary)) return;
    if (!q) return console.warn(`  ! no page for "${summary.name}" (${summary.id}), skipped`);
    newQuests.push({
      id: String(summary.id),
      name: q.name,
      npc: q.npc,
      requiredNpcLevel: q.requiredNpcLevel ?? 0,
      itemsRequired: itemList(q.requiredItems),
      rewardItems: itemList(q.rewardItems),
      questline: summary.questlines[0]?.questline.title ?? '',
      startDate: toDate(q.startDate),
      endDate: toDate(q.endDate),
      farmingLv: q.requiredFarmingLevel,
      fishingLv: q.requiredFishingLevel,
      craftingLv: q.requiredCraftingLevel,
      exploringLv: q.requiredExploringLevel,
      miningLv: 0, // buddy.farm has no mining-level requirement field
      description: q.cleanDescription ?? '',
    });
  });
  newQuests.sort((a, b) => Number(a.id) - Number(b.id));
  for (const q of newQuests) {
    console.log(`  + ${q.id} ${q.name}`);
    byId.set(q.id, q);
    byName.set(q.name.toLowerCase(), q);
  }

  // buddy.farm id → local id (they differ for hand-added quests)
  const localId = new Map();
  for (const summary of listing) {
    const local = localFor(summary);
    if (local) localId.set(summary.id, local.id);
  }
  const chain = new Map();
  listing.forEach((summary, i) => {
    const q = pages[i];
    const local = localFor(summary);
    if (!q || !local) return;
    chain.set(local.id, { towerLv: q.requiredTowerLevel ?? 0, prereqId: q.pred ? localId.get(q.pred.id) : undefined });
  });

  let changed = 0;
  const updated = [...quests, ...newQuests].map(q => {
    const c = chain.get(q.id);
    if (!c) return q;
    const next = withChainFields(q, c.towerLv, c.prereqId);
    if (JSON.stringify(next) !== JSON.stringify(q)) changed++;
    return next;
  });
  console.log(`  ${newQuests.length} added, ${changed} updated (tower level / prerequisite)`);
  if (process.env.GITHUB_OUTPUT && newQuests.length) {
    // Used by the scheduled workflow for the PR title
    writeFileSync(process.env.GITHUB_OUTPUT, `new_quests=${newQuests.length}\n`, { flag: 'a' });
  }
  if (newQuests.length || changed) writeJson('quests.json', updated);
}

// ── Items ───────────────────────────────────────────────────────────────────

const LOCATION_TYPES = new Set(['explore', 'fishing', 'mining']);
const VARIANT_FLAGS = ['ironDepot', 'manualFishing', 'runecube', 'frozen'];
const round1 = n => Math.round(n * 10) / 10;
const monthYear = iso => new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

// Drop locations with the base rate (no Iron Depot / Runecube / frozen / manual
// fishing modifiers). A location only listed with modifiers falls back to its
// best modified rate.
function dropLocations(item) {
  const byLoc = new Map();
  for (const { rate, dropRates } of item.dropRatesItems) {
    const loc = dropRates.location;
    if (!loc || !LOCATION_TYPES.has(loc.type) || !(rate > 0)) continue;
    const isBase = VARIANT_FLAGS.every(f => !dropRates[f]);
    const cur = byLoc.get(loc.name) ?? { type: loc.type, base: Infinity, any: Infinity };
    if (isBase) cur.base = Math.min(cur.base, rate);
    cur.any = Math.min(cur.any, rate);
    byLoc.set(loc.name, cur);
  }
  return [...byLoc.entries()]
    .map(([name, { type, base, any }]) => ({ name, type, rate: round1(Number.isFinite(base) ? base : any) }))
    .sort((a, b) => a.rate - b.rate);
}

function otherSources(item, recipeNames, now) {
  const out = [];
  const add = (type, label) => out.push({ type, label });

  if (item.canBuy && item.buyPrice > 0) add('shop', `Buy for ${item.buyPrice.toLocaleString()} silver`);
  if (item.canFleaMarket && item.fleaMarketPrice > 0) add('shop', `Flea Market: ${item.fleaMarketPrice.toLocaleString()} gold`);
  if (item.canCraft && !recipeNames.has(item.name) && item.recipeItems.length > 0) {
    const ingredients = item.recipeItems.map(r => `${r.quantity}× ${r.item.name}`).join(', ');
    add('craft', `Craft${item.craftingLevel ? ` (Lv ${item.craftingLevel})` : ''}: ${ingredients}`);
  }
  if (item.canCook) add('craft', `Cook${item.cookingLevel ? ` (Lv ${item.cookingLevel})` : ''}`);
  for (const { dropRates } of item.dropRatesItems) {
    const seed = dropRates.seed?.name;
    if (seed && !out.some(s => s.label.includes(seed))) {
      const hours = item.baseYieldMinutes ? ` (${round1(item.baseYieldMinutes / 60)}h)` : '';
      add('farming', `Grow from ${seed}${hours}`);
    }
  }
  for (const p of item.manualProductions ?? []) add('production', `${p.lineOne}${p.value ? ` (${p.value.toLowerCase()})` : ''}`);
  for (const r of item.npcRewards) add('npc', `${r.npc.name} friendship Lv ${r.level} (×${r.quantity})`);
  for (const w of item.wishingWellOutputItems) add('wishing-well', `Wishing Well: throw ${w.inputItem.name} (${round1(w.chance * 100)}%)`);
  for (const t of item.templeRewardItems) {
    add('temple', `Temple: offer ${t.templeReward.inputQuantity.toLocaleString()} ${t.templeReward.inputItem.name} (×${t.quantity})`);
  }
  const exchanges = [...item.exchangeCenterOutputs]
    .sort((a, b) => (b.lastSeen ?? '').localeCompare(a.lastSeen ?? ''))
    .slice(0, 3);
  for (const e of exchanges) {
    add('exchange', `Exchange Center: ${e.inputQuantity.toLocaleString()} ${e.inputItem.name} → ${e.outputQuantity}${e.lastSeen ? ` (last seen ${monthYear(e.lastSeen)})` : ''}`);
  }
  for (const r of item.skillLevelRewards) add('skill', `${r.skill[0].toUpperCase()}${r.skill.slice(1)} Lv ${r.level} reward (×${r.itemQuantity})`);
  for (const q of item.quizRewards) add('quiz', `${q.quiz.name} quiz (score ${q.score}, ×${q.quantity})`);
  for (const p of item.passwordItems) add('password', `Password "${p.password.password}" (×${p.quantity})`);
  if (item.cardsTrades.length > 0) add('cards', 'Card trade');
  const quests = item.rewardForQuests
    .filter(r => !r.quest.isHidden && (!r.quest.endDate || new Date(r.quest.endDate) > now))
    .slice(0, 3);
  for (const r of quests) add('quest', `Quest reward: ${r.quest.name} (×${r.quantity})`);
  return out;
}

async function syncItems() {
  const quests = readJson('quests.json');
  const recipes = readJson('recipes.json');
  const names = new Set();
  for (const q of quests) for (const n of parseItems(q.itemsRequired)) names.add(n);
  for (const r of recipes) for (const i of r.ingredients) names.add(i.item);
  const recipeNames = new Set(recipes.map(r => r.name));

  const list = [...names].sort();
  console.log(`Items: fetching ${list.length} buddy.farm item pages…`);
  const pages = await mapPool(list, async name => {
    const page = await fetchPage(`i/${slugify(name)}`);
    return page?.data.farmrpg.items[0] ?? null;
  });
  const notFound = list.filter((_, i) => !pages[i]);
  if (notFound.length) console.log(`  not on buddy.farm (skipped): ${notFound.join(', ')}`);

  const locations = readJson('item-locations.json');
  const sources = {};
  const wishingWell = {};
  const now = new Date();
  let added = 0;
  list.forEach((name, i) => {
    const item = pages[i];
    if (!item) return;

    // Keep hand-curated entries; add buddy.farm locations and attach rates.
    const drops = dropLocations(item);
    if (drops.length) {
      const merged = (locations[name] ?? []).map(l => ({ ...l }));
      for (const d of drops) {
        const existing = merged.find(l => l.name === d.name);
        if (existing) existing.rate = d.rate;
        else { merged.push(d); added++; }
      }
      locations[name] = merged;
    }

    const other = otherSources(item, recipeNames, now);
    if (other.length) sources[name] = other;

    // buddy.farm's chance is a fraction (0.25 = 25%)
    if (item.wishingWellOutputItems.length) {
      wishingWell[name] = item.wishingWellOutputItems
        .map(w => ({ item: w.inputItem.name, chance: round1(w.chance * 100) }))
        .sort((a, b) => b.chance - a.chance || a.item.localeCompare(b.item));
    }
  });

  const sortKeys = obj => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
  console.log(`  ${added} new drop locations, ${Object.keys(sources).length} items with other sources`);
  writeJson('item-locations.json', locations); // new items append, existing order kept
  writeJson('item-sources.json', sortKeys(sources));
  writeJson('wishing-well.json', sortKeys(wishingWell));
}

if (runQuests) await syncQuests();
if (runItems) await syncItems();

if (!changedFiles.length) console.log('No changes — game data is up to date.');
