import { calculateIncomeTax } from './incomeTaxService.js';
import { calculateEmployeeNationalInsurance } from './nationalInsuranceService.js';
import { calculateStudentLoanRepayments } from './studentLoanService.js';
import { loadTaxRules } from './taxRulesService.js';
import { roundPence } from '../utils/money.js';

export function estimateTakeHomePay(input) {
  const rules = loadTaxRules(input.taxYear);
  const grossAnnualSalaryPence = Math.max(0, Number(input.grossAnnualSalaryPence || 0));
  const contributionMethod = input.pensionContributionMethod || methodFromLegacyTreatment(input.pensionContributionTaxTreatment);
  const manualTaxTreatment = input.pensionContributionTaxTreatment || null;
  const pensionContributionPence = calculatePensionContribution(grossAnnualSalaryPence, input);
  const otherPreTaxDeductionsPence = Math.max(0, Number(input.otherPreTaxDeductionsPence || 0));
  const otherPostTaxDeductionsPence = Math.max(0, Number(input.otherPostTaxDeductionsPence || 0));
  const pensionReducesIncomeTax = manualTaxTreatment
    ? manualTaxTreatment === 'pre_tax'
    : ['salary_sacrifice', 'net_pay'].includes(contributionMethod);
  const pensionReducesNationalInsurance = manualTaxTreatment
    ? contributionMethod === 'salary_sacrifice' && manualTaxTreatment === 'pre_tax'
    : contributionMethod === 'salary_sacrifice';

  const taxableReductionPence = (pensionReducesIncomeTax ? pensionContributionPence : 0) + otherPreTaxDeductionsPence;
  const niReductionPence = (pensionReducesNationalInsurance ? pensionContributionPence : 0) + otherPreTaxDeductionsPence;

  const taxablePayPence = Math.max(0, grossAnnualSalaryPence - taxableReductionPence);
  const niablePayPence = Math.max(0, grossAnnualSalaryPence - niReductionPence);
  const loanablePayPence = Math.max(0, grossAnnualSalaryPence - taxableReductionPence);

  const tax = calculateIncomeTax(taxablePayPence, rules.incomeTax);
  const ni = calculateEmployeeNationalInsurance(niablePayPence, rules.nationalInsurance);
  const loans = calculateStudentLoanRepayments(
    {
      annualLoanablePayPence: loanablePayPence,
      studentLoanPlans: input.studentLoanPlans || [],
      hasPostgraduateLoan: Boolean(input.hasPostgraduateLoan)
    },
    rules.studentLoans
  );

  const estimatedNetAnnualIncomePence = roundPence(
    grossAnnualSalaryPence -
      tax.incomeTaxPence -
      ni.nationalInsurancePence -
      loans.studentLoanRepaymentPence -
      loans.postgraduateLoanRepaymentPence -
      pensionContributionPence -
      otherPreTaxDeductionsPence -
      otherPostTaxDeductionsPence
  );

  return {
    taxYear: input.taxYear,
    grossAnnualSalaryPence,
    pensionSchemeType: input.pensionSchemeType || 'defined_contribution',
    pensionContributionMethod: contributionMethod,
    pensionContributionType: input.pensionContributionType || 'none',
    pensionContributionValue: Number(input.pensionContributionValue || 0),
    pensionContributionTaxTreatment: manualTaxTreatment || derivedTaxTreatment(contributionMethod),
    pensionContributionPence,
    otherPreTaxDeductionsPence,
    otherPostTaxDeductionsPence,
    studentLoanPlans: input.studentLoanPlans || [],
    hasPostgraduateLoan: Boolean(input.hasPostgraduateLoan),
    estimatedIncomeTaxPence: tax.incomeTaxPence,
    estimatedNationalInsurancePence: ni.nationalInsurancePence,
    estimatedStudentLoanRepaymentPence: loans.studentLoanRepaymentPence,
    estimatedPostgraduateLoanRepaymentPence: loans.postgraduateLoanRepaymentPence,
    estimatedOtherDeductionsPence: otherPreTaxDeductionsPence + otherPostTaxDeductionsPence,
    estimatedNetAnnualIncomePence,
    estimatedNetMonthlyIncomePence: roundPence(estimatedNetAnnualIncomePence / 12),
    incomeTaxBreakdown: tax.breakdown,
    nationalInsuranceBreakdown: ni.breakdown,
    selectedUndergraduatePlans: loans.selectedUndergraduatePlans,
    estimateNotice: rules.estimateNotice,
    sources: rules.sources
  };
}

function calculatePensionContribution(grossAnnualSalaryPence, input) {
  const type = input.pensionContributionType || 'none';
  const value = Number(input.pensionContributionValue || 0);
  if (type === 'none' || value <= 0) return 0;
  if (type === 'fixed_amount' || type === 'fixed_annual') return roundPence(value);
  if (type === 'fixed_monthly') return roundPence(value * 12);
  if (type === 'percentage') return roundPence(grossAnnualSalaryPence * (value / 100));
  throw new Error('Pension contribution type is invalid.');
}

function methodFromLegacyTreatment(taxTreatment) {
  return taxTreatment === 'post_tax' ? 'relief_at_source' : 'salary_sacrifice';
}

function derivedTaxTreatment(method) {
  return ['salary_sacrifice', 'net_pay'].includes(method) ? 'pre_tax' : 'post_tax';
}
