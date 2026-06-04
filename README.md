# UK Household Budget App

Planning-first UK household budgeting app for up to two people.

The app is designed around a simple model:

- Plan what should happen
- Record what did happen
- Compare the difference
- Forecast what comes next

It is useful as a planning tool even if you never record actual transactions.

## Current product model

### Main areas

- `Dashboard`
  - period-based overview
  - supports planning-only households and households that track actuals
- `Budget Plan`
  - stable expected plan
  - sections for `Overview`, `Income`, `Planned Spending`, and `Planned Savings`
- `Actuals`
  - real income, spending, and savings movements
  - manual entry and CSV import
- `Savings & goals`
  - `Accounts & Pots` = where money is held
  - `Goals` = what the money is for
- `Forecast`
  - `Cashflow forecast` based on spendable balances and the current Budget Plan
  - `Savings projection` based on balances, additions, top-ups, and growth assumptions
- `Import/Export`
  - CSV transaction import
  - exports for Budget Plan, actuals, savings, and monthly summaries
- `Settings`
  - `Household & members`
  - `Expense categories`
  - `Danger zone`

### Budget Plan

`Budget Plan` is the stable expected plan, not a month-by-month transaction tracker.

It supports:

- planned income
- planned spending
  - `Regular`
  - `Variable estimate`
- planned savings
- yearly items smoothed into monthly planning values
- status-aware planned items using start date, optional end date, and active/paused/ended state

### Actuals

`Actuals` is optional.

Use it if you want to:

- manually record actual transactions
- import bank statements by CSV
- compare your plan with reality on the Dashboard

### Savings & goals

Savings uses a clear distinction:

- `Accounts & Pots` = where money is held
- `Goals` = what the money is for

Savings accounts and pots support:

- current balances
- monthly additions
- employer / top-up additions where relevant
- growth or interest assumptions
- access / liquidity settings
- inclusion or exclusion from household cashflow forecasts

Savings goals support:

- `Linked pots` mode
  - derive current saved, monthly additions, projection, and shortfall from linked pots
- `Manual` mode
  - for goals that are not linked to pots

### Forecast

Forecast is split into two distinct models:

- `Cashflow forecast`
  - derived from spendable accounts/pots plus the current Budget Plan
- `Savings projection`
  - projects balances and contributions across savings pots over time

The forecast starting balance is derived from active accounts/pots marked as available for household cashflow, with an optional forecast adjustment for small corrections.

## Key features

- Two-person household support
- Planning-first budgeting workflow
- Planned income with:
  - manual net income
  - estimated take-home pay from gross salary
- UK tax-year-aware salary estimation
- Student loan and postgraduate loan support
- Planned spending with regular and variable estimate types
- Planned savings contributions
- Optional actual transaction tracking
- CSV import review flow with row statuses and duplicate checks
- Unified Budget Plan exports that include both regular planned spending and variable estimates
- Savings accounts/pots with:
  - balances
  - monthly additions
  - LISA bonus handling
  - growth / interest assumptions
  - access classification for cashflow forecasting
- Savings goals linked to pots or tracked manually
- Cashflow forecast and savings projection
- Server-rendered charts with tooltips and accessible fallback data views
- Sortable financial tables
- Data reset / delete actions in Settings danger zone

## Stack

- Node.js
- Express 5
- SQLite
- Server-rendered HTML
- Plain CSS
- Vanilla client-side JavaScript for modal interactions, charts, and table sorting

## Requirements

- Node.js `22.5+`

## Getting started

### Install

```bash
npm install
```

### Run

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

### Test

```bash
npm test
```

## First use

1. Open the app from Home Assistant Ingress, or run it locally during development
2. The first Home Assistant user to open the app is linked as the first household member
3. A second Home Assistant user can be linked automatically as the second household member
4. Build the plan in `Budget Plan`
5. Optionally add actuals later

## Data and forecasting notes

- Data is stored locally in `data/budget.sqlite` by default
- Set `DATABASE_PATH=/path/to/budget.sqlite` to store the SQLite database somewhere else, for example `/data/budget.sqlite` inside the Home Assistant app
- Migrations run automatically on startup
- The app is manual-first and does not use Open Banking or bank feeds
- Home Assistant Ingress controls access in packaged installs; the app does not have a separate email/password login
- Forecast cashflow uses only accounts/pots marked as available for household cashflow
- Long-term pots such as pensions and LISAs can still be tracked in savings projections without being treated as spendable household cash

## Project structure

```text
src/
  app.js                     # app bootstrap and route registration
  assets/
    app.js                   # modal behaviour, stepped forms, chart interactions, table sorting
    styles.css               # application styling
  db/
    database.js              # SQLite connection and migration runner
    schema.sql               # base schema
    migrations/              # incremental schema changes
  http/
    cookies.js
    expressAdapter.js
    response.js
  middleware/
    session.js
  repositories/             # direct database access
    budgetItemRepository.js
    categoryBudgetRepository.js
    categoryRepository.js
    csvImportRepository.js
    dataManagementRepository.js
    householdRepository.js
    incomeEstimateRepository.js
    savingsAccountRepository.js
    savingsGoalAccountRepository.js
    savingsGoalRepository.js
    sessionRepository.js
    transactionRepository.js
    userRepository.js
  routes/                   # page and form handlers
    authRoutes.js
    budgetRoutes.js
    csvRoutes.js
    dashboardRoutes.js
    forecastRoutes.js
    savingsRoutes.js
    settingsRoutes.js
    transactionRoutes.js
  services/                 # business logic and calculations
    authService.js
    budgetService.js
    categoryBudgetService.js
    chartService.js
    csvExportService.js
    csvImportService.js
    forecastService.js
    incomeTaxService.js
    nationalInsuranceService.js
    reportService.js
    savingsAccountService.js
    savingsService.js
    spendingBudgetService.js
    studentLoanService.js
    takeHomePayService.js
    taxRulesService.js
    taxYearService.js
  tests/
    *.test.js
  utils/
    dates.js
    formValidation.js
    money.js
    validation.js
  views/                    # server-rendered HTML helpers and charts
    charts.js
    formErrors.js
    forms.js
    html.js
    setupChecklist.js
config/
data/
docs/
```

## Documentation

See [docs/implementation-brief.md](docs/implementation-brief.md) for the longer product brief and scope.
