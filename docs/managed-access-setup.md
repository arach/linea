# Managed Access Setup

This repo now supports two voice modes:

- Local mode: the existing credential flow in the app and Bun secure storage
- Managed mode: authenticated access to server-side provider keys with quota tracking

Managed mode is controlled by `LINEA_MANAGED_ACCESS_ENABLED=true`.

## What Was Added

- Auth-aware access session endpoint at `/api/access/session`
- Shared-access policy layer in `server/access`
- Optional Postgres-backed metering and access grants
- Managed TTS and alignment gating on `/api/vox/synthesize` and `/api/vox/align/:cacheKey`
- Reader UI scaffolding for sign-in and managed voice status

## Environment Variables

Copy `.env.example` to `.env.local` for local development or add these in Vercel:

```bash
LINEA_AUTH_PROVIDER=clerk

VITE_CLERK_PUBLISHABLE_KEY=
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

LINEA_X_CLIENT_ID=
LINEA_X_CLIENT_SECRET=
LINEA_X_CALLBACK_URL=
LINEA_SESSION_SECRET=

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

- `LINEA_AUTH_PROVIDER` can be `clerk`, `x`, `auto`, or `none`.
- `auto` preserves the existing default by preferring Clerk when it is configured, then X.
- `VITE_CLERK_PUBLISHABLE_KEY` is used by the browser.
- `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are used by the Express server.
- `LINEA_X_CLIENT_ID`, `LINEA_X_CLIENT_SECRET`, and `LINEA_X_CALLBACK_URL` configure direct OAuth with X.
- `LINEA_SESSION_SECRET` signs the short-lived X auth flow cookie and the Linea session cookie.
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

## Direct X Setup

Use this when you want to bypass Clerk and authenticate against X directly.

1. Set `LINEA_AUTH_PROVIDER=x`.
2. Create or open your X app in the Developer Console.
3. Enable OAuth 2.0 for the app and use a confidential client type.
4. Add an exact callback URL such as `http://localhost:5173/api/access/auth/x/callback` for local development and your production callback URL for Vercel.
5. Copy the X client ID and client secret into `LINEA_X_CLIENT_ID` and `LINEA_X_CLIENT_SECRET`.
6. Set `LINEA_X_CALLBACK_URL` to the exact callback URL you registered in X.
7. Generate a strong random value for `LINEA_SESSION_SECRET`.

The direct X flow currently requests `users.read` and `users.email`, then stores a signed Linea session cookie after callback.

## Google And X

Recommended sequence:

1. Get one auth provider working end to end.
2. Confirm `/api/access/session` returns a signed-in email.
3. Only then rely on the email allowlist or Postgres grants.

The current shared-access policy is still email-driven, so whichever provider you use needs to yield a usable email address after sign-in.

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
4. Add the auth-provider envs for whichever path you are using.
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

If you are testing direct X auth, open the app in the browser and use the sign-in button or go directly to:

```bash
open 'http://localhost:5173/api/access/auth/x/start?return_to=%2Fplayground'
```

If port `5173` is already occupied, use:

```bash
PORT=5174 bun run dev
```

## Current Limits Of This Scaffold

- Audio file serving is still URL-based and not yet user-bound.
- Metering is append-only usage tracking, not billing.
- Access grants are email-centric; there is not yet an admin UI for editing them.
- Direct X auth currently clears the local Linea session on sign-out, but it does not revoke the connected app grant on X.
