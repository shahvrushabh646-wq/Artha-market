create table if not exists portfolio_holdings (
  key text primary key,
  symbol text not null,
  exchange text not null default 'NSE',
  company text not null default '',
  quantity numeric not null default 0,
  average_price numeric not null default 0,
  last_price numeric,
  pnl numeric,
  updated_at timestamptz not null default now()
);
