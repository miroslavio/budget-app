import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSetupChecklist } from '../views/setupChecklist.js';

test('setup checklist shows incomplete required steps', () => {
  const html = renderSetupChecklist([
    { title: 'Add planned income', description: 'Add expected income.', href: '/budget-plan/income', complete: false },
    { title: 'Review forecast adjustment', description: 'Review the forecast start.', href: '/forecast', complete: false, optional: true }
  ]);

  assert.match(html, /Set up your budget plan/);
  assert.match(html, /Add planned income/);
  assert.match(html, /0 of 1 essentials complete/);
});

test('setup checklist hides when only optional steps remain', () => {
  const html = renderSetupChecklist([
    { title: 'Add planned income', description: 'Add expected income.', href: '/budget-plan/income', complete: true },
    { title: 'Review forecast adjustment', description: 'Review the forecast start.', href: '/forecast', complete: false, optional: true }
  ]);

  assert.equal(html, '');
});

test('setup checklist can render multi-action essential steps', () => {
  const html = renderSetupChecklist([
    {
      title: 'Add planned savings contributions',
      description: 'Include planned savings or skip them for now.',
      complete: false,
      actionHtml: '<a class="button secondary" href="/budget-plan/planned-savings">Add planned savings</a><form method="post"><button class="button secondary">Skip for now</button></form>'
    }
  ]);

  assert.match(html, /Add planned savings/);
  assert.match(html, /Skip for now/);
  assert.match(html, /setup-actions/);
});
