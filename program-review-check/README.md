# Program Review Check — GitHub version

A single web page that analyzes a draft Brookdale five-year program review and produces a summary, SWOT analysis, gaps to fix, suggested wording fixes, a comparison with an earlier draft, a team email, and a Word report. It uses Claude Opus 5.5 through the Anthropic API.

Files in this folder:

- `index.html`: the whole tool. This is the only file that goes on GitHub.
- `worker.js`: optional Cloudflare Worker that hides your API key behind passcodes (recommended).
- `README.md`: this guide.

## Choose how people get access

**Option A: Passcode (recommended).** Your API key stays on a free Cloudflare Worker, and each person or team gets a passcode. Nobody ever sees the key, and you can shut off one team by deleting its passcode. Setup takes about 15 minutes.

**Option B: Shared API key.** Each person pastes the key you give them into the page. Setup takes two minutes, but anyone who has the key can use it for anything, billed to you, until you replace it.

Either way, set a monthly spend limit on your Anthropic account (step 1).

## 1. Create a dedicated API key

1. Sign in to the Claude Console (platform.claude.com), where Anthropic API keys and billing are managed.
2. Add billing credit if you haven't already.
3. Create a new API key named something like `program-review-check`. Use it only for this tool, so you can replace it without affecting anything else.
4. Set a monthly spend limit in the Console's limits or billing settings. A full analysis of a typical review costs roughly 50 cents to a dollar at Opus 5.5 rates ($4 per million input tokens, $20 per million output tokens), so a limit of $25 to $50 a month leaves plenty of room for a handful of teams.

## 2. Put the page on GitHub Pages

1. In your `AI_Examples` repository, create a folder named `program-review-check`.
2. Upload `index.html` into that folder and commit.
3. The tool will be live at `https://mqaissaunee-bcc.github.io/AI_Examples/program-review-check/` within a minute or two.

If you chose **Option B**, you're done: send people the link and the key. They paste the key into the Access box; "Remember on this computer" saves it in their browser.

## 3. Set up the passcode Worker (Option A)

1. Create a free Cloudflare account at cloudflare.com if you don't have one.
2. In the Cloudflare dashboard, open **Workers & Pages**, choose **Create**, and create a Worker from the "Hello World" starter. Name it something like `program-review-check`.
3. Select **Edit code**, replace everything with the contents of `worker.js`, and select **Deploy**.
4. Open the Worker's **Settings > Variables and Secrets** and add:
   - `ANTHROPIC_API_KEY`: type **Secret**, value is your key from step 1.
   - `PASSCODES`: type **Secret**, a comma-separated list, e.g. `physics-7Qx2,elec-4Lm9,hlth-2Rt8`. One per team makes revoking easy.
   - `ALLOWED_ORIGINS`: type **Text**, value `https://mqaissaunee-bcc.github.io` (the site address only, no folder path).
5. Copy the Worker's address, which looks like `https://program-review-check.YOUR-SUBDOMAIN.workers.dev`.
6. In `index.html`, find this line near the top of the script:
   ```js
   const PROXY_URL = "";
   ```
   and put the Worker address between the quotes. Commit the change.

The page now asks for a passcode instead of an API key. Send each team the link and its passcode.

**To revoke a team:** delete its passcode from `PASSCODES` and save.
**To replace the key:** create a new key in the Console, update `ANTHROPIC_API_KEY`, then delete the old key.

The Worker only forwards the tool's own requests: it fixes the model to Opus 5.5 and caps the output length, so a passcode can't be used for anything else. The site check (`ALLOWED_ORIGINS`) keeps other websites from calling it; the passcode is the real lock.

## Using the tool

1. Open the page and enter the key or passcode.
2. Add the current draft (.docx). Optionally add an earlier draft to see what changed.
3. Select **Analyze draft**. A full run takes two to four minutes.
4. Review the tabs, copy the team email, and select **Download Word report**.

Automated checks (template sections, leftover "TO DO" and "Insert..." text, empty appendices, blank table rows, same-year ranges, percentages that don't compute) run in the browser for free. The rest uses the API.

## Changing the model

To trade some quality for lower cost, change `const MODEL = "claude-opus-5-5";` in `index.html` to `"claude-sonnet-5"` (about half the price). With the Worker, set the `MODEL` variable instead.
