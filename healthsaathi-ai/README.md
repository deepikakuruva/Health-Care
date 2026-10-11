# HealthSaathi AI

A responsive wellness-companion **prototype**: dashboard, health notes, medicine reminders, appointments, and a Health Assistant. **Not a medical device. It cannot diagnose, treat, or handle emergencies.**

## How the Health Assistant works

1. **Emergency rules first (in the browser and again on the server).** If a message looks like an emergency (chest pain, breathing trouble, stroke signs, overdose/poisoning, severe allergy, heavy bleeding, collapse/seizure, self-harm), the page shows "call **112**" guidance immediately. No AI is involved, so this still works if Gemini is down or no key is set.
2. **Medicine-dose questions** get a fixed answer ("ask a pharmacist or doctor"). No doses are ever generated.
3. **Everything else** is sent to `POST /api/chat`, a serverless function that calls Google Gemini using a key kept **only** in a server environment variable.
4. If the AI fails (not configured, timeout, rate limit, network, bad response) the page shows a clear error with a **Retry** button, plus an optional "basic offline tips" button whose answer is labelled *not AI-generated*. A failure is never shown as an AI answer.

**Limits:** emergency detection is simple phrase matching. It will miss some phrasings, spellings, languages and indirect descriptions, and it has **not been clinically validated**. The wording needs review by a qualified clinician before any real-world use. This project makes no claim of medical, legal or regulatory compliance.

## Privacy

- Messages that are not flagged as emergencies are sent through this site's server to **Google Gemini**. Do not enter names, phone numbers, ID numbers, or other personal or sensitive details.
- This site does not store chat messages. The server does not log message text or the API key.
- Notes, reminders and appointments live only in the open page (browser memory) and disappear on refresh.
- The dashboard numbers (sleep, steps, etc.) are demo data.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole front end (design unchanged) |
| `safety.js` | Emergency/dose rules and safe messages, shared by browser and server |
| `api/chat.js` | Vercel serverless endpoint (validation, rules, Gemini call) |
| `tests/` | Automated tests (Gemini is mocked; no key needed) |
| `.env.example` | Environment variable **names** only |

## Run the tests

```
npm install
npm test          # runs all tests
npm run check     # syntax check of safety.js and api/chat.js
```

## Try it locally

- Open `index.html` in a browser. Everything works except the AI answer: you will see the "couldn't reach the assistant" error with Retry and offline tips (there is no server). Emergency guidance works.
- To run the real endpoint locally you need the Vercel CLI: set `GEMINI_API_KEY` in a local `.env` file (never commit it), then run `npx vercel dev`.

## Deploy on Vercel

1. Put this folder in a GitHub repository. If the app stays inside a `healthsaathi-ai` subfolder, you must set the Root Directory below.
2. In Vercel: **Add New → Project →** import the repository.
3. **Root Directory:** `healthsaathi-ai` (only if the repo root is *not* this folder). **Framework Preset:** Other. Leave Build Command and Output Directory empty.
4. **Settings → Environment Variables:** add `GEMINI_API_KEY` (your key from Google AI Studio). Optional: `GEMINI_MODEL` (default `gemini-3.1-flash-lite`), `GEMINI_TIMEOUT_MS` (default 8000), `CHAT_RATE_LIMIT` (default 20 per minute per IP).
5. **Deploy.** After adding or changing a variable, **Redeploy** (Deployments → ⋯ → Redeploy); variables only apply to new deployments.
6. Check `https://<your-project>.vercel.app/api/chat` in a browser: it should answer `405 method_not_allowed` (that means the function is deployed). Then try the chat.

## Notes and known limits

- **Emergency detection recall is limited.** In my own checks with two sets of phrasings written by me (not real user data), the rules caught about 77% (30 of 39) of one set before fixes and 80% (24 of 30) of a second, unseen set. Treat that as a rough indication that the rules miss roughly one in five unseen phrasings, which is why the 112 banner is always visible. The rules also err on the side of escalating (for example, "pain in my shoulder and my chest workout is tomorrow" triggers guidance).
- **Mobile layout fix:** the original one-column mobile layout let the navigation row widen the whole page (about 554px of sideways scrolling at 375px wide). One added rule inside `@media(max-width:650px)` makes the navigation scroll sideways instead, as the original CSS intended. Desktop styling is unchanged.
- The page has no favicon, so browsers log a harmless 404 for `/favicon.ico`.

- Gemini model names change over time. If answers start failing with "couldn't answer right now", check the model list in Google's documentation and set `GEMINI_MODEL`.
- The rate limiter lives in memory, so it is best-effort only (each serverless instance counts separately). It is not strong abuse protection.
- Hindi/Hinglish coverage is a starting list, not complete.
