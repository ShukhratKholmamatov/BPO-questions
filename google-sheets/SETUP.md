# Collect survey responses in a Google Sheet

Connects `index.html` to a Google Sheet you own. Everything stays in **your**
Google account — no third-party service, and the survey stays anonymous.

> **Already configured.** `index.html` already points at a deployed Web App.
> You only need the steps below if you are setting up a **new** sheet, or after
> you **edit `Code.gs`** (see [Re-publishing](#re-publishing-after-editing-codegs)).

---

## First-time setup (~5 minutes)

### 1. Create the Sheet
Go to **https://sheets.new** and name it, e.g. *BPO Pulse — Responses*.

### 2. Add the collector script
1. **Extensions → Apps Script**
2. Delete the sample `function myFunction() {}`
3. Paste **all** of [`Code.gs`](./Code.gs) and **Save** (💾)

### 3. Deploy as a Web App
1. **Deploy → New deployment**
2. Gear ⚙️ next to "Select type" → **Web app**
3. Set:
   - **Execute as:** **Me**
   - **Who has access:** **Anyone** ← required, or the form cannot post
4. **Deploy** → **Authorize access** → allow the permissions
   > "Google hasn't verified this app" is normal for your own script:
   > **Advanced → Go to (project) → Allow**
5. Copy the **Web app URL** (ends in **`/exec`**)

*Sanity check: open that URL in a browser. You should see*
`{"ok":true,"message":"BPO Pulse survey collector is live..."}`

### 4. Point the form at it
In `index.html`, near the top of the `<script>`:

```js
var CONFIG = {
  submitEndpoint: "https://script.google.com/macros/s/AKfy..../exec"
};
```

> ⚠️ Watch for a typo here — a stray character (e.g. `hhttps://`) makes the URL
> invalid, and the form silently falls back to downloading a JSON file instead of
> posting. If respondents see *"Не удалось связаться с сервером"* instead of
> *"Ответ отправлен"*, this is why.

### 5. Test
Fill the form and submit. You should see **"Ответ отправлен — спасибо"**, and a
row should appear in the **Responses** tab.

---

## The three tabs

| Tab | What it holds |
|---|---|
| **Responses** | One row per completed survey. Columns are created automatically. |
| **Contacts** | Interview volunteers (K2 = yes) who chose to leave a contact. |
| **Dashboard** | Rebuilt automatically after every submission. |

### Anonymity — how it is preserved
The **Contacts** record is posted **separately**, and deliberately carries **no
`responseId`**. It is stored as `received_at | nick | contact | language` only.
There is therefore **no way to join a contact back to a set of answers** — the
response base stays anonymous even for people who volunteer for an interview.

No IP, no e-mail, and no Google identity is ever captured.

### How answers look in the Responses tab
- Single choice / scales / text → the value itself
- Multi-select → joined with `; ` (e.g. `2fa; dmarc; training`)
- Grid questions → one column per row, e.g. `G1.cdl`, `G1.safer`, `G1.corca`,
  `G1.motus`
- Values are the stable **English keys** (e.g. `yes_loss`, `crit_neg`), never the
  translated label — so RU / UZ / EN answers aggregate together cleanly

---

## Live Dashboard

Rebuilt after every submission, following the analysis matrix of the
specification (§5). **Key indices** are highlighted at the top:

| Index | What it means |
|---|---|
| Fraud exposure | % who suffered real damage (F1), and % who met fraud in any form |
| Cyber-maturity index (0–10) | H1 measures (0–7) + call-back verification (H2 = always, +2) + training (A7, +1) |
| Diversification funnel | % already moved or preparing (I1) — flags the spec's **>25 % threshold** to launch the Mexico/Canada hub programme |
| US-market trust barometer | D7 positive (already + yes + yes-with-guarantees) minus negative |
| Forecast barometer 2027 | J3 net optimists (growth − contraction/disappearance) |
| Broker-classification risk | share of BPO owners on a risky contract model (B5) — SAFER Act exposure |
| Reported NOWHERE | share of fraud victims who never reported it (F4) |

Then full distributions for: profile (P1–P5), fraud (F1–F5), legislation (G1–G5),
cyber (H1–H4, A7), diversification (I1–I3, ID1–ID2), BPO owners (B5–B7), drivers
(C2–C7), US market (D3–D7), experts (E2–E5), support (J1–J3), all open answers
(K1), and interview volunteers (K2 + contacts actually collected).

Declined-consent responses (S0 = No) are counted separately and excluded from totals.

Rebuild it any time: **BPO Survey → Refresh dashboard** in the sheet menu, or run
`refreshDashboard` from the Apps Script editor.

---

## Re-publishing after editing `Code.gs`

The Web App is pinned to a **version**, so edits do nothing until you re-publish:

**Deploy → Manage deployments → ✏️ (pencil on the EXISTING deployment) →
Version: New version → Deploy**

> Do **not** use "New deployment" — that mints a **different `/exec` URL**, and
> the form will keep posting to the old one.
> Re-publishing correctly keeps the same URL, so `index.html` needs no edit.

To confirm which version is live, open the `/exec` URL — the message text tells
you which build answered.

---

## Good to know

- **Submissions are instant.** The form uses `navigator.sendBeacon`, so it does
  not wait on an Apps Script cold start (1–3 s). The browser delivers the request
  in the background.
- **Duplicate clicks are safe.** The submit button locks on first click and the
  payload (including its `responseId`) is built once, so hammering the button
  cannot create duplicate rows.
- **If the Sheet is unreachable**, the form falls back to downloading the
  response as a JSON file, so nothing is lost.
- **Columns build themselves.** Different roles answer different questions; new
  columns appear the first time a question is answered. Older rows just stay
  blank in those columns.
- **Analysing later:** File → Download → CSV, or use the Sheet directly with
  pivot tables and charts.
