# Artha-market — Promoter Holding & Pledge Historical Fix Package

This package contains modular implementation files to fix historical Promoter Holding and Promoter Pledge data across **2018–2026** (`Q1`–`Q4`):

1. `promoterHistoricalEngine.ts`
   - Resolves year + quarter to canonical reporting period-end dates (`YYYY-MM-DD`) without conflating filing/submission date with period-end date.
   - Parses NSE/BSE XBRL XML and structured filing fields across varying tag names.
   - Computes Promoter Pledge % strictly as: `Promoter Pledge % = (Shares Pledged by Promoters / Total Promoter Shares) * 100`
   - Marks missing/unverified holdings or pledge disclosures as `NOT_VERIFIED` with a diagnostic reason instead of falling back to another quarter or carrying forward prior values.
   - Emits safe diagnostic logs (`symbol`, `year`, `quarter`, `periodEndDate`, `filingDate`, `source`, `promoterShares`, `pledgedPromoterShares`, `calculatedPledgePct`, `verificationReason`) without exposing credentials or secrets.

2. `useHistoricalPromoterData.tsx`
   - Binds historical year (`2018–2026`) and quarter (`Q1–Q4`) selection to `selectedRecord`, `trendChartData`, and `pieChartData`.
   - Prevents the pie chart or historical chart from falling back to the latest quarter when a historical period is selected or unverified.

3. `test_promoter_historical.py`
   - Unit tests covering 2018–2026 (`Q1`–`Q4`), active promoter pledge denominator math, zero pledge (`0%`), missing pledge disclosure (`NOT_VERIFIED`), and quarter isolation.

Note: These files are staged as a separate package on a feature branch; they are not yet wired into the live application. Integrate them with the existing promoter data source and UI after validating the current repository's actual file structure and data contracts.