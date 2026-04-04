# Telegram LLM Daily Journaling

Obsidian plugin that appends Telegram messages to your **daily note** (same date resolution as the core **Daily Notes** / **Periodic Notes** setup via [`obsidian-daily-notes-interface`](https://github.com/liamcain/obsidian-daily-notes-interface)).

Optional: transcribe **voice** and **audio** with a **local** OpenAI-compatible ASR server (for example [mlx-qwen3-asr](https://github.com/moona3k/mlx-qwen3-asr) on Apple Silicon).

> **Development phase** — Behavior and settings may still change before a stable release. The plugin is usable day-to-day; the [GitHub Wiki](https://github.com/Ahelsamahy/obsidian-telegram-llm-daily-journaling/wiki) and [Wiki roadmap](#wiki-roadmap) below track user-facing docs as the surface area stabilizes.

## Features (overview)

- **Text** — Append to the daily note, with optional Telegram → Markdown entity conversion or plain text.
- **Reply context** — Optional `> Re: …` line when you reply to a message in Telegram.
- **Media** — Optional download into a vault folder and `![[path]]` embed; photos, videos, stickers, documents, etc. (see settings).
- **Voice / audio** — Optional local transcription, or file download when transcription is off.
- **After save** — In Telegram: no action, reaction, or delete the message.
- **Diagnostics** — In-plugin log (with optional auto-refresh) for debugging.
- **Resilience** — Duplicate Telegram `update_id` handling, file size limits aligned with the Bot API, optional Wi‑Fi–only downloads where the browser exposes network type.

Commands in Telegram: `/start`, `/help`, `/last` (last successful append time on this device).

## Requirements

- **Obsidian** on desktop (`isDesktopOnly` is enabled for this plugin).
- **Daily Notes** (core) or **Periodic Notes** (community) configured so daily note paths resolve correctly.
- A Telegram bot from [@BotFather](https://t.me/BotFather) and your user ID or `@username` in **Allowed users**.

## Setup

1. Install the plugin (build from source or copy `main.js`, `manifest.json`, `styles.css` into `.obsidian/plugins/telegram-llm-daily-journaling/` — folder name should match the plugin `id` in `manifest.json`).
2. Open settings and set **Bot token** and **Allowed users** (comma-separated). Links in settings open [@BotFather](https://telegram.me/BotFather) and [@getmyid_bot](https://t.me/getmyid_bot) for convenience.
3. Adjust **Daily note time cutoff** if messages after midnight should count toward the previous calendar day. Times use the **clock of the machine running Obsidian**, not Telegram’s UI timezone.
4. Choose what happens after a successful save: **none**, **reaction**, or **delete message** in Telegram.
5. Optionally enable **Download media**, **Transcription**, **reply context**, **timestamp headings**, and other toggles described in settings.

## Local transcription (optional)

The plugin sends audio to a **local** OpenAI-compatible ASR server; it does **not** download model weights. Use **Apple Silicon** + this repo’s [mlx-qwen3-asr](https://github.com/moona3k/mlx-qwen3-asr) scripts, or any other compatible server—then point Obsidian at it.

**Rule:** The **ASR model** string in Obsidian must match what the server loads (e.g. the same Hub id as `MLX_ASR_MODEL` in `.env`). Changing the model in settings alone does not change the running server.

### A. On your Mac (local ASR server)

Work in a **clone of this repository** (so `scripts/` and `npm run asr:*` exist).

1. **Environment file** — Copy [`.env.example`](.env.example) to `.env` in the repo root (`.env` is gitignored). Set at least:
   - `MLX_ASR_API_KEY` — shared secret for the HTTP server (you will paste the same value into Obsidian as **ASR API key**).
   - `MLX_ASR_HOST` / `MLX_ASR_PORT` — default `127.0.0.1` and `8765` if omitted.
   - `MLX_ASR_MODEL` — Hugging Face repo id the server should load (e.g. `Qwen/Qwen3-ASR-1.7B`).
   - `HF_TOKEN` (optional) — only needed for **gated** Hub models when prefetching (see below). Do not commit real tokens.

   `TELEGRAM_LLM_DAILY_JOURNALING_DEV_VAULT` in `.env` is for `npm run deploy:dev` only; it does not affect transcription.

   If a value contains **spaces** (common for vault paths), wrap it in **double quotes**, e.g. `TELEGRAM_LLM_DAILY_JOURNALING_DEV_VAULT="/path/to/My vault-Dev"`. Otherwise bash `source .env` in `asr:*` scripts will fail with `command not found` on the segment after the first space.

2. **One-time Python stack** — From the repo root:

   ```bash
   npm run asr:install
   ```

   This creates `.venv-asr/` and installs `mlx-qwen3-asr[serve]`.

3. **Prefetch weights (recommended)** — Before first run, or when you change `MLX_ASR_MODEL`:

   ```bash
   npm run asr:download-model -- "Qwen/Qwen3-ASR-1.7B"
   ```

   Use the same id as in `.env`, or rely on `MLX_ASR_MODEL` with no argument. Gated models need `HF_TOKEN` / `HUGGINGFACE_HUB_TOKEN` in `.env`.

4. **Start the server** — Leave this process running while you use Obsidian:

   ```bash
   npm run asr:serve
   ```

   You should see server logs and no immediate exit. The OpenAI-compatible base URL is usually `http://127.0.0.1:8765/v1` (host/port must match `MLX_ASR_HOST` / `MLX_ASR_PORT`).

### B. In Obsidian (same machine as the server)

1. Open the plugin **Settings** for this plugin.
2. Under **Local transcription**, turn **Enable transcription** on.
3. **ASR base URL** — Must match the server, typically `http://127.0.0.1:8765/v1` (include `/v1` if your server expects it).
4. **ASR API key** — Must match `MLX_ASR_API_KEY` from `.env` (same string as the default `local-dev-asr-key` if you did not change it).
5. **ASR model** — Set to the **same** Hub id the server uses (`MLX_ASR_MODEL`). Use the dropdown / refresh-from-Hub tools if helpful; **Other (custom id)** is for ids not in the list.
6. Optional: **Hugging Face token** in plugin settings is only for **refreshing the model list** from the Hub in the UI, not for your local ASR HTTP request.

If something fails, open **Diagnostics** in settings and check for ASR HTTP errors.

More detail: **[Local ASR setup (wiki)](https://github.com/Ahelsamahy/obsidian-telegram-llm-daily-journaling/wiki/Local-ASR-setup)**.

Audio is downloaded from Telegram (subject to the **20 MB** bot-file limit) and sent to `POST {base}/audio/transcriptions` (OpenAI-style multipart).

## Manual polling

If **Disable auto reception** is on, the bot does not long-poll automatically. Use the ribbon action **Telegram daily journal: get updates** or the command **Get updates** while Obsidian is open.

## How it works (short)

1. The plugin runs a Telegram bot in the Obsidian process (long-polling unless auto reception is disabled).
2. Allowed chats/users are checked in middleware; duplicate `update_id` values are skipped after a successful run (to tolerate Telegram retries).
3. Text and media are formatted per settings, then appended to the correct **daily note** file via the vault API (serialized with a mutex for bot writes).
4. Media downloads use Telegram’s `getFile` URL, save to a configurable folder under the vault, and insert an Obsidian embed plus optional caption.

For a **user-facing** deep dive (settings field-by-field, path rules, download pipeline), see the [Wiki roadmap](#wiki-roadmap) and [GitHub Wiki](https://github.com/Ahelsamahy/obsidian-telegram-llm-daily-journaling/wiki). The [obsidian-telegram-inbox wiki](https://github.com/icealtria/obsidian-telegram-inbox/wiki) (e.g. [Custom path](https://github.com/icealtria/obsidian-telegram-inbox/wiki/Custom-path)) is a good **reference for how we want GitHub wiki pages to read**—clear “available data,” examples, and filenames—once this plugin’s behavior is frozen enough to mirror that style.

## Documentation & wiki

| Resource | Status |
|----------|--------|
| This README | Living overview; updated as features stabilize. |
| **[GitHub Wiki](https://github.com/Ahelsamahy/obsidian-telegram-llm-daily-journaling/wiki)** | Published: [Home](https://github.com/Ahelsamahy/obsidian-telegram-llm-daily-journaling/wiki), [Local ASR setup](https://github.com/Ahelsamahy/obsidian-telegram-llm-daily-journaling/wiki/Local-ASR-setup). |

### Wiki roadmap

Use this checklist as additional pages are written:

- [x] **Home** — Index and link to README.
- [x] **Local ASR setup** — `mlx-qwen3-asr`, `npm run asr:*`, `.env`, Obsidian transcription settings.
- [ ] **Settings reference** — Every toggle and field, with defaults and interaction (e.g. plain text vs Markdown entities, escaper, Wi‑Fi-only downloads).
- [ ] **Daily note routing & time cutoff** — How the diary day is chosen (cutoff clock), contrast with [telegram-inbox Custom path](https://github.com/icealtria/obsidian-telegram-inbox/wiki/Custom-path) (this plugin **targets the daily note** from Daily Notes; no Mustache path template yet—document that explicitly, and add a “Future” subsection if custom paths are planned).
- [ ] **Downloads & media** — Step-by-step: `getFile` → size limit (20 MB) → `vault.createBinary` under **Media folder** → `![[relative/path]]` in the note; albums, captions, and failure modes (network, cellular + Wi‑Fi-only).
- [ ] **Commands & diagnostics** — `/help`, `/last`, diagnostics log, idempotency behavior.
- [ ] **Troubleshooting** — Token, allow list, Obsidian only on desktop, sync conflicts (rare).

Until those pages exist, rely on **Settings** descriptions in Obsidian, the **Diagnostics** panel, and the wiki pages above where relevant.

## Security

- The bot token and optional ASR key are stored only in your vault’s plugin data.
- Keep repo-root `.env` (MLX ASR keys, HF tokens) **local and gitignored**; do not commit or paste tokens into issues or screenshots.
- Do not share your vault or screen recordings of plugin settings.

## Development

```bash
npm install
npm run build
npm test
npm run lint
```

Watch mode:

```bash
npm run dev
```

CI runs `build`, `lint`, and `npm test` on push/PR (see `.github/workflows/`). Tests set `HF_API_INTEGRATION=0` so the live Hugging Face Hub check is skipped in CI; run `npm test` locally without that env to exercise it.

**GitHub wiki:** after editing pages under `.wiki/` (or on first run letting the script clone it), run `npm run wiki:deploy -- "commit message"`, or `WIKI_COMMIT_MSG=... npm run wiki:deploy`, or `npm run wiki:deploy` with a TTY to be prompted. Override clone URL with `WIKI_REPO_URL` if needed.

## License

0BSD (see [LICENSE](LICENSE)).
