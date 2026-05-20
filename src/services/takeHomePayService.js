import { calculateIncomeTax } from './incomeTaxService.js';
import { calculateEmployeeNationalInsurance } from './nationalInsuranceService.js';
import { calculateStudentLoanRepayments } from './studentLoanService.js';
import { loadTaxRules } from './taxRulesService.js';
import { roundPence } from '../utils/money.js';

export function estimateTakeHomePay(input) {
  const rules = loadTaxRules(input.taxYear);
  const grossAnnualSalaryPence = Math.max(0, Number(input.grossAnnualSalaryPence || 0));
  const pensionContributionPence = calculatePensionContribution(grossAnnualSalaryPence, input);
  const otherPreTaxDeductionsPence = Math.max(0, Number(input.otherPreTaxDeductionsPence || 0));
  const otherPostTaxDeductionsPence = Math.max(0, Number(input.otherPostTaxDeductionsPence || 0));
  const pensionIsPreTax = input.pensionContributionTaxTreatment === 'pre_tax';

  const preTaxReductionPence = (pensionIsPreTax ? pensionContributionPence : 0) + otherPreTaxDeductionsPence;
  const postTaxReductionPence = (pensionIsPreTax ? 0 : pensionContributionPence) + otherPostTaxDeductionsPence;

  const taxablePayPence = Math.max(0, grossAnnualSalaryPence - preTaxReductionPence);
  const niablePayPence = Math.max(0, grossAnnualSalaryPence - preTaxReductionPence);
  const loanablePayPence = Math.max(0, grossAnnualSalaryPence - preTaxReductionPence);

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
    pensionContributionType: input.pensionContributionType || 'none',
    pensionContributionValue: Number(input.pensionContributionValue || 0),
    pensionContributionTaxTreatment: input.pensionContributionTaxTreatment || 'pre_tax',
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
  if (type === 'fixed_amount') return roundPence(value);
  if (type === 'percentage') return roundPence(grossAnnualSalaryPence * (value / 100));
  throw new Error('Pension contribution type is invalid.');
}
