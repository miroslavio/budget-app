import { findHouseholdById } from '../repositories/householdRepository.js';
import { updateHouseholdSettings } from '../repositories/householdRepository.js';
import { listActiveBudgetItems } from '../repositories/budgetItemRepository.js';
import { listSavingsAccounts } from '../repositories/savingsAccountRepository.js';
import { listSavingsGoals } from '../repositories/savingsGoalRepository.js';
import { buildMonthlyForecast, deriveForecastStartingBalance, spendableHouseholdBalancePence } from '../services/forecastService.js';
import { buildSavingsProjection } from '../services/savingsAccountService.js';
import { plannedSavingsBudgetItems } from '../services/savingsService.js';
import { currentMonth, monthLabel } from '../utils/dates.js';
import { escapeHtml, formatCurrency, formatSignedCurrency, moneyInputValue, page, csrfField } from '../views/html.js';
import { decimalInputAttrs, moneyInputAttrs } from '../views/forms.js';
import { cashflowForecastChart, savingsContributionChart, savingsProjectionChart } from '../views/charts.js';
import { html } from '../http/response.js';
import { optionalMoney } from '../utils/validation.js';
import { ensureAuthenticated, redirectWithError, redirectWithSuccess } from './helpers.js';

export function registerForecastRoutes(router, db) {
  router.get('/forecast', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    const household = findHouseholdById(db, ctx.user.household_id);
    const startMonth = ctx.query.get('start_month') || currentMonth();
    const months = Math.min(36, Math.max(1, Number(ctx.query.get('months') || 12)));
    const goals = listSavingsGoals(db, household.id);
    const savingsAccounts = listSavingsAccounts(db, household.id, { activeOnly: true });
    const items = [...listActiveBudgetItems(db, household.id), ...plannedSavingsBudgetItems({ goals, accounts: savingsAccounts })];
    const forecastAdjustmentPence = resolveForecastAdjustment(ctx.query.get('adjustment'), household.forecast_adjustment_pence);
    const spendableBalancePence = spendableHouseholdBalancePence(savingsAccounts);
    const startingBalancePence = deriveForecastStartingBalance({
      accounts: savingsAccounts,
      adjustmentPence: forecastAdjustmentPence
    });
    const savingsProjection = buildSavingsProjection(savingsAccounts, { startMonth, months });
    const forecast = buildMonthlyForecast({
      items,
      startMonth,
      months,
      openingBalancePence: startingBalancePence
    });
    const hasForecastData = forecast.some((row) => row.expectedIncomePence > 0 || row.expectedExpensesPence > 0 || row.expectedSavingsPence > 0);
    const hasSavingsProjectionData = savingsProjection.months.length > 0;
    const summary = forecastSummary(forecast, { forecastAdjustmentPence });

    html(
      ctx.res,
      page(ctx, {
        title: 'Forecast',
        wide: true,
        body: `<section class="page-title">
          <div>
            <h1>Forecast</h1>
          </div>
          <form method="get" action="/forecast" class="inline-form">
            <label>Start <input type="month" name="start_month" value="${startMonth}" required></label>
            <label>Months <input name="months" value="${months}" ${decimalInputAttrs({ required: true, min: '1', max: '36', decimals: 0, step: '1' })}></label>
            <button>Update</button>
          </form>
        </section>
        <section class="card">
          <div class="grid three compact">
            <div class="stat">
              <span>Spendable accounts total</span>
              <strong>${formatCurrency(spendableBalancePence)}</strong>
            </div>
            <div class="stat">
              <span>Forecast adjustment</span>
              <strong>${formatSignedCurrency(forecastAdjustmentPence)}</strong>
            </div>
            <div class="stat">
              <span>Starting point used</span>
              <strong>${formatCurrency(startingBalancePence)}</strong>
            </div>
          </div>
          <form method="post" action="/forecast/adjustment" class="inline-form top-gap">
            ${csrfField(ctx)}
            <input type="hidden" name="start_month" value="${escapeHtml(startMonth)}">
            <input type="hidden" name="months" value="${months}">
            <label>Forecast adjustment <input name="forecast_adjustment" value="${moneyInputValue(forecastAdjustmentPence)}" ${moneyInputAttrs({ allowNegative: true, min: null })}></label>
            <button>Save adjustment</button>
          </form>
        </section>
        ${hasForecastData ? `${forecastSummaryCards(summary)}
        ${cashflowForecastCard(forecast)}` : `<section class="card plan-empty-state">
          <h2>No cashflow forecast yet</h2>
          <p>Create income and spending items in Budget Plan to generate your household cashflow forecast.</p>
        </section>`}
        ${hasSavingsProjectionData ? savingsProjectionCard(savingsProjection, months) : `<section class="card plan-empty-state">
          <h2>No savings projection yet</h2>
          <p>Add active accounts or pots to project how balances may build over time.</p>
        </section>`}`
      })
    );
  });

  router.post('/forecast/adjustment', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      const household = findHouseholdById(db, ctx.user.household_id);
      updateHouseholdSettings(db, ctx.user.household_id, {
        name: household.name,
        openingBalancePence: household.opening_balance_pence,
        forecastAdjustmentPence: optionalMoney(ctx.body.forecast_adjustment, 'Forecast adjustment', { allowNegative: true, minPence: null }),
        skipPlannedSavings: household.skip_planned_savings
      });
      const startMonth = ctx.body.start_month || currentMonth();
      const months = Math.min(36, Math.max(1, Number(ctx.body.months || 12)));
      redirectWithSuccess(ctx.res, `/forecast?start_month=${encodeURIComponent(startMonth)}&months=${encodeURIComponent(String(months))}`, 'Forecast adjustment saved.');
    } catch (error) {
      redirectWithError(ctx.res, '/forecast', error);
    }
  });
}

function cashflowForecastCard(forecast) {
  return `<section class="card chart-card">
    <div class="card-heading">
      <div>
        <h2>Cashflow forecast</h2>
        <p class="hint">Shows whether your spendable household cash is expected to hold up over the selected period.</p>
      </div>
      <div class="period-pills view-toggle-pills" data-view-toggle-group="forecast-cashflow-detail">
        <button type="button" class="period-pill active" data-view-toggle="forecast-cashflow-detail" data-view-value="chart" aria-pressed="true">Chart</button>
        <button type="button" class="period-pill" data-view-toggle="forecast-cashflow-detail" data-view-value="table" aria-pressed="false">Table</button>
      </div>
    </div>
    <div data-view-panel="forecast-cashflow-detail" data-view-value="chart" class="view-panel">
      ${cashflowForecastChart(forecast)}
    </div>
    <div data-view-panel="forecast-cashflow-detail" data-view-value="table" class="view-panel" hidden>
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

function savingsProjectionCard(projection, months) {
  if (!projection.months.length) {
    return `<section class="card plan-empty-state">
      <h2>Savings projection</h2>
      <p>Add active accounts or pots to project how savings may build over the selected period.</p>
    </section>`;
  }

  const projectionSummary = savingsProjectionSummary(projection);
  return `<section class="card chart-card">
    <div class="card-heading">
      <div>
        <h2>Savings projection</h2>
        <p class="hint">Long-term pots and investments are projected separately from household cashflow.</p>
      </div>
      <div class="period-pills view-toggle-pills" data-view-toggle-group="forecast-savings-detail">
        <button type="button" class="period-pill active" data-view-toggle="forecast-savings-detail" data-view-value="balances" aria-pressed="true">Projected balances</button>
        <button type="button" class="period-pill" data-view-toggle="forecast-savings-detail" data-view-value="contributions" aria-pressed="false">Monthly contributions</button>
      </div>
    </div>
    <section class="grid four compact">
      <div class="stat">
        <span>Total saved now</span>
        <strong>${formatCurrency(projectionSummary.startingBalancePence)}</strong>
      </div>
      <div class="stat">
        <span>Monthly additions</span>
        <strong>${formatCurrency(projectionSummary.firstMonthContributionPence)}</strong>
      </div>
      <div class="stat">
        <span>Projected in ${months} months</span>
        <strong>${formatCurrency(projectionSummary.projectedTotalPence)}</strong>
      </div>
      <div class="stat">
        <span>Projected growth / interest</span>
        <strong>${formatCurrency(projectionSummary.totalGrowthPence)}</strong>
      </div>
    </section>
    <div data-view-panel="forecast-savings-detail" data-view-value="balances" class="view-panel">
      ${savingsProjectionChart(projection, { emptyMessage: 'No projected savings data yet.' })}
    </div>
    <div data-view-panel="forecast-savings-detail" data-view-value="contributions" class="view-panel" hidden>
      ${savingsContributionChart(projection, { emptyMessage: 'No monthly contributions to show yet.' })}
    </div>
  </section>`;
}

function forecastSummary(forecast, { forecastAdjustmentPence = 0 } = {}) {
  if (!forecast.length) {
    return {
      startMonth: '',
      openingBalancePence: 0,
      forecastAdjustmentPence,
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
    forecastAdjustmentPence,
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
      <span>Spendable starting balance</span>
      <strong>${formatCurrency(summary.openingBalancePence)}</strong>
      <small class="plan-stat-note">${summary.startMonth ? `Start of ${escapeHtml(monthLabel(summary.startMonth))}` : ''}${summary.forecastAdjustmentPence ? ` · Includes ${formatSignedCurrency(summary.forecastAdjustmentPence)} adjustment` : ''}</small>
    </div>
    <div class="stat ${summary.averageMonthlyMovementPence < 0 ? 'bad' : summary.averageMonthlyMovementPence > 0 ? 'good' : ''}">
      <span>Average monthly movement</span>
      <strong>${formatSignedCurrency(summary.averageMonthlyMovementPence)}</strong>
    </div>
    <div class="stat ${summary.projectedClosingBalancePence < 0 ? 'bad' : summary.projectedClosingBalancePence > 0 ? 'good' : ''}">
      <span>Projected balance at end of forecast</span>
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

function savingsProjectionSummary(projection) {
  const firstRow = projection.months[0];
  return projection.accounts.reduce(
    (summary, account) => {
      summary.totalGrowthPence += Number(account.totalGrowthPence || 0);
      return summary;
    },
    {
      startingBalancePence: Number(firstRow?.openingBalancePence || 0),
      firstMonthContributionPence: Number(firstRow?.contributionPence || 0),
      projectedTotalPence: Number(projection.months.at(-1)?.closingBalancePence || 0),
      totalGrowthPence: 0
    }
  );
}

function forecastMovementClass(netMovementPence) {
  if (netMovementPence < 0) return 'forecast-movement negative';
  if (netMovementPence > 0) return 'forecast-movement positive';
  return 'forecast-movement';
}

function resolveForecastAdjustment(queryValue, savedForecastAdjustmentPence) {
  if (queryValue === null || queryValue === undefined || String(queryValue).trim() === '') {
    return Number(savedForecastAdjustmentPence || 0);
  }

  try {
    return optionalMoney(queryValue, 'Forecast adjustment', { allowNegative: true, minPence: null });
  } catch {
    return Number(savedForecastAdjustmentPence || 0);
  }
}
