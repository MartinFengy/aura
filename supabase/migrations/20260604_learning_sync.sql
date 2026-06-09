create table if not exists public.learning_tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  source text not null default '',
  created_label text not null,
  raw_text text,
  feishu_link text,
  entries jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create index if not exists learning_tasks_user_updated_idx
  on public.learning_tasks (user_id, updated_at desc);

create table if not exists public.dictation_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  created_label text not null,
  task_ids jsonb not null default '[]'::jsonb,
  task_names jsonb not null default '[]'::jsonb,
  total_questions integer not null default 0,
  repeat_count integer not null default 1,
  mode text not null,
  correct_count integer not null default 0,
  fuzzy_count integer not null default 0,
  wrong_count integer not null default 0,
  answers jsonb not null default '[]'::jsonb,
  primary key (user_id, id)
);

create index if not exists dictation_sessions_user_created_idx
  on public.dictation_sessions (user_id, created_at desc);

create or replace function public.touch_learning_tasks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists learning_tasks_touch_updated_at on public.learning_tasks;
create trigger learning_tasks_touch_updated_at
before update on public.learning_tasks
for each row
execute function public.touch_learning_tasks_updated_at();

alter table public.learning_tasks enable row level security;
alter table public.dictation_sessions enable row level security;

drop policy if exists "Users can read own learning tasks" on public.learning_tasks;
create policy "Users can read own learning tasks"
on public.learning_tasks
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own learning tasks" on public.learning_tasks;
create policy "Users can insert own learning tasks"
on public.learning_tasks
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own learning tasks" on public.learning_tasks;
create policy "Users can update own learning tasks"
on public.learning_tasks
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own learning tasks" on public.learning_tasks;
create policy "Users can delete own learning tasks"
on public.learning_tasks
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own dictation sessions" on public.dictation_sessions;
create policy "Users can read own dictation sessions"
on public.dictation_sessions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own dictation sessions" on public.dictation_sessions;
create policy "Users can insert own dictation sessions"
on public.dictation_sessions
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own dictation sessions" on public.dictation_sessions;
create policy "Users can update own dictation sessions"
on public.dictation_sessions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own dictation sessions" on public.dictation_sessions;
create policy "Users can delete own dictation sessions"
on public.dictation_sessions
for delete
using (auth.uid() = user_id);
