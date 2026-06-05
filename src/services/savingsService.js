import { currentMonth, todayIso } from '../utils/dates.js';
import { isPensionAccountType, savingsAccountsAsBudgetItems } from './savingsAccountService.js';
import { buildSavingsProjection } from './savingsAccountService.js';

export function savingsGoalProgress(goal, today = todayIso()) {
  const target = Number(goal.target_amount_pence || 0);
  const current = Number(goal.current_saved_amount_pence || 0);
  const monthlyContribution = Number(goal.monthly_contribution_pence || 0);
  const remainingPence = Math.max(0, target - current);
  const progressPercentage = target <= 0 ? 0 : Math.min(100, Math.round((current / target) * 100));
  const monthsRemaining = monthlyContribution > 0 ? Math.ceil(remainingPence / monthlyContribution) : null;
  const estimatedCompletionDate = monthsRemaining === null ? null : addMonthsToDate(today, monthsRemaining);
  const onTrack =
    !goal.target_date || !estimatedCompletionDate ? null : new Date(`${estimatedCompletionDate}T00:00:00Z`) <= new Date(`${goal.target_date}T00:00:00Z`);

  return {
    progressPercentage,
    remainingPence,
    monthsRemaining,
    estimatedCompletionDate,
    onTrack
  };
}

export function savingsGoalMetrics(goal, { linkedAccounts = [], today = todayIso(), startMonth = currentMonth() } = {}) {
  const trackingMode = resolveGoalTrackingMode(goal, linkedAccounts);
  const targetAmountPence = Number(goal.target_amount_pence || 0);
  const targetDate = goal.target_date || null;
  const linkedMode = trackingMode === 'linked_pots';
  const activeLinkedAccounts = linkedAccounts.filter((account) => Number(account.is_active) === 1);
  const balanceLinkedAccounts = linkedAccounts.filter((account) => account.account_type !== 'defined_benefit_pension');
  const activeContributionAccounts = activeLinkedAccounts.filter((account) => account.account_type !== 'defined_benefit_pension');
  const currentSavedPence = linkedMode
    ? balanceLinkedAccounts.reduce((sum, account) => sum + Number(account.current_balance_pence || 0), 0)
    : Number(goal.current_saved_amount_pence || 0);
  const monthlyPersonalContributionPence = linkedMode
    ? activeContributionAccounts.reduce((sum, account) => sum + Number(account.monthly_contribution_pence || 0), 0)
    : Number(goal.monthly_contribution_pence || 0);
  const monthlyEmployerTopUpsPence = linkedMode
    ? activeContributionAccounts.reduce((sum, account) => sum + monthlyAccountTopUpsPence(account), 0)
    : 0;
  const remainingPence = Math.max(0, targetAmountPence - currentSavedPence);
  const progressPercentage = targetAmountPence <= 0 ? 0 : Math.min(100, Math.round((currentSavedPence / targetAmountPence) * 100));
  let projectedValueAtTargetDatePence = null;
  let projectedShortfallSurplusPence = null;
  let estimatedCompletionDate = null;
  let statusLabel = 'No target date';
  let statusKey = 'missing';

  if (linkedMode) {
    if (!linkedAccounts.length) {
      statusLabel = 'No linked pots';
      statusKey = 'missing';
    } else if (!targetAmountPence) {
      statusLabel = 'Missing target amount';
      statusKey = 'missing';
    } else if (!targetDate) {
      statusLabel = 'Missing target date';
      statusKey = 'missing';
    } else {
      projectedValueAtTargetDatePence = linkedProjectionAtTargetDate(linkedAccounts, startMonth, targetDate);
      projectedShortfallSurplusPence = projectedValueAtTargetDatePence - targetAmountPence;
      if (projectedShortfallSurplusPence > 0) {
        statusLabel = 'Ahead of target';
        statusKey = 'good';
      } else if (projectedShortfallSurplusPence === 0) {
        statusLabel = 'On track';
        statusKey = 'good';
      } else {
        statusLabel = 'Behind target';
        statusKey = 'warn';
      }
    }
  } else {
    const monthlyTotalPence = monthlyPersonalContributionPence;
    const monthsRemaining = monthlyTotalPence > 0 ? Math.ceil(remainingPence / monthlyTotalPence) : null;
    estimatedCompletionDate = monthsRemaining === null ? null : addMonthsToDate(today, monthsRemaining);
    if (!targetAmountPence) {
      statusLabel = 'Missing target amount';
      statusKey = 'missing';
    } else if (!targetDate) {
      statusLabel = 'Missing target date';
      statusKey = 'missing';
    } else {
      const projectionMonths = monthsUntilTargetMonth(startMonth, targetDate);
      projectedValueAtTargetDatePence = currentSavedPence + monthlyTotalPence * projectionMonths;
      projectedShortfallSurplusPence = projectedValueAtTargetDatePence - targetAmountPence;
      if (projectedShortfallSurplusPence > 0) {
        statusLabel = 'Ahead of target';
        statusKey = 'good';
      } else if (projectedShortfallSurplusPence === 0) {
        statusLabel = 'On track';
        statusKey = 'good';
      } else {
        statusLabel = 'Behind target';
        statusKey = 'warn';
      }
    }
  }

  return {
    trackingMode,
    currentSavedPence,
    monthlyPersonalContributionPence,
    monthlyEmployerTopUpsPence,
    monthlyAdditionsPence: monthlyPersonalContributionPence + monthlyEmployerTopUpsPence,
    projectedValueAtTargetDatePence,
    projectedShortfallSurplusPence,
    remainingPence,
    progressPercentage,
    estimatedCompletionDate,
    statusLabel,
    statusKey
  };
}

export function savingsGoalsAsBudgetItems(goals) {
  return goals
    .filter((goal) => resolveGoalTrackingMode(goal) === 'manual' && goal.status === 'active' && Number(goal.monthly_contribution_pence || 0) > 0)
    .map((goal) => ({
      id: `goal-${goal.id}`,
      name: goal.name,
      item_type: 'savings',
      category_name: 'Savings',
      owner_type: goal.owner_type,
      amount_pence: goal.monthly_contribution_pence,
      frequency: 'monthly',
      monthly_equivalent_pence: goal.monthly_contribution_pence,
      start_date: '1900-01-01',
      end_date: goal.target_date,
      is_active: 1,
      split_type: 'equal',
      person_a_percentage: 50,
      person_b_percentage: 50
    }));
}

export function plannedSavingsBudgetItems({ goals = [], accounts = [] } = {}) {
  const accountItems = savingsAccountsAsBudgetItems(accounts);
  return [...accountItems, ...savingsGoalsAsBudgetItems(goals)];
}

function addMonthsToDate(dateIso, months) {
  const [year, month, day] = dateIso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  return date.toISOString().slice(0, 10);
}

function resolveGoalTrackingMode(goal, linkedAccounts = goal.linkedAccounts || []) {
  if (goal.tracking_mode === 'linked_pots' || goal.trackingMode === 'linked_pots') return 'linked_pots';
  if (goal.tracking_mode === 'manual' || goal.trackingMode === 'manual') return 'manual';
  return linkedAccounts.length ? 'linked_pots' : 'manual';
}

function monthlyAccountTopUpsPence(account) {
  const employerContributionPence = isPensionAccountType(account.account_type) ? Number(account.employer_monthly_contribution_pence || 0) : 0;
  const lisaBonusPence = account.account_type === 'lifetime_isa' && Number(account.include_lisa_bonus) === 1
    ? Math.round(Math.min(Number(account.monthly_contribution_pence || 0) * 12, 400_000) * 0.25 / 12)
    : 0;
  return employerContributionPence + lisaBonusPence;
}

function linkedProjectionAtTargetDate(accounts, startMonth, targetDate) {
  const projectableAccounts = accounts.filter((account) => account.account_type !== 'defined_benefit_pension');
  const projectionMonths = monthsUntilTargetMonth(startMonth, targetDate);
  if (projectionMonths <= 0) {
    return projectableAccounts.reduce((sum, account) => sum + Number(account.current_balance_pence || 0), 0);
  }

  const projectionAccounts = projectableAccounts.map((account) => {
    if (Number(account.is_active) === 1) return account;
    return {
      ...account,
      is_active: 1,
      monthly_contribution_pence: 0,
      employer_monthly_contribution_pence: 0,
      projected_annual_rate: 0,
      include_lisa_bonus: 0
    };
  });
  const projection = buildSavingsProjection(projectionAccounts, { startMonth, months: projectionMonths });
  return projection.months.at(-1)?.closingBalancePence ?? projectableAccounts.reduce((sum, account) => sum + Number(account.current_balance_pence || 0), 0);
}

function monthsUntilTargetMonth(startMonth, targetDate) {
  if (!targetDate) return 0;
  const [startYear, startMonthNumber] = String(startMonth).split('-').map(Number);
  const [targetYear, targetMonthNumber] = String(targetDate).slice(0, 7).split('-').map(Number);
  return Math.max(0, (targetYear - startYear) * 12 + (targetMonthNumber - startMonthNumber) + 1);
}
