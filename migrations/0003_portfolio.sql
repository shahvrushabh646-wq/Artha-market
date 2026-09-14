create table if not exists portfolio_transactions (
  id text primary key,
  broker text not null default 'manual',
  broker_trade_id text,
  symbol text not null,
  exchange text not null default 'NSE',
  company text not null default '',
  side text not null check (side in ('BUY','SELL')),
  quantity numeric not null check (quantity > 0),
  price numeric not null check (price >= 0),
  trade_date date not null,
  charges numeric not null default 0,
  source text not null default 'manual',
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (broker, broker_trade_id)
);
create index if not exists portfolio_transactions_date_idx on portfolio_transactions(trade_date desc);
create index if not exists portfolio_transactions_symbol_idx on portfolio_transactions(symbol, exchange, trade_date desc);
