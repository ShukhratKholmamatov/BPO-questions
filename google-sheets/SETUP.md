# Collect survey responses in a Google Sheet

This connects `index.html` to a Google Sheet you own. Responses land as rows,
one per submission. Everything stays in **your** Google account — no third-party
service, and the survey stays anonymous.

Total time: ~5 minutes.

---

## Step 1 — Create the Sheet
1. In your browser go to **https://sheets.new** (creates a blank Google Sheet).
2. Give it a name, e.g. *BPO Survey Responses*.

## Step 2 — Add the collector script
1. In the Sheet menu: **Extensions → Apps Script**.
2. Delete the sample `function myFunction() {}`.
3. Open [`Code.gs`](./Code.gs) from this folder, copy **all** of it, paste it in.
4. Click the **Save** icon (💾).

## Step 3 — Deploy as a Web App
1. Top-right: **Deploy → New deployment**.
2. Click the **gear ⚙️** next to "Select type" → choose **Web app**.
3. Set:
   - **Description:** `BPO survey`
   - **Execute as:** **Me** (your account)
   - **Who has access:** **Anyone**  ← required so the form can post to it
4. Click **Deploy**.
5. Click **Authorize access**, pick your Google account, and allow the permissions.
   > If you see "Google hasn't verified this app", click **Advanced → Go to
   > (project name)** → **Allow**. This is normal for your own script.
6. Copy the **Web app URL** — it ends with **`/exec`**.

   *(Optional check: paste that URL into a browser. You should see
   `{"ok":true,"message":"BPO survey collector is live..."}`.)*

## Step 4 — Point the form at your Sheet
1. Open `index.html` in an editor.
2. Near the top of the `<script>` find:
   ```js
   var CONFIG = { submitEndpoint: null };
   ```
3. Replace `null` with your URL in quotes:
   ```js
   var CONFIG = { submitEndpoint: "https://script.google.com/macros/s/AKfy..../exec" };
   ```
4. Save.

## Step 5 — Test
1. Open `index.html`, pick a role, answer a few questions, click **Submit**.
2. The page shows "Response sent — thank you".
3. Check the Sheet — a **Responses** tab now holds the row.

Done. Share `index.html` (host it anywhere, or send the file) and every
submission appends a row.

---

## Live Dashboard

A **Dashboard** tab is rebuilt automatically after every submission. It shows:

- Total responses
- Responses by role (with %)
- How many faced fraud/theft/non-payment
- Incident types — times reported **and** how many companies were affected
- Reported financial loss by band + an estimated total (band midpoints)
- **Reported improper pressure** — the share who said they were asked/pressured
  to do something improper (the indirect integrity signal)
- Support for regulation, most-wanted regulation elements, response language

To build it from rows you already have (or any time): **BPO Survey → Refresh
dashboard** in the sheet menu, or run `refreshDashboard` once from the Apps
Script editor.

> If you **update `Code.gs`** (e.g. to add the dashboard), you must re-publish:
> **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**.
> The `/exec` URL does not change, so `index.html` needs no edit.

---

## Good to know
- **Columns build themselves.** The first submission creates the header row.
  Because different roles answer different questions, new columns are added
  automatically the first time a question is answered — old rows just stay blank
  in those columns.
- **How answers look in the sheet**
  - Single choice / numbers / text → the value itself.
  - Multi-select → values joined with `; ` (e.g. `dispatch; billing`).
  - Grid questions → one column each, e.g. `inc_counts.cargo_theft`,
    `mkt_common.double_broker`.
  - Values are the stable English keys (e.g. `very_common`), not the translated
    label, so the data is consistent no matter which language was used.
- **Anonymous.** Only what the respondent enters is stored. No IP, no email, no
  Google identity is captured. (The one optional contact field warns the user it
  ends anonymity if filled.)
- **If the Sheet is ever unreachable**, the form automatically falls back to
  downloading the response as a JSON file, so nothing is lost.
- **Editing the script later?** Re-publish: **Deploy → Manage deployments →
  pencil ✏️ → Version: New version → Deploy** (the `/exec` URL stays the same).
- **Analyzing later:** File → Download → CSV, or use the Sheet directly with
  pivot tables / charts.
