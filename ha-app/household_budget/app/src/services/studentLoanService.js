import { roundPence } from '../utils/money.js';

export function calculateStudentLoanRepayments({ annualLoanablePayPence, studentLoanPlans = [], hasPostgraduateLoan = false }, rules) {
  const undergraduateRules = rules.undergraduatePlans.filter((plan) => studentLoanPlans.includes(plan.plan) && plan.active);
  const lowestUndergraduateThreshold = undergraduateRules.length
    ? Math.min(...undergraduateRules.map((plan) => plan.annualThreshold * 100))
    : null;
  const undergraduateRate = undergraduateRules[0]?.repaymentRate || 0.09;

  const studentLoanRepaymentPence =
    lowestUndergraduateThreshold === null
      ? 0
      : roundPence(Math.max(0, annualLoanablePayPence - lowestUndergraduateThreshold) * undergraduateRate);

  const postgraduateRule = rules.postgraduateLoan;
  const postgraduateLoanRepaymentPence =
    hasPostgraduateLoan && postgraduateRule.active
      ? roundPence(Math.max(0, annualLoanablePayPence - postgraduateRule.annualThreshold * 100) * postgraduateRule.repaymentRate)
      : 0;

  return {
    selectedUndergraduatePlans: undergraduateRules,
    studentLoanRepaymentPence,
    postgraduateLoanRepaymentPence,
    totalLoanRepaymentPence: studentLoanRepaymentPence + postgraduateLoanRepaymentPence
  };
}
