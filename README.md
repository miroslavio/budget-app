# UK Household Budget App

Simple manual-first UK household budgeting app for up to two people.

## Features

- Two-user household setup
- Manual income and expense tracking
- Planned vs actual budgeting
- UK take-home pay estimate from gross salary
- Student loan and postgraduate loan support
- Savings goals
- Monthly forecasting
- CSV import and export
- UK terminology and UK tax-year-aware reporting

## Stack

- Node.js
- Express
- SQLite
- Server-rendered HTML
- Plain CSS

## Getting Started

### Requirements

- Node.js `22.5+`

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

## First Use

1. Open `/register`
2. Create the first account and household
3. Use the invite code in Settings if you want to add the second person

## Notes

- Data is stored locally in `data/budget.sqlite`
- The app is manual-first and does not use bank feeds or Open Banking
- Default categories are built in, and custom expense categories can be added in Settings

## Project Structure

```text
src/
  app.js
  assets/
  db/
  http/
  middleware/
  repositories/
  routes/
  services/
  tests/
  utils/
  views/
config/
data/
docs/
```

## Documentation

See [docs/implementation-brief.md](docs/implementation-brief.md) for the longer implementation brief and product scope.
