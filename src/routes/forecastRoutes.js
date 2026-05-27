import { findHouseholdById } from '../repositories/householdRepository.js';
import { updateHouseholdSettings } from '../repositories/householdRepository.js';
import { listActiveBudgetItems } from '../repositories/budgetItemRepository.js';
import { listSavingsAccounts } from '../repositories/savingsAccountRepository.js';
import { listSavingsGoals } from '../repositories/savingsGoalRepository.js';
import { buildMonthlyForecast } from '../services/forecastService.js';
import { buildSavingsProjection } from '../services/savingsAccountService.js';
import { plannedSavingsBudgetItems } from '../services/savingsService.js';
import { currentMonth, monthLabel } from '../utils/dates.js';
import { escapeHtml, formatCurrency, formatSignedCurrency, moneyInputValue, page, csrfField } from '../views/html.js';
import { decimalInputAttrs, moneyInputAttrs } from '../views/forms.js';
import { cashflowForecastChart, savingsProjectionChart } from '../views/charts.js';
import { html } from '../http/response.js';
import { optionalMoney } from '../utils/validation.js';
import { ensureAuthenticated, redirectWithError, redirectWithSuccess } from './helpers.js';

export function registerForecastRoutes(router, db) {
  router.get('/forecast', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    const household = findHouseholdById(db, ctx.user.household_id);
    const startMonth = ctx.query.get('start_month') || currentMonth();
    const months = Math.min(36, Math.max(1, Number(ctx.query.get('months') || 12)));
    const openingBalancePence = resolveOpeningBalance(ctx.query.get('opening_balance'), household.opening_balance_pence);
    const hasUnsavedOpeningBalance = openingBalancePence !== Number(household.opening_balance_pence || 0);
    const goals = listSavingsGoals(db, household.id);
    const savingsAccounts = listSavingsAccounts(db, household.id, { activeOnly: true });
    const items = [...listActiveBudgetItems(db, household.id), ...plannedSavingsBudgetItems({ goals, accounts: savingsAccounts })];
    const forecast = buildMonthlyForecast({
      items,
      startMonth,
      months,
      openingBalancePence
    });
    const savingsProjection = buildSavingsProjection(savingsAccounts, { startMonth, months });
    const hasForecastData = forecast.some((row) => row.expectedIncomePence > 0 || row.expectedExpensesPence > 0 || row.expectedSavingsPence > 0);
    const summary = forecastSummary(forecast);

    html(
      ctx.res,
      page(ctx, {
        title: 'Forecast',
        wide: true,
        body: `<section class="page-title">
          <div>
            <h1>Forecast</h1>
            <p class="page-context">See what your current plan suggests for the months ahead.</p>
          </div>
          <form method="get" action="/forecast" class="inline-form">
            <label>Start <input type="month" name="start_month" value="${startMonth}" required></label>
            <label>Months <input name="months" value="${months}" ${decimalInputAttrs({ required: true, min: '1', max: '36', decimals: 0, step: '1' })}></label>
            <label>Opening balance <input name="opening_balance" value="${moneyInputValue(openingBalancePence)}" ${moneyInputAttrs({ allowNegative: true, min: null })}></label>
            <button>Update</button>
          </form>
        </section>
        <section class="card">
          <div class="card-heading">
            <div>
              <h2>Forecast opening balance</h2>
              <p class="hint">This is the amount available at the start of ${escapeHtml(monthLabel(startMonth))}. The forecast uses it as the starting point and carries the projected closing balance forward month by month.</p>
              <p class="hint">Forecast uses your current Budget Plan and this opening balance. Actual transactions are not used unless they are included in the plan.</p>
            </div>
            ${
              hasUnsavedOpeningBalance
                ? `<form method="post" action="/forecast/opening-balance" class="inline-form">
                    ${csrfField(ctx)}
                    <input type="hidden" name="start_month" value="${escapeHtml(startMonth)}">
                    <input type="hidden" name="months" value="${months}">
                    <input type="hidden" name="opening_balance" value="${escapeHtml(moneyInputValue(openingBalancePence))}">
                    <button>Save opening balance</button>
                  </form>`
                : '<p class="hint">Saved as the current household forecast assumption.</p>'
            }
          </div>
        </section>
        ${hasForecastData ? `${forecastSummaryCards(summary)}
        ${forecastDetailCard(forecast)}` : `<section class="card plan-empty-state">
          <h2>No forecast yet</h2>
          <p>Create income and expense items in Budget Plan to generate your forecast.</p>
        </section>`}
        ${savingsProjectionCard(savingsProjection)}`
      })
    );
  });

  router.post('/forecast/opening-balance', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      const household = findHouseholdById(db, ctx.user.household_id);
      updateHouseholdSettings(db, ctx.user.household_id, {
        name: household.name,
        openingBalancePence: optionalMoney(ctx.body.opening_balance, 'Opening balance', { allowNegative: true, minPence: null }),
        skipPlannedSavings: household.skip_planned_savings
      });
      const startMonth = ctx.body.start_month || currentMonth();
      const months = Math.min(36, Math.max(1, Number(ctx.body.months || 12)));
      redirectWithSuccess(ctx.res, `/forecast?start_month=${encodeURIComponent(startMonth)}&months=${encodeURIComponent(String(months))}`, 'Opening balance saved.');
    } catch (error) {
      redirectWithError(ctx.res, '/forecast', error);
    }
  });
}

function projectionAdditionsLabel(account) {
  const extras = [];
  if (Number(account.employerMonthlyContributionPence || 0) > 0) {
    extras.push(`Employer ${formatCurrency(account.employerMonthlyContributionPence)}/month`);
  }
  if (Number(account.totalBonusPence || 0) > 0) {
    extras.push(`LISA bonus ${formatCurrency(account.totalBonusPence)} over forecast`);
  }
  return extras.length ? extras.join(' · ') : '—';
}

function forecastDetailCard(forecast) {
  return `<section class="card chart-card">
    <div class="card-heading">
      <div>
        <h2>Forecast detail</h2>
        <p class="hint">Projected closing balance = opening balance plus planned income, minus planned expenses and planned savings.</p>
      </div>
      <div class="period-pills view-toggle-pills" data-view-toggle-group="forecast-detail">
        <button type="button" class="period-pill active" data-view-toggle="forecast-detail" data-view-value="chart" aria-pressed="true">Chart</button>
        <button type="button" class="period-pill" data-view-toggle="forecast-detail" data-view-value="table" aria-pressed="false">Table</button>
      </div>
    </div>
    <div data-view-panel="forecast-detail" data-view-value="chart" class="view-panel">
      ${cashflowForecastChart(forecast)}
    </div>
    <div data-view-panel="forecast-detail" data-view-value="table" class="view-panel" hidden>
      <table class="data-table">
        <thead><tr><th>Month</th><th>Income</th><th>Expenses</th><th>Savings</th><th>Net movement</th><th>Projected closing balance</th></tr></thead>
        <tbody>${forecast
          .map(
            (row) => `<tr>
              <td>${monthLabel(row.month)}</td>
              <td>${formatCurrency(row.expectedIncomePence)}</td>
              <td>${formatCurrency(row.expectedExpensesPence)}</td>
              <td>${formatCurrency(row.expectedSavingsPence)}</td>
              <td class="${forecastMovementClass(row.netMovementPence)}">${formatSignedCurrency(row.netMovementPence)}</td>
              <td>${formatCurrency(row.closingBalancePence)}</td>
            </tr>`
          )
          .join('')}</tbody>
      </table>
    </div>
  </section>`;
}

function savingsProjectionCard(savingsProjection) {
  return `<section class="card chart-card">
    <div class="card-heading">
      <div>
        <h2>Projected savings and investment pots</h2>
        <p class="hint">Separate from cashflow: this projects tracked pot balances using current balances, personal contributions, employer pension top-ups, optional LISA bonuses, and projected annual rates.</p>
      </div>
      <div class="period-pills view-toggle-pills" data-view-toggle-group="savings-projection">
        <button type="button" class="period-pill active" data-view-toggle="savings-projection" data-view-value="chart" aria-pressed="true">Chart</button>
        <button type="button" class="period-pill" data-view-toggle="savings-projection" data-view-value="table" aria-pressed="false">Table</button>
      </div>
    </div>
    <div data-view-panel="savings-projection" data-view-value="chart" class="view-panel">
      ${savingsProjectionChart(savingsProjection, { emptyMessage: 'Add an account or pot in Savings to start projecting balances here.' })}
    </div>
    <div data-view-panel="savings-projection" data-view-value="table" class="view-panel" hidden>
      <table class="data-table">
        <thead><tr><th>Pot</th><th>Current balance</th><th>Personal monthly</th><th>Extra additions</th><th>Projected growth / interest</th><th>Projected closing balance</th></tr></thead>
        <tbody>${savingsProjection.accounts.length ? savingsProjection.accounts.map((account) => `<tr>
          <td>${account.name}</td>
          <td>${formatCurrency(account.currentBalancePence)}</td>
          <td>${formatCurrency(account.monthlyContributionPence)}</td>
          <td>${projectionAdditionsLabel(account)}</td>
          <td>${formatCurrency(account.totalGrowthPence)}</td>
          <td>${formatCurrency(account.projectedBalancePence)}</td>
        </tr>`).join('') : '<tr><td colspan="6" class="empty">No savings accounts or pots are currently included in projections.</td></tr>'}</tbody>
      </table>
    </div>
  </section>`;
}

function forecastSummary(forecast) {
  if (!forecast.length) {
    return {
      startMonth: '',
      openingBalancePence: 0,
      averageMonthlyMovementPence: 0,
      projectedClosingBalancePence: 0,
      lowestProjectedBalancePence: 0,
      lowestProjectedBalanceMonth: '',
      negativeMovementMonths: 0
    };
  }

  const totalNetMovementPence = forecast.reduce((sum, row) => sum + row.netMovementPence, 0);
  const lowestRow = forecast.reduce((lowest, row) => (row.closingBalancePence < lowest.closingBalancePence ? row : lowest), forecast[0]);
  return {
    startMonth: forecast[0].month,
    openingBalancePence: forecast[0].openingBalancePence,
    averageMonthlyMovementPence: Math.round(totalNetMovementPence / forecast.length),
    projectedClosingBalancePence: forecast.at(-1)?.closingBalancePence || forecast[0].openingBalancePence,
    lowestProjectedBalancePence: lowestRow.closingBalancePence,
    lowestProjectedBalanceMonth: lowestRow.month,
    negativeMovementMonths: forecast.filter((row) => row.netMovementPence < 0).length
  };
}

function forecastSummaryCards(summary) {
  return `<section class="grid forecast-summary-grid">
    <div class="stat">
      <span>Opening balance</span>
      <strong>${formatCurrency(summary.openingBalancePence)}</strong>
      <small class="plan-stat-note">${summary.startMonth ? `Start of ${escapeHtml(monthLabel(summary.startMonth))}` : ''}</small>
    </div>
    <div class="stat ${summary.averageMonthlyMovementPence < 0 ? 'bad' : summary.averageMonthlyMovementPence > 0 ? 'good' : ''}">
      <span>Average monthly movement</span>
      <strong>${formatSignedCurrency(summary.averageMonthlyMovementPence)}</strong>
    </div>
    <div class="stat ${summary.projectedClosingBalancePence < 0 ? 'bad' : summary.projectedClosingBalancePence > 0 ? 'good' : ''}">
      <span>Projected closing balance</span>
      <strong>${formatCurrency(summary.projectedClosingBalancePence)}</strong>
    </div>
    <div class="stat ${summary.lowestProjectedBalancePence < 0 ? 'bad' : ''}">
      <span>Lowest projected balance</span>
      <strong>${formatCurrency(summary.lowestProjectedBalancePence)}</strong>
      <small class="plan-stat-note">${summary.lowestProjectedBalanceMonth ? `Tightest month: ${escapeHtml(monthLabel(summary.lowestProjectedBalanceMonth))}` : ''}</small>
    </div>
    <div class="stat ${summary.negativeMovementMonths > 0 ? 'bad' : 'good'}">
      <span>Months with negative movement</span>
      <strong>${summary.negativeMovementMonths}</strong>
    </div>
  </section>`;
}

function forecastMovementClass(netMovementPence) {
  if (netMovementPence < 0) return 'forecast-movement negative';
  if (netMovementPence > 0) return 'forecast-movement positive';
  return 'forecast-movement';
}

function resolveOpeningBalance(queryValue, savedOpeningBalancePence) {
  if (queryValue === null || queryValue === undefined || String(queryValue).trim() === '') {
    return Number(savedOpeningBalancePence || 0);
  }

  try {
    return optionalMoney(queryValue, 'Opening balance', { allowNegative: true, minPence: null });
  } catch {
    return Number(savedOpeningBalancePence || 0);
  }
}
