# SplitWala

A WhatsApp bot for splitting expenses and tracking shared balances, built with Node.js and [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js).

Add +918799743633 to your WhatsApp group and msg /help

No Meta developer account, no API keys, no webhooks — just scan a QR code once and the bot is live.

## Tech Stack

- **Node.js** (v18+)
- **whatsapp-web.js** — runs a real WhatsApp Web session
- **better-sqlite3** — persistent SQLite storage (balances survive restarts)
- **PM2** — recommended for VPS deployment

## Commands

### `/split` — Record an expense

```
/split <amount> [by <person> <amount>] [<person> owes <amount>] [for <description>]
```

| Example | What it does |
|---------|-------------|
| `/split 600` | Splits ₹600 equally among everyone in the group |
| `/split 600 @Mohit @Vipul and me` | Splits ₹600 equally among only those three people |
| `/split 600 for dinner` | Same as above but tags the expense "dinner" |
| `/split 4000 by me 3000 by @Vipul 1000, @Vipul owes 2500, @Mohit owes 1500 for groceries` | Custom contributions and custom debts |

### `/paid` — Record a payment

```
/paid <amount> [to/from @person]
```

| Example | What it does |
|---------|-------------|
| `/paid 200 to @Mohit` | You paid Mohit ₹200 |
| `/paid 200 from @Mohit` | Mohit paid you ₹200 |
| `/paid 500 from @Vipul to @Mohit` | Vipul paid Mohit ₹500 directly |
| `/paid @Mohit to me` | Clear everything Mohit owes you |

### `/got` — Record money received

```
/got <amount> from @person
```

Mirror of `/paid` — use whichever reads more naturally.

### `/balances` — Check what you owe and are owed

```
/balances
/balances @Mohit
```

### `/summary` — Group scoreboard

Shows the minimum set of payments needed to settle all debts in the group.

### `/history` — View recent transactions

```
/history
/history 10
/history @Mohit
/history 10 @Mohit
```

Default count is 5, maximum is 20.

### `/delete` — Remove a transaction

```
/delete           → list recent transactions with numbers
/delete 2         → delete transaction #2 and reverse its balance impact
```

### `/resetall` — Wipe all group data

```
/resetall           → shows a summary and asks for confirmation
/resetall confirm   → permanently clears all transactions and balances
```

### `/help` — Show command reference in chat

---

## Setup

### 1. Install Node.js

Download and install Node.js v18 or newer from https://nodejs.org.

### 2. Clone and install dependencies

```bash
git clone https://github.com/YOUR_USERNAME/splitwala-webjs.git
cd splitwala-webjs
npm install
```

### 3. Start the bot

```bash
npm start
```

On the **first run**, a QR code appears in the terminal.

Open WhatsApp on your phone → **Linked Devices** → **Link a Device** → scan the QR code.

After that, your session is saved in `.wwebjs_auth/` and the bot starts automatically on future runs.

---

## VPS Deployment (PM2)

Install PM2 globally:

```bash
npm install -g pm2
```

Start with PM2:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

View logs:

```bash
pm2 logs splitwala
```

On the first run after deploying, attach to the logs to scan the QR code:

```bash
pm2 logs splitwala --lines 50
```

---

## Notes

- Data is stored in `data/splitwala.db` (SQLite) — balances persist across restarts
- Each group and DM has its own isolated balance sheet
- Use `me`, `i`, or `myself` to refer to yourself in any command
- `.wwebjs_auth/` holds your WhatsApp session — keep it private and back it up
