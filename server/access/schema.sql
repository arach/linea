create table if not exists linea_access_grants (
  email text primary key,
  role text not null check (role in ('owner', 'gifted', 'blocked')),
  managed_voice_enabled boolean not null default true,
  managed_alignment_enabled boolean not null default true,
  monthly_tts_char_limit integer,
  monthly_transcription_second_limit integer,
  expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists linea_usage_events (
  id text primary key,
  email text not null,
  clerk_user_id text,
  kind text not null check (kind in ('tts_chars', 'transcription_seconds')),
  units integer not null,
  provider text,
  cache_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists linea_usage_events_email_created_at_idx
  on linea_usage_events (email, created_at desc);
