# Splitwala TG Test Harness

End-to-end test harness that exercises all Splitwala Telegram commands in the BCS group using a gramjs userbot.

## Setup (one time)

### 1. Get Telegram API credentials

Go to https://my.telegram.org → API development tools → create an app.
Copy `App api_id` and `App api_hash`.

### 2. Add to .env

```
TG_API_ID=12345678
TG_API_HASH=abcdef1234567890abcdef1234567890
TG_BOT_USERNAME=your_splitwala_bot_username
TG_TEST_GROUP=-100123456789
TEST_SENDER=curls1108
TEST_PARTICIPANT_1=metasmic
TEST_PARTICIPANT_2=vipbhavs
```

To get `TG_TEST_GROUP`: forward any message from BCS to @userinfobot — it prints the chat ID.

### 3. Generate session string (interactive, run once)

```bash
node tg/test-harness/login.js
```

Enter your phone number and the SMS code. Copy the printed session string into .env:

```
TG_USER_SESSION=1BVtsOKABu...
```

## Running

```bash
# All scenarios
node tg/test-harness/run.js

# One scenario
node tg/test-harness/run.js --scenario 01-smoke

# Custom report path
node tg/test-harness/run.js --report /var/tmp/report.json --md /var/tmp/report.md

# Longer timeout (useful on slow connections)
node tg/test-harness/run.js --timeout 20000
```

Exit code 0 = all passed. Exit code 1 = one or more failed.

## Hermes invocation

```bash
node /root/splitwala-webjs/tg/test-harness/run.js \
  --report /var/tmp/splitwala-test-report.json \
  --md /var/tmp/splitwala-test-report.md
```

## Scenarios

| ID | Name | What it tests |
|----|------|---------------|
| 01-smoke | Smoke | /help and /start respond correctly |
| 02-split-equal | Split equal | 3-way equal split, balance check |
| 03-split-unequal | Split unequal | Unequal shares via natural language |
| 04-settlement | Settlement | /paid and /got reduce balances correctly |
| 05-history-delete | History and delete | /history lists transactions, /delete removes them |
| 06-reset | Reset all data | /resetall confirm wipes ledger |
| 07-mentions | Mention rendering | Known users get tg://user?id= links; unknown get @username |
| 08-errors | Error handling | No crashes on bad input |
