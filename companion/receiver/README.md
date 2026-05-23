# Companion receiver

Environment variables:

```bash
export TELEGRAM_BOT_TOKEN="123456:telegram-bot-token"
export RECEIVER_API_TOKEN="replace-with-random-secret"
export RECEIVER_ALLOWED_USERS="710921552"
export RECEIVER_HOST="0.0.0.0"
export RECEIVER_PORT="8787"
export RECEIVER_DATA_DIR="./companion-data"
```

Start the service:

```bash
npm run receiver:start
```

Telegram webhook URL:

```text
https://your-vps.example.com/telegram/webhook/<TELEGRAM_BOT_TOKEN>
```

The Obsidian plugin remote mode should use:

- `Receiver base URL`: `https://your-vps.example.com`
- `Receiver API token`: the value of `RECEIVER_API_TOKEN`
