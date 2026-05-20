import { todayIso } from '../utils/dates.js';

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

export function savingsGoalsAsBudgetItems(goals) {
  return goals
    .filter((goal) => goal.status === 'active' && Number(goal.monthly_contribution_pence || 0) > 0)
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

function addMonthsToDate(dateIso, months) {
  const [year, month, day] = dateIso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  return date.toISOString().slice(0, 10);
}
