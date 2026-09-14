create table if not exists artha_watchlist (
  id integer primary key,
  symbols jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into artha_watchlist (id, symbols)
values (1, '[]'::jsonb)
on conflict (id) do nothing;
