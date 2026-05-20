import { listActiveBudgetItems } from '../repositories/budgetItemRepository.js';
import { listTransactions } from '../repositories/transactionRepository.js';
import { listSavingsGoals } from '../repositories/savingsGoalRepository.js';
import { listIncomeEstimates } from '../repositories/incomeEstimateRepository.js';
import { listHouseholdMembers } from '../repositories/userRepository.js';
import { buildPeriodReport, categoryBreakdown, reportingRange } from '../services/reportService.js';
import { savingsGoalsAsBudgetItems } from '../services/savingsService.js';
import { currentMonth } from '../utils/dates.js';
import { renderReportsPage } from '../views/reportViews.js';
import { html } from '../http/response.js';
import { ensureAuthenticated } from './helpers.js';

export function registerReportRoutes(router, db) {
  router.get('/reports', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    const month = ctx.query.get('month') || currentMonth();
    const calendarYear = ctx.query.get('calendar_year') || '';
    const taxYear = ctx.query.get('tax_year') || '';
    const range = reportingRange({ month: calendarYear || taxYear ? '' : month, calendarYear, taxYear, defaultMonth: month });
    const items = [...listActiveBudgetItems(db, ctx.user.household_id), ...savingsGoalsAsBudgetItems(listSavingsGoals(db, ctx.user.household_id))];
    const transactions = listTransactions(db, ctx.user.household_id, { startDate: range.start, endDate: range.end });
    const report = buildPeriodReport({ items, transactions, range });
    const { planned, actual, variance } = report;
    const breakdown = categoryBreakdown(planned, actual);
    const goals = listSavingsGoals(db, ctx.user.household_id);
    const estimates = listIncomeEstimates(db, ctx.user.household_id);
    const members = listHouseholdMembers(db, ctx.user.household_id);

    html(ctx.res, renderReportsPage(ctx, { month, calendarYear, taxYear, range, planned, actual, variance, breakdown, goals, estimates, members }));
  });
}
