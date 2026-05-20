# UK Household Budget App Implementation Brief

## Product Scope

This is a manual-first personal budgeting web app for one UK household with up to two people. Each person has a separate login, both users can see the same household data, and there is no bank feed or Open Banking integration.

The first version supports:

- Person A, Person B, and Shared household ownership.
- Planned recurring income, expenses, and savings contributions.
- Monthly and yearly frequencies with monthly equivalent calculations.
- Manual net income and estimated take-home pay from gross salary.
- Student loan Plan 1, Plan 2, Plan 4, Plan 5, and Postgraduate Loan selection.
- Actual transactions entered manually or imported from CSV.
- Planned versus actual variance reporting.
- Calendar month, calendar year, and UK tax-year reporting.
- Monthly cashflow forecasting.
- Savings goal progress.
- CSV export for key data and reports.

## Technical Architecture

The app uses Node 22, Express, Multer for CSV uploads, `node:sqlite`, server-rendered HTML, and plain CSS. Express owns routing, URL-encoded form parsing, static assets, and error flow. Multer handles the one multipart CSV upload route.

Main structure:

- `src/app.js`: Express app setup, security headers, form parsing, static assets, error handling, route registration.
- `src/http/expressAdapter.js`: small adapter that gives route modules a consistent `ctx` object while using Express underneath.
- `src/routes/`: page and form handlers.
- `src/repositories/`: database access only.
- `src/services/`: isolated business logic and calculations.
- `src/db/schema.sql`: SQLite schema.
- `src/views/`: small HTML helper functions.
- `config/tax-rules/`: tax-year-specific UK tax, National Insurance, and student loan rules.
- `src/tests/`: service-level tests.

## Data Model

Core tables:

- `households`: one shared household with invite code and forecast opening balance.
- `users`: separate logins, each assigned `person_a` or `person_b`.
- `sessions`: server-side sessions with CSRF token.
- `categories`: shared UK-friendly category list.
- `budget_items`: planned income, expense, and savings items.
- `income_estimates`: original gross salary assumptions and calculated deductions.
- `transactions`: actual income, expense, and savings records.
- `savings_goals`: simple savings targets and progress inputs.
- `csv_import_batches` and `csv_import_rows`: preview/import audit trail.

## Calculation Notes

Monthly equivalent:

```text
monthly item = amount
yearly item = amount / 12
```

Take-home pay estimate order:

```text
gross annual salary
- pre-tax pension and other pre-tax deductions for taxable/NI/loanable pay
- Income Tax
- employee Class 1 National Insurance
- undergraduate student loan repayment
- Postgraduate Loan repayment
- pension contribution
- other pre-tax and post-tax deductions
= estimated annual net income
```

Student loan handling follows GOV.UK guidance:

- Plan 1, 2, 4, and 5 use 9% above the applicable threshold.
- If multiple undergraduate plans are selected, use the lowest active threshold for a single 9% repayment.
- Postgraduate Loan is calculated separately at 6% above its threshold.

The calculation is an annualised budgeting estimate, not a payroll-accurate payslip calculator.

## UK Tax-Year Rules

Rules are stored outside calculation logic:

- `config/tax-rules/2025-2026.json`
- `config/tax-rules/2026-2027.json`

The files include source URLs for:

- GOV.UK Income Tax rates and allowances.
- GOV.UK employer National Insurance thresholds.
- GOV.UK student loan repayment thresholds.

Future tax years should be added by creating another JSON file with the same structure, after checking current GOV.UK/HMRC/Student Loans Company guidance.

## Security

Implemented basic safeguards:

- Passwords are hashed with Node `crypto.scrypt`.
- Server-side sessions use random tokens in HttpOnly SameSite cookies.
- Authenticated POST forms require CSRF tokens.
- All data access is scoped by `household_id`.
- CSV uploads are size-limited and parsed server-side.
- CSV import has simple duplicate detection based on date, amount, and description.

## Running Locally

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

Run tests:

```bash
npm test
```

SQLite data is stored in `data/budget.sqlite` by default. Override with `DB_PATH=/path/to/file.sqlite`.

## Known First-Version Boundaries

- No Open Banking or automatic bank transaction syncing.
- No more than two household members.
- No complex payroll features such as exact pay-period rounding, Scottish income tax, benefits in kind, directors' NI, or full pension scheme modelling.
- CSV import is manual mapping and validation, not automatic categorisation.
- UI is server-rendered and intentionally simple.
