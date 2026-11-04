# HelioHeat

Surplus-solar hot water planner. Built as a software internship portfolio piece for Novolto.

Households with PV often export midday electricity while still buying grid power to heat water. HelioHeat takes PV size, tank volume, heater power and tariffs, then plans when to run the immersion heater: surplus first, morning deadline backup if showers still need heat.

## What it shows

- 24-hour PV vs household load vs surplus
- Three strategies: heat now, surplus first, optional night tariff
- Cost, self-consumption and whether the tank hits target temperature
- A run window a product like Novolto could send to a smart relay
- Optional Groq step that turns those numbers into a customer email (planner works without a key)

## Run locally

```bash
npm --prefix backend install
npm --prefix frontend install
bash start.sh
```

Open http://localhost:5173. Vite proxies `/api` to Express on port 3001.

Optional customer-email feature:

```bash
cp .env.example .env
```

Put your Groq key in `.env` as `USER_LLM_API_KEY`, then:

```bash
export $(grep -v '^#' .env | xargs)
bash start.sh
```

## Production (one process)

```bash
npm --prefix backend install --omit=dev
npm --prefix frontend install
npm --prefix frontend run build
PORT=3001 node backend/server.js
```

Express then serves `frontend/dist` and `/api`.

## Deploy live (Render, free)

1. Push this repo to GitHub.
2. [console.render.com](https://render.com) → New → Web Service → connect the repo.
3. Build command:

```bash
npm --prefix backend install && npm --prefix frontend install && npm --prefix frontend run build
```

4. Start command:

```bash
node backend/server.js
```

5. Set `PORT` is automatic on Render. Optional: Environment → `USER_LLM_API_KEY` = your Groq key (from https://console.groq.com/keys). Also `USER_LLM_BASE_URL=https://api.groq.com/openai/v1` and `USER_LLM_MODEL=llama-3.1-8b-instant`.
6. Deploy. Share the `onrender.com` URL.

Railway is the same idea: build the frontend, start `node backend/server.js`, add the same env vars.

Do not put the Groq key in the frontend or in git.

## Stack

- React + Vite dashboard
- Express planning API
- Deterministic Berlin-like PV shapes (June, September, March overcast, December)
- Optional Groq Llama for the customer email only

Not live meter data. The engine is the demo: thermal energy for a tank, surplus ranking, and a deadline backup so morning hot water still happens on a grey day.
