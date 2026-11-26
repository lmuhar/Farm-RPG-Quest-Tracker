-- Read-only keys for the iOS widget. The app stores only a SHA-256 hash of
-- the key; whoever holds the key can read that user's saved tracker state
-- through widget_state(), and nothing else.
create table if not exists public.widget_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  key_hash text not null unique,
  created_at timestamptz not null default now()
);

alter table public.widget_keys enable row level security;

create policy "Users manage their own widget key" on public.widget_keys
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.widget_state(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('state', d.state, 'updated_at', d.updated_at)
  from public.widget_keys k
  join public.user_data d on d.user_id = k.user_id
  where length(p_key) between 32 and 128
    and k.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
$$;

revoke all on function public.widget_state(text) from public;
grant execute on function public.widget_state(text) to anon, authenticated;
