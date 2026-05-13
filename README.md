# Pressure

Mobile-first prototype for an accountability social app where friends keep each other consistent through live camera checks, streaks, commitment fees, and group pressure.

Live preview: https://laiointel-png.github.io/pressure-app/

## Current MVP direction

- Basic-Fit-inspired orange/black/white mobile UI
- Working Today, Group, Check, Rank, Profile, Payment Model, and Create Group screens
- Onboarding flow with persisted user + group config (localStorage)
- RF-DETR-ready live camera verification adapter with demo fallback
- Payment-safe beta model: subscription + platform miss fee, no cash pot, no wallet, no winner payout
- Group creation form, payment model choices, setup simulation, and transparent fee ledger

## Preview locally

```bash
python3 -m http.server 5173
```

Open `http://localhost:5173`.

## Persisted onboarding + group config

The prototype now persists user + group configuration in `localStorage` under `pressure.mvp.v1`.

- First visit shows the onboarding screen.
- Group creation updates the stored config and propagates to Home/Group/Create screens.
- Invite links now include a compact, self-contained group snapshot (`?join=...&g=...`) so teammates can join even without a backend.

## Prototype assets

Real-photo fallback assets are stored in `assets/` and are sourced from Pexels while Nano Banana image generation is quota-blocked:

- `trace-athlete-lunge.jpg`: https://www.pexels.com/photo/focused-athlete-performing-lunges-with-dumbbells-33185468/
- `trace-athlete-squat.jpg`: https://www.pexels.com/photo/woman-performing-squats-in-modern-gym-setting-29259728/

## RF-DETR camera intelligence

The camera screen includes a RF-DETR-ready vision adapter:

- Live camera preview through `getUserMedia`
- Canvas detection overlay
- Detection chips for person/body/workout context
- Automatic local RF-DETR endpoint connection on `http://localhost:8000/api/rfdetr/detect`
- Local demo detector when the backend is unavailable or returns no detections

See `docs/rfdetr-integration.md` and `backend/rfdetr_api_example.py`.

## Payment model

The beta intentionally does not use "winner gets the pot". The safer direction is:

- Stripe Billing subscription for app access
- Explicit saved payment method for future miss fees
- Miss fees as platform commitment fees
- Rank/perks for winners without cash-out

See `docs/payment-strategy.md`.

Backend sketch: `backend/payment_api_example.py` has the Stripe endpoints for Checkout subscription, saved payment method setup, miss-fee charge, and webhook handling.

## Backend (optional)

For wiring the frontend to real endpoints (Stripe demo/real + group + member persistence), run the unified API server:

```bash
.venv/bin/python -m pip install fastapi uvicorn stripe
.venv/bin/python -m uvicorn backend.app:app --port 8001
```

What the backend enables:

- Group persistence/sync (`/api/groups`, `/api/invites`)
- Members + check-ins (`/api/members`, `/api/checkins`)
- Payment-safe billing endpoints (`/api/payments/*`) with demo fallbacks when Stripe isn’t configured
- Shared ledger events (`/api/ledger`)

Stripe safety defaults:

- Live keys (`sk_live_...`) are treated as **disabled** by default (fail-closed).
- To allow live keys intentionally, set `PRESSURE_STRIPE_ALLOW_LIVE=1` and `PRESSURE_STRIPE_MODE=live_allowed`.
- For test-only usage (recommended), use `sk_test_...` and keep defaults.

Then set the frontend API base in onboarding (or manually):

```js
localStorage.setItem("pressureApiBase", "http://localhost:8001");
```

## Verify

```bash
node --check script.js
python3 -m compileall -b backend
node scripts/a11y_check.mjs
```

## GitHub Pages

This repo is configured for GitHub Pages through `.github/workflows/pages.yml`.

After pushing to GitHub:

1. Open the repository on GitHub.
2. Go to `Settings` -> `Pages`.
3. Set `Source` to `GitHub Actions`.
4. The workflow will publish the static app.

The preview URL will look like:

```text
https://<username>.github.io/<repo-name>/
```

To connect a new empty GitHub repository from this local folder:

```bash
git remote add origin https://github.com/<username>/<repo-name>.git
git push -u origin main
```
