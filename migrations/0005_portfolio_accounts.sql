create table if not exists portfolio_accounts (
  id text primary key,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into portfolio_accounts (id, name, sort_order)
values
  ('account-1', 'Account 1', 1),
  ('account-2', 'Account 2', 2),
  ('account-3', 'Account 3', 3),
  ('account-4', 'Account 4', 4),
  ('account-5', 'Account 5', 5)
on conflict (id) do nothing;

alter table portfolio_transactions add column if not exists account_id text;
update portfolio_transactions set account_id = 'account-1' where account_id is null;
alter table portfolio_transactions alter column account_id set not null;
create index if not exists portfolio_transactions_account_date_idx on portfolio_transactions(account_id, trade_date desc, created_at desc);

alter table portfolio_holdings add column if not exists account_id text;
update portfolio_holdings set account_id = 'account-1' where account_id is null;
alter table portfolio_holdings alter column account_id set not null;

create table if not exists portfolio_holdings_v2 (
  key text primary key,
  account_id text not null,
  symbol text not null,
  exchange text not null default 'NSE',
  company text not null default '',
  quantity numeric not null default 0,
  average_price numeric not null default 0,
  last_price numeric,
  pnl numeric not null default 0,
  updated_at timestamptz not null default now()
);

insert into portfolio_holdings_v2 (key, account_id, symbol, exchange, company, quantity, average_price, last_price, pnl, updated_at)
select account_id || ':' || key, account_id, symbol, exchange, company, quantity, average_price, last_price, pnl, updated_at
from portfolio_holdings
on conflict (key) do nothing;

drop table portfolio_holdings;
alter table portfolio_holdings_v2 rename to portfolio_holdings;
create index if not exists portfolio_holdings_account_idx on portfolio_holdings(account_id, symbol);
