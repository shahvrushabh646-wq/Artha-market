# Artha-market — Promoter Holding & Pledge Historical Fix Package

This folder documents the supplied historical promoter holding/pledge fix package for 2018–2026 (`Q1`–`Q4`).

The intended package contains:

- `promoterHistoricalEngine.ts`: exact period mapping, filing parsing, verified promoter holding and pledge calculation (`pledged promoter shares / total promoter shares * 100`), and safe diagnostics.
- `useHistoricalPromoterData.tsx`: selected-period record, trend-series and pie-chart binding without latest-quarter fallback.
- `test_promoter_historical.py`: tests for period mapping, denominator math, zero pledge, missing disclosure, and quarter isolation.

**Upload status:** Only this README has been committed so far. The original ZIP and its three source/test files have not been added to this branch yet. The package is not integrated into the app, merged into `main`, or deployed.