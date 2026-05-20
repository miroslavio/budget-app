import { redirect } from '../http/response.js';
import { todayIso } from '../utils/dates.js';

export function ensureAuthenticated(ctx) {
  if (!ctx.user) {
    redirect(ctx.res, '/login');
    return false;
  }
  return true;
}

export function redirectWithError(res, path, error) {
  redirect(res, `${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(error.message || error)}`);
}

export function redirectWithSuccess(res, path, message) {
  redirect(res, `${path}${path.includes('?') ? '&' : '?'}success=${encodeURIComponent(message)}`);
}

export function formDate(value) {
  return String(value || '').trim() || todayIso();
}

export function checkboxValue(value) {
  return value === 'on' || value === '1' || value === 'true';
}

export function parseStudentLoanPlans(fields) {
  if (fields.student_loan_plan && fields.student_loan_plan !== 'none') {
    return [fields.student_loan_plan];
  }
  return ['plan_1', 'plan_2', 'plan_4', 'plan_5'].filter((plan) => checkboxValue(fields[`student_loan_${plan}`]));
}
