import { addMonths, taxYearForDate } from '../utils/dates.js';

const LISA_ANNUAL_ALLOWANCE_PENCE = 400_000;
const LISA_BONUS_RATE = 0.25;

const ACCOUNT_TYPE_META = {
  current_account: { label: 'Current account', group: 'cash', defaultRateType: 'interest' },
  easy_access_savings: { label: 'Easy-access savings', group: 'cash', defaultRateType: 'interest' },
  fixed_savings: { label: 'Fixed savings', group: 'cash', defaultRateType: 'interest' },
  cash_isa: { label: 'Cash ISA', group: 'isa', defaultRateType: 'interest' },
  stocks_and_shares_isa: { label: 'Stocks and Shares ISA', group: 'investments', defaultRateType: 'growth' },
  lifetime_isa: { label: 'Lifetime ISA', group: 'isa', defaultRateType: 'growth' },
  pension: { label: 'Pension', group: 'pension', defaultRateType: 'growth' },
  other: { label: 'Other pot', group: 'other', defaultRateType: 'interest' }
};

export function savingsAccountTypeOptions() {
  return Object.entries(ACCOUNT_TYPE_META).map(([value, meta]) => ({
    value,
    label: meta.label,
    defaultRateType: meta.defaultRateType
  }));
}

export function savingsAccountTypeLabel(accountType) {
  return ACCOUNT_TYPE_META[accountType]?.label || accountType;
}

export function savingsRateTypeLabel(rateType) {
  return rateType === 'growth' ? 'Projected growth' : 'Interest rate';
}

export function savingsAccountSummary(accounts) {
  const summary = {
    totalBalancePence: 0,
    monthlyContributionPence: 0,
    employerContributionPence: 0,
    byGroup: {
      cash: 0,
      isa: 0,
      investments: 0,
      pension: 0,
      other: 0
    },
    activeCount: 0
  };

  for (const account of accounts) {
    const balance = Number(account.current_balance_pence || 0);
    const contribution = Number(account.monthly_contribution_pence || 0);
    const employerContribution = Number(account.employer_monthly_contribution_pence || 0);
    const group = savingsAccountGroup(account.account_type);
    summary.totalBalancePence += balance;
    summary.byGroup[group] += balance;
    if (Number(account.is_active) === 1) {
      summary.monthlyContributionPence += contribution;
      summary.employerContributionPence += account.account_type === 'pension' ? employerContribution : 0;
      summary.activeCount += 1;
    }
  }

  return summary;
}

export function buildSavingsProjection(accounts, { startMonth, months = 12 } = {}) {
  const activeAccounts = accounts.filter((account) => Number(account.is_active) === 1);
  if (!activeAccounts.length) {
    return { months: [], accounts: [] };
  }

  const accountStates = activeAccounts.map((account) => ({
    accountId: account.id,
    name: account.name,
    ownerType: account.owner_type,
    accountType: account.account_type,
    projectedRateType: account.projected_rate_type,
    currentBalancePence: Number(account.current_balance_pence || 0),
    monthlyContributionPence: Number(account.monthly_contribution_pence || 0),
    employerMonthlyContributionPence: Number(account.employer_monthly_contribution_pence || 0),
    projectedAnnualRate: Number(account.projected_annual_rate || 0),
    monthlyRate: annualRateToMonthlyRate(Number(account.projected_annual_rate || 0)),
    includeLisaBonus: Number(account.include_lisa_bonus) === 1,
    openingBalancePence: Number(account.current_balance_pence || 0),
    totalContributionPence: 0,
    totalPersonalContributionPence: 0,
    totalEmployerContributionPence: 0,
    totalBonusPence: 0,
    totalGrowthPence: 0
  }));

  const monthsOut = [];
  let totalOpeningBalancePence = accountStates.reduce((sum, account) => sum + account.openingBalancePence, 0);

  for (let index = 0; index < months; index += 1) {
    const month = addMonths(startMonth, index);
    let totalContributionPence = 0;
    let totalPersonalContributionPence = 0;
    let totalEmployerContributionPence = 0;
    let totalBonusPence = 0;
    let totalGrowthPence = 0;

    const accountRows = accountStates.map((state) => {
      const openingBalancePence = state.openingBalancePence;
      const personalContributionPence = state.monthlyContributionPence;
      const employerContributionPence = state.accountType === 'pension' ? state.employerMonthlyContributionPence : 0;
      const bonusPence = lisaBonusForMonth(state, month);
      const contributionPence = personalContributionPence + employerContributionPence + bonusPence;
      const growthPence = Math.round((openingBalancePence + contributionPence) * state.monthlyRate);
      const closingBalancePence = openingBalancePence + contributionPence + growthPence;

      state.openingBalancePence = closingBalancePence;
      state.totalContributionPence += contributionPence;
      state.totalPersonalContributionPence += personalContributionPence;
      state.totalEmployerContributionPence += employerContributionPence;
      state.totalBonusPence += bonusPence;
      state.totalGrowthPence += growthPence;

      totalContributionPence += contributionPence;
      totalPersonalContributionPence += personalContributionPence;
      totalEmployerContributionPence += employerContributionPence;
      totalBonusPence += bonusPence;
      totalGrowthPence += growthPence;

      return {
        accountId: state.accountId,
        name: state.name,
        ownerType: state.ownerType,
        accountType: state.accountType,
        projectedRateType: state.projectedRateType,
        includeLisaBonus: state.includeLisaBonus,
        openingBalancePence,
        personalContributionPence,
        employerContributionPence,
        bonusPence,
        contributionPence,
        growthPence,
        closingBalancePence
      };
    });

    const totalClosingBalancePence = totalOpeningBalancePence + totalContributionPence + totalGrowthPence;
    monthsOut.push({
      month,
      openingBalancePence: totalOpeningBalancePence,
      contributionPence: totalContributionPence,
      personalContributionPence: totalPersonalContributionPence,
      employerContributionPence: totalEmployerContributionPence,
      bonusPence: totalBonusPence,
      growthPence: totalGrowthPence,
      closingBalancePence: totalClosingBalancePence,
      accounts: accountRows
    });
    totalOpeningBalancePence = totalClosingBalancePence;
  }

  return {
    months: monthsOut,
    accounts: accountStates.map((state) => ({
      accountId: state.accountId,
      name: state.name,
      ownerType: state.ownerType,
      accountType: state.accountType,
      projectedRateType: state.projectedRateType,
      includeLisaBonus: state.includeLisaBonus,
      currentBalancePence: state.currentBalancePence,
      monthlyContributionPence: state.monthlyContributionPence,
      employerMonthlyContributionPence: state.employerMonthlyContributionPence,
      projectedAnnualRate: state.projectedAnnualRate,
      projectedBalancePence: state.openingBalancePence,
      totalContributionPence: state.totalContributionPence,
      totalPersonalContributionPence: state.totalPersonalContributionPence,
      totalEmployerContributionPence: state.totalEmployerContributionPence,
      totalBonusPence: state.totalBonusPence,
      totalGrowthPence: state.totalGrowthPence
    }))
  };
}

export function savingsAccountsAsBudgetItems(accounts) {
  return accounts
    .filter((account) => Number(account.is_active) === 1 && Number(account.monthly_contribution_pence || 0) > 0)
    .map((account) => ({
      id: `savings-account-${account.id}`,
      name: account.name,
      item_type: 'savings',
      category_name: 'Savings',
      owner_type: account.owner_type,
      amount_pence: Number(account.monthly_contribution_pence || 0),
      frequency: 'monthly',
      monthly_equivalent_pence: Number(account.monthly_contribution_pence || 0),
      start_date: '1900-01-01',
      end_date: null,
      is_active: 1,
      split_type: 'equal',
      person_a_percentage: 50,
      person_b_percentage: 50
    }));
}

export function savingsAccountGroup(accountType) {
  return ACCOUNT_TYPE_META[accountType]?.group || 'other';
}

function annualRateToMonthlyRate(annualRatePercentage) {
  if (!annualRatePercentage) return 0;
  return Math.pow(1 + annualRatePercentage / 100, 1 / 12) - 1;
}

function lisaBonusForMonth(state, month) {
  if (state.accountType !== 'lifetime_isa' || !state.includeLisaBonus || state.monthlyContributionPence <= 0) {
    return 0;
  }

  if (!state.lisaAllowanceUsedByTaxYear) {
    state.lisaAllowanceUsedByTaxYear = new Map();
  }

  const taxYear = taxYearForDate(`${month}-15`);
  const usedThisTaxYear = Number(state.lisaAllowanceUsedByTaxYear.get(taxYear) || 0);
  const eligibleContributionPence = Math.min(
    state.monthlyContributionPence,
    Math.max(0, LISA_ANNUAL_ALLOWANCE_PENCE - usedThisTaxYear)
  );

  state.lisaAllowanceUsedByTaxYear.set(taxYear, usedThisTaxYear + eligibleContributionPence);
  return Math.round(eligibleContributionPence * LISA_BONUS_RATE);
}
