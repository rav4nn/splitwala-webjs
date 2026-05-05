# SplitWala

A Telegram bot for splitting expenses and tracking shared balances in group chats. No app to install, no sign-up, no accounts — just add the bot to any Telegram group and start splitting.

**Live bot:** [@splitwala_bot](https://t.me/splitwala_bot) · **Website:** [splitwala.hardeep.cv](https://splitwala.hardeep.cv)

---

## How it works

1. Add [@splitwala_bot](https://t.me/splitwala_bot) to any Telegram group
2. Type `/split 500 dinner` — the bot parses it, confirms, and records it
3. `/balances` to see who owes what, `/summary` for minimum transfers to settle up

---

## Commands

### `/split` — Record an expense

Type naturally. The bot uses an LLM to parse amount, description, payer, and participants from a single message.

| Example | What it does |
|---|---|
| `/split 600` | Splits ₹600 equally among the group |
| `/split 600 @mohit @vipul and me` | Splits among only those three |
| `/split 600 dinner` | Splits ₹600 and tags it "dinner" |
| `/split 4500 groceries paid by @vipul` | Records @vipul as the payer |

### `/paid` — Record a payment

```
/paid <amount> to @person
/paid <amount> from @person
/paid <amount> from @person to @person
```

### `/got` — Record money received

Mirror of `/paid` — use whichever reads more naturally.

### `/balances` — Check what you owe and are owed

```
/balances
/balances @mohit
```

### `/summary` — Minimum transfers to settle up

Shows the smallest number of payments needed to clear all debts in the group.

### `/history` — View recent transactions

```
/history
/history 10
/history @mohit
```

Default: 5 transactions. Max: 20.

### `/delete` — Remove a transaction

```
/delete           → lists recent transactions with numbers
/delete 2         → removes #2 and reverses its balance impact
```

### `/resetall` — Wipe all group data

```
/resetall           → shows a summary and asks for confirmation
/resetall confirm   → permanently clears all transactions and balances
```

### `/help` — Command reference in chat

---

## Tech stack

- **Node.js** + **grammY** — Telegram bot framework
- **better-sqlite3** — persistent SQLite storage (balances survive restarts)
- **DeepSeek API** — LLM-powered natural language split parsing
- **PM2** — process management for VPS deployment

---

## Self-hosting

### 1. Clone and install

```bash
git clone https://github.com/rav4nn/splitwala-webjs.git
cd splitwala-webjs
npm install
```

### 2. Configure environment

Create a `.env` file:

```
TELEGRAM_BOT_TOKEN=your_token_here
DEEPSEEK_API_KEY=your_key_here
```

Get your bot token from [@BotFather](https://t.me/BotFather). Get a DeepSeek API key at [platform.deepseek.com](https://platform.deepseek.com).

**Important:** Disable group privacy mode so the bot can read messages in groups:
`@BotFather → /mybots → your bot → Bot Settings → Group Privacy → Turn OFF`

### 3. Run

```bash
npm run start:tg
```

### 4. Deploy with PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.js --only splitwala-tg
pm2 save
pm2 startup
```

---

## Notes

- Data is stored in `data/splitwala-tg.db` — balances persist across restarts
- Each group has its own isolated balance sheet
- Use `me`, `i`, or `myself` to refer to yourself in any command
- Users without a public `@username` are resolvable via Telegram's inline mention (type `@` in the message box)
