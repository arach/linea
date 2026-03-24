# Managed Access Setup

This repo now supports two voice modes:

- Local mode: the existing credential flow in the app and Bun secure storage
- Managed mode: Clerk-authenticated access to server-side provider keys with quota tracking

Managed mode is controlled by `LINEA_MANAGED_ACCESS_ENABLED=true`.

## What Was Added

- Clerk-aware access session endpoint at `/api/access/session`
- Shared-access policy layer in `server/access`
- Optional Postgres-backed metering and access grants
- Managed TTS and alignment gating on `/api/vox/synthesize` and `/api/vox/align/:cacheKey`
- Reader UI scaffolding for sign-in and managed voice status

## Environment Variables

Copy `.env.example` to `.env.local` for local development or add these in Vercel:

```bash
VITE_CLERK_PUBLISHABLE_KEY=
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

LINEA_MANAGED_ACCESS_ENABLED=true
LINEA_MANAGED_OPENAI_API_KEY=
LINEA_MANAGED_ELEVENLABS_API_KEY=

LINEA_OWNER_EMAILS=you@example.com
LINEA_MANAGED_ALLOWED_EMAILS=friend@example.com,another@example.com

LINEA_DEFAULT_TTS_CHAR_LIMIT=250000
LINEA_DEFAULT_TRANSCRIPTION_SECOND_LIMIT=7200

DATABASE_URL=
```

Notes:

- `VITE_CLERK_PUBLISHABLE_KEY` is used by the browser.
- `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are used by the Express server.
- `LINEA_MANAGED_OPENAI_API_KEY` and `LINEA_MANAGED_ELEVENLABS_API_KEY` are the shared server-side keys.
- `LINEA_OWNER_EMAILS` always get unlimited access.
- `LINEA_MANAGED_ALLOWED_EMAILS` get the default managed quotas unless a Postgres grant overrides them.
- If `DATABASE_URL` is missing, metering falls back to in-memory in local development and becomes effectively read-only in production.

## Clerk Setup

1. Create or choose the Clerk application you want to use for Linea.
2. Copy the publishable key and secret key into your local env or Vercel project.
3. In Clerk, enable the social connections you want:
   - Google first is the cleanest default for email-based access control.
   - X can be enabled as a secondary login path later.
4. Set your Clerk allowed redirect URLs to the Linea app URL you are using locally and on Vercel.

## Google And X

Recommended sequence:

1. Enable Google in Clerk first.
2. Confirm sign-in works locally.
3. Add X only after the email-based allowlist flow is working cleanly.

Because the current shared-access policy is email-driven, Google is the primary path that maps best to “signed in with the right email address.”

## Postgres Setup

The schema lives at `server/access/schema.sql`.

Apply it with your preferred SQL client, for example:

```bash
psql "$DATABASE_URL" -f server/access/schema.sql
```

Tables created:

- `linea_access_grants`
- `linea_usage_events`

Suggested first grant:

```sql
insert into linea_access_grants (
  email,
  role,
  managed_voice_enabled,
  managed_alignment_enabled,
  monthly_tts_char_limit,
  monthly_transcription_second_limit
) values (
  'friend@example.com',
  'gifted',
  true,
  true,
  250000,
  7200
)
on conflict (email) do update set
  role = excluded.role,
  managed_voice_enabled = excluded.managed_voice_enabled,
  managed_alignment_enabled = excluded.managed_alignment_enabled,
  monthly_tts_char_limit = excluded.monthly_tts_char_limit,
  monthly_transcription_second_limit = excluded.monthly_transcription_second_limit,
  updated_at = now();
```

## Vercel Checklist

1. Add all env vars from `.env.example`.
2. Set `LINEA_MANAGED_ACCESS_ENABLED=true`.
3. Add the managed provider keys.
4. Add the Clerk keys.
5. Add `DATABASE_URL`.
6. Redeploy.

## Local Verification

Run:

```bash
bun run dev
```

Then verify:

```bash
curl http://localhost:5173/api/access/session
curl http://localhost:5173/api/vox/providers
curl http://localhost:5173/api/vox/capabilities
```

If port `5173` is already occupied, use:

```bash
PORT=5174 bun run dev
```

## Current Limits Of This Scaffold

- Audio file serving is still URL-based and not yet user-bound.
- Metering is append-only usage tracking, not billing.
- Access grants are email-centric; there is not yet an admin UI for editing them.
- Clerk sign-in is wired into the app shell, but the landing page does not yet have a dedicated auth surface.
