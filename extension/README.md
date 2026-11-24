# Farm RPG Quest Tracker — Chrome extension

Adds **have / need** badges for your active quests to Farm RPG's Inventory page,
item pages and Craftworks, and keeps the tracker's inventory up to date as you
browse. It only reads the pages; it never clicks anything or sends anything to
Farm RPG.

- **Orange** `412 / 1,000`: you're short. **Green** `✓ 1,200 / 1,000`: you have enough.
  **Purple**: mostly needed to hold for STARMAPS / PAMRATS.
- Tap a badge for which quests need it. Counting matches the tracker's
  STARMAPS & PAMRATS page (held items count the larger amount, not the sum,
  plus anything crafting would use up).
- Opening the **Inventory** page replaces the tracker's inventory, like the
  bookmarklet. An **item page** or **Craftworks** updates just those items.
  The tracker app picks the change up when you switch back to it.
- The dot in the top-right corner opens a small panel: sync status, active
  quests, items still short, the last change sent, and **Sync now**.

The bookmarklet and paste import in the tracker's Settings still work for when
the extension isn't around.

## Install

1. Download the **farm-rpg-quest-tracker-extension** artifact from the latest
   green **CI** run (or build it yourself: `npm ci && npm run build:extension`,
   which writes `extension/dist`).
2. Unzip it.
3. In Chrome open `chrome://extensions`, turn on **Developer mode**, click
   **Load unpacked** and pick the unzipped folder.
4. Open farmrpg.com, click the dot in the top-right corner and **Sign in with
   Google** using the account you use for the tracker.

To update, replace the folder's contents with a newer build and click the
reload arrow on the extension's card.

## One-time Supabase setting

Google sign-in from the extension returns to the extension's own address, which
Supabase has to allow:

1. Supabase dashboard → your project → **Authentication** → **URL Configuration**.
2. Under **Redirect URLs**, add
   `https://hfjjmfnbflfdnpeajpjhlloaainanpha.chromiumapp.org/**`
3. Save.

The extension ID (`hfjjmfnbflfdnpeajpjhlloaainanpha`) is fixed by the `key` in
`manifest.json`, so this address doesn't change between builds or computers.

## How it fits together

- `src/content.ts` runs on farmrpg.com: reads counts, draws badges and the panel.
- `src/background.ts` signs in to the tracker's Supabase and reads/writes the
  same `user_data` row the app uses, changing only `inventory`.
- `src/needs.ts` works out the numbers using the app's own code in `../src`.
- `build.mjs` bundles it with rolldown into `dist/`.
