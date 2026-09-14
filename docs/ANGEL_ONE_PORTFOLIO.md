# Angel One Portfolio Sync

Artha uses Angel One SmartAPI in **read-only mode** for portfolio display. Artha does not call any order-placement, modify-order or cancel-order endpoint.

## Vercel environment variables

Add these as server-side Vercel Environment Variables (never in `VITE_*` variables and never in frontend code):

- `ANGEL_API_KEY` — SmartAPI app API key
- `ANGEL_CLIENT_CODE` — Angel One client code
- `ANGEL_PASSWORD` — Angel One API login password/PIN used by SmartAPI
- `ANGEL_TOTP_SECRET` — the TOTP secret from the Angel One SmartAPI TOTP setup

Redeploy after adding them.

## What sync does

1. Logs in to SmartAPI using the configured credentials and generates the current TOTP server-side.
2. Reads current holdings with `getAllHolding`.
3. Reads the current day's trade book with `getTradeBook`.
4. Stores newly seen BUY/SELL trades in Artha's persistent transaction ledger.
5. Stores the latest holdings snapshot separately.

## Full historical transactions

Angel One states that SmartAPI does not provide a separate API for past transactions; `getTradeBook` is for the day's trades. Therefore the Portfolio page also has **Import Angel One history CSV**. Export the historical trade data from Angel One and import that CSV once. After that, daily SmartAPI sync keeps the ledger up to date.

## Security

The integration intentionally does not implement BUY/SELL order placement. API credentials stay server-side. Do not paste API keys, PINs, TOTP secrets or passwords into chat or source files.
