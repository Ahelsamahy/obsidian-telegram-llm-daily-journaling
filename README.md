# Telegram LLM Daily Journaling

Obsidian plugin that appends Telegram messages to your **daily note** (using the same resolution rules as the core **Daily Notes** / **Periodic Notes** setup via [`obsidian-daily-notes-interface`](https://github.com/liamcain/obsidian-daily-notes-interface)).

Optional: transcribe **voice** and **audio** messages with a **local** OpenAI-compatible ASR server (for example [mlx-qwen3-asr](https://github.com/moona3k/mlx-qwen3-asr) on Apple Silicon).

## Requirements

- **Obsidian** on desktop (`isDesktopOnly` is enabled for this plugin).
- **Daily Notes** (core) or **Periodic Notes** (community) configured so daily note paths resolve correctly.
- A Telegram bot from [@BotFather](https://t.me/BotFather) and your user ID or `@username` in **Allowed users**.

## Setup

1. Install the plugin (build from source or copy `main.js`, `manifest.json`, `styles.css` into `.obsidian/plugins/telegram-llm-daily-journaling/`).
2. Open settings and set **Bot token** and **Allowed users** (comma-separated).
3. Adjust **Daily note time cutoff** if messages after midnight should roll to the previous note’s day.
4. Choose what happens after a successful save: **none**, **reaction**, or **delete message** in Telegram.

## Local transcription (optional)

1. Run a compatible ASR HTTP server (e.g. `mlx-qwen3-asr serve` with an API key if you configured one).
2. Enable **Transcription** in plugin settings.
3. Set **ASR base URL** (typically ends with `/v1`, e.g. `http://127.0.0.1:8765/v1`), optional **API key**, and **model id** matching the server.

Voice messages are downloaded from Telegram and sent to `POST {base}/audio/transcriptions` (OpenAI-style multipart).

## Manual polling

If **Disable auto reception** is on, the bot does not long-poll automatically. Use the ribbon action **Telegram daily journal: get updates** or the command **Get updates** while Obsidian is open.

## Security

- The bot token and optional ASR key are stored only in your vault’s plugin data.
- Do not share your vault or screen recordings of plugin settings.

## Development

```bash
npm install
npm run build
```

For development with watch mode:

```bash
npm run dev
```

## License

0BSD (see [LICENSE](LICENSE)).
