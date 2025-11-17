# ASTRA-Smart-Travel
Automated Smart Travel &amp; Route Assistant
# ASTRA Smart Travel

Starter repo for ASTRA — Automated Smart Travel & Route Assistant.

This repository contains:
- `frontend/` — Vite + React minimal frontend (mobile-first).
- `backend/` — Node + Express backend with Cloudinary signed upload, Google OAuth callback, Postgres (knex) hooks, calendar sync, and translate proxy.
- `migrations/` — SQL for database initialization.
- `.github/workflows/ci-cd.yml` — CI skeleton for frontend deploy (Vercel) and pointers for backend.

## Quick local run (development)
1. Create `.env` in `backend/` from `backend/.env.example` and fill values (DATABASE_URL, JWT_SECRET, CLOUDINARY_*, GOOGLE_*).
2. Start Postgres (local or Docker).
3. Run migration:  
