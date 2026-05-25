# PDF Quiz Converter — Telegram Bot

Converts **Test PDF + Solution PDF** into a clean formatted `.txt` file via Telegram.

---

## Setup (3 steps)

### Step 1 — Create your Telegram Bot

1. Open Telegram → search `@BotFather`
2. Send `/newbot` and follow the instructions
3. Copy the **BOT_TOKEN** you receive (looks like `123456789:ABCDef...`)

---

### Step 2 — Deploy to Vercel

1. Upload this folder to a **GitHub repo**
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import your repo
3. In **Environment Variables**, add:
   - `BOT_TOKEN` = your token from BotFather
4. Click **Deploy**
5. Copy your deployment URL, e.g. `https://your-bot.vercel.app`

---

### Step 3 — Register the Webhook

After deployment, open this URL in your browser (replace with your values):

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-bot.vercel.app/api/webhook
```

You should see: `{"ok":true,"result":true,...}`

---

## How to use the bot

1. Open your bot on Telegram → send `/start`
2. Send the **TEST PDF** (question booklet with (a)(b)(c)(d) options)
3. Send the **SOLUTION PDF** (answer key + explanations)
4. Receive your formatted `.txt` file instantly ✅

---

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Start a new conversion |
| `/reset` | Reset and start over |
| `/help`  | Show usage instructions |

---

## Project Structure

```
telegram-quiz-bot/
├── api/
│   └── webhook.js        ← Vercel serverless function (main bot logic)
├── lib/
│   ├── pdfExtract.js     ← PDF text extraction using pdfjs-dist
│   ├── parseTest.js      ← Parses questions from Test PDF
│   ├── parseSolution.js  ← Parses answers + explanations from Solution PDF
│   └── buildOutput.js    ← Formats output to match REQUIRED.txt
├── package.json
├── vercel.json
└── .env.example
```

---

## Output Format

```
Q1. Question text here
1. Statement one
2. Statement two
Which of the statements...
😂
Option A
Option B ✅
Option C
Option D
Ex: Full explanation from the Solution PDF...

Q2. ...
```

---

## Notes

- Vercel free tier: max **60 seconds** per request (enough for 100-question PDFs)
- The bot handles one conversion at a time per user
- Send `/reset` anytime to start over
