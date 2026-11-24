// Reads farmrpg.com/mastery.php's text (Ctrl+A copy, or the page's innerText).
// An item is any line directly followed by its "N / M Progress" line — no
// whitelist, so items added to the game after masteries.json was last updated
// still sync. Page chrome (tier headers, stats text) is never followed by a
// progress line, so it's dropped.

export function parseMasteryText(text: string): { levels: Record<string, number>; progress: Record<string, number> } {
  const levels: Record<string, number> = {};
  const progress: Record<string, number> = {};
  let pending: string | null = null;

  const SKIP = new Set(['Track', 'Stop', 'Complete!', 'chevron_down', 'chevron_right',
    'Mastery In-Progress', 'Stop Tracking All', 'Ready to Claim', 'Nothing ready yet']);
  // Browser clipboard adds "* " bullet prefix to list items — strip it before parsing
  const lines = text.split('\n').map((l) => l.trim().replace(/^\*\s+/, '')).filter(Boolean);
  for (const l of lines) {
    if (SKIP.has(l) || l.includes('%') || l.startsWith('[')) continue;
    const pm = l.match(/^([\d,]+)\s*\/.*Progress/);
    if (pm && pending !== null) {
      const count = parseInt(pm[1].replace(/,/g, ''), 10);
      const lv = count >= 1_000_000 ? 3 : count >= 100_000 ? 2 : count >= 10_000 ? 1 : 0;
      if (lv >= 1) levels[pending] = lv;
      if (lv <= 2) progress[pending] = count; // toward 10k, 100k or 1M
      pending = null;
      continue;
    }
    pending = l;
  }
  return { levels, progress };
}
