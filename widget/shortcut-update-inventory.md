# Apple Shortcut — Update Farm RPG Inventory

This shortcut lets you update a single item's quantity in your tracker
directly from anywhere on iOS — no need to open the app or a browser.

## What it does

1. Asks: "Which item?" (text prompt)
2. Asks: "How many?" (number prompt)
3. POSTs to your tracker's `/api/sync-inventory` endpoint
4. Shows a confirmation notification

## Setup

1. Open the **Shortcuts** app on iPhone
2. Tap **+** to create a new shortcut
3. Add these actions in order:

---

### Action 1 — Ask for Text
- **Action:** Ask for Input
- **Prompt:** `Which item?`
- **Input type:** Text
- **Save result to variable:** `ItemName`

---

### Action 2 — Ask for Number
- **Action:** Ask for Input
- **Prompt:** `How many?`
- **Input type:** Number
- **Save result to variable:** `Quantity`

---

### Action 3 — Build JSON
- **Action:** Text
- **Content:**
  ```
  {"inventory":{"ITEM_NAME":QUANTITY}}
  ```
  Replace `ITEM_NAME` with the `ItemName` variable, `QUANTITY` with the `Quantity` variable.
- **Save result to variable:** `RequestBody`

---

### Action 4 — POST to tracker
- **Action:** Get Contents of URL
- **URL:** `https://YOUR-APP.fly.dev/api/sync-inventory`
- **Method:** POST
- **Request Body:** JSON
  - Key: `inventory`
  - Value: Dictionary containing one entry: key = `ItemName` variable, value = `Quantity` variable (as number)

> **Tip:** Use the Dictionary action type for the request body rather than raw JSON —
> it handles the variable substitution cleanly.

---

### Action 5 — Notify
- **Action:** Show Notification
- **Title:** `Farm RPG`
- **Body:** `Updated: ItemName × Quantity`

---

## Adding to Home Screen

1. In the Shortcuts editor, tap the **⋯** menu (top right)
2. **Add to Home Screen**
3. Give it a name like "Farm Update" and pick an icon

One tap from your home screen → 2 prompts → done.

## Notes

- The endpoint **merges** the new quantity with existing inventory (doesn't wipe other items)
- Item names are case-sensitive — use the same spelling as in the tracker
- The Scriptable widget refreshes on its own schedule (iOS controls this, typically every 15–60 min)
  or you can tap the widget to open the full tracker and force a sync
