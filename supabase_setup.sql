-- ====================================================================
-- SUPABASE CODE DEPLOYMENT FOR SAVED PLAYERS & DRAWS (JC TENNIS)
-- ====================================================================
-- Run this script in the SQL Editor of your Supabase Dashboard
-- to create the required tables and configure access permissions.

-- 1. Create the 'saved_players' table if it doesn't exist
create table if not exists public.saved_players (
    id text primary key,
    name text not null,
    url text,
    source text,
    utr_singles text default '-',
    wtn_singles text default '-',
    win_loss_ytd text default '-',
    win_loss_career text default '-',
    championships text default '-',
    rank text default '-',
    points text default '-',
    sort_order integer,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create the 'saved_draws' table if it doesn't exist
create table if not exists public.saved_draws (
    id text primary key,
    name text not null,
    url text not null,
    region text default 'AUS',
    players jsonb default '[]'::jsonb,
    sort_order integer,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create the 'notifications_history' table if it doesn't exist
create table if not exists public.notifications_history (
    id text primary key,
    player text not null,
    title text not null,
    body text not null,
    type text not null,
    source text not null,
    date text not null,
    timestamp timestamp with time zone not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Row Level Security (RLS) Configuration
-- If you are using the Service Role Key (SUPABASE_SERVICE_ROLE_KEY) in your environment,
-- all queries bypass RLS automatically.
--
-- If you are using the Standard Anon Key (SUPABASE_ANON_KEY), choose ONE of the two options below:

-- OPTION A: Disable RLS entirely to allow full public connection (Easiest & Recommended)
alter table public.saved_players disable row level security;
alter table public.saved_draws disable row level security;
alter table public.notifications_history disable row level security;

-- OPTION B: Keep RLS enabled but explicitly grant full public CRUD permissions
-- Uncomment the block below to use this option instead:
/*
-- For saved_players
alter table public.saved_players enable row level security;
drop policy if exists "Allow public SELECT" on public.saved_players;
create policy "Allow public SELECT" on public.saved_players for select using (true);
drop policy if exists "Allow public INSERT" on public.saved_players;
create policy "Allow public INSERT" on public.saved_players for insert with check (true);
drop policy if exists "Allow public UPDATE" on public.saved_players;
create policy "Allow public UPDATE" on public.saved_players for update using (true) with check (true);
drop policy if exists "Allow public DELETE" on public.saved_players;
create policy "Allow public DELETE" on public.saved_players for delete using (true);

-- For saved_draws
alter table public.saved_draws enable row level security;
drop policy if exists "Allow public SELECT" on public.saved_draws;
create policy "Allow public SELECT" on public.saved_draws for select using (true);
drop policy if exists "Allow public INSERT" on public.saved_draws;
create policy "Allow public INSERT" on public.saved_draws for insert with check (true);
drop policy if exists "Allow public UPDATE" on public.saved_draws;
create policy "Allow public UPDATE" on public.saved_draws for update using (true) with check (true);
drop policy if exists "Allow public DELETE" on public.saved_draws;
create policy "Allow public DELETE" on public.saved_draws for delete using (true);
*/

-- 4. Force PostgREST to reload the schema cache immediately
NOTIFY pgrst, 'reload schema';
