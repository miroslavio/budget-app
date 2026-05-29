function toggleConditionalSections(root = document) {
  const controllers = root.querySelectorAll('[data-controls]');
  controllers.forEach((controller) => {
    const update = () => {
      const currentValue = controller.type === 'checkbox' ? (controller.checked ? 'checked' : 'unchecked') : controller.value;
      const targets = root.querySelectorAll(`[data-controlled-by="${controller.name}"]`);
      targets.forEach((target) => {
        const expected = String(target.dataset.showWhen || '').split('|');
        const visible = expected.includes(currentValue);
        target.hidden = !visible;
        target.querySelectorAll('input, select, textarea').forEach((field) => {
          if (field.dataset.requiredWhenVisible === 'true') {
            field.required = visible;
          }
        });
      });
    };

    controller.addEventListener('change', update);
    controller.addEventListener('input', update);
    update();
  });
}

function wireDetailsActions(root = document) {
  root.querySelectorAll('[data-close-details]').forEach((button) => {
    button.addEventListener('click', () => {
      const details = button.closest('details');
      if (details) details.open = false;
    });
  });
}

function wireEnterSubmit(root = document) {
  root.querySelectorAll('form[data-submit-on-enter]').forEach((form) => {
    form.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      const field = event.target;
      if (!(field instanceof HTMLElement)) return;
      if (!['INPUT', 'SELECT'].includes(field.tagName)) return;

      event.preventDefault();
      const submitter = form.querySelector('button[type="submit"], input[type="submit"]');
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit(submitter || undefined);
      } else if (submitter instanceof HTMLElement) {
        submitter.click();
      }
    });
  });
}

function wireAutoSubmit(root = document) {
  root.querySelectorAll('form[data-submit-on-change]').forEach((form) => {
    form.addEventListener('change', (event) => {
      const field = event.target;
      if (!(field instanceof HTMLElement)) return;
      if (!['SELECT', 'INPUT'].includes(field.tagName)) return;
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.submit();
      }
    });
  });
}

function wireViewToggles(root = document) {
  root.querySelectorAll('[data-view-toggle-group]').forEach((group) => {
    const buttons = [...group.querySelectorAll('[data-view-toggle][data-view-value]')];
    if (!buttons.length) return;

    const targetName = buttons[0].getAttribute('data-view-toggle');
    if (!targetName) return;

    const panels = [...root.querySelectorAll(`[data-view-panel="${targetName}"][data-view-value]`)];
    if (!panels.length) return;

    const activate = (value) => {
      buttons.forEach((button) => {
        const isActive = button.getAttribute('data-view-value') === value;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      panels.forEach((panel) => {
        panel.hidden = panel.getAttribute('data-view-value') !== value;
      });
    };

    buttons.forEach((button) => {
      if (button.dataset.viewToggleBound === 'true') return;
      button.dataset.viewToggleBound = 'true';
      button.addEventListener('click', () => activate(button.getAttribute('data-view-value') || ''));
    });

    const defaultButton = buttons.find((button) => button.classList.contains('active')) || buttons[0];
    activate(defaultButton.getAttribute('data-view-value') || '');
  });
}

function wireRowToggles(root = document) {
  root.querySelectorAll('[data-toggle-row]').forEach((button) => {
    if (!(button instanceof HTMLButtonElement) || button.dataset.toggleRowBound === 'true') return;
    button.dataset.toggleRowBound = 'true';
    button.addEventListener('click', () => {
      const targetId = button.dataset.toggleRow;
      if (!targetId) return;
      const row = document.getElementById(targetId);
      if (!(row instanceof HTMLElement)) return;
      const willOpen = row.hasAttribute('hidden');
      row.toggleAttribute('hidden', !willOpen);
      button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  refreshConditionalSections();
  wireDetailsActions();
  wireEnterSubmit();
  wireAutoSubmit();
  wireViewToggles();
  wireRowToggles();
  wireSortableTables();
  wireChartTooltips();
  wireNumberInputs();
  wireSplitSliders();
  wireTransactionCategorySelects();
  wireSpendingWarningSelects();
  wireIncomeEstimateForms();
  wireSavingsProjectionForms();
  wireMonthPickers();
  wireConfirmActions();
  wireModals();
  wireMobileNav();
});

function wireSortableTables(root = document) {
  root.querySelectorAll('table.data-table:not(.chart-data-table)').forEach((table) => {
    if (!(table instanceof HTMLTableElement) || table.dataset.sortableBound === 'true') return;
    const theadRow = table.tHead?.rows?.[0];
    const tbody = table.tBodies?.[0];
    if (!theadRow || !tbody || tbody.rows.length < 2) return;

    table.dataset.sortableBound = 'true';
    const headers = [...theadRow.cells];
    headers.forEach((th, index) => {
      if (!(th instanceof HTMLTableCellElement)) return;
      if (th.classList.contains('actions-col') || th.dataset.sortable === 'false' || th.colSpan > 1) {
        th.setAttribute('aria-sort', 'none');
        return;
      }

      const label = th.textContent?.trim() || '';
      if (!label) return;
      th.setAttribute('aria-sort', 'none');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'table-sort-button';
      button.innerHTML = `<span>${label}</span><span class="table-sort-indicator" aria-hidden="true">↕</span>`;
      button.setAttribute('aria-label', `Sort by ${label}`);
      th.textContent = '';
      th.appendChild(button);

      button.addEventListener('click', () => {
        const currentColumn = Number(table.dataset.sortColumn ?? -1);
        const nextDirection = currentColumn === index && table.dataset.sortDirection === 'asc' ? 'desc' : 'asc';
        sortTableByColumn(table, tbody, headers, index, nextDirection);
      });
    });
  });
}

function sortTableByColumn(table, tbody, headers, columnIndex, direction) {
  const groups = collectSortableRowGroups(tbody);
  const type = inferSortType(groups, columnIndex);

  groups.sort((a, b) => compareSortValues(readSortValue(a[0], columnIndex, type), readSortValue(b[0], columnIndex, type), direction));
  groups.forEach((group) => group.forEach((row) => tbody.appendChild(row)));

  table.dataset.sortColumn = String(columnIndex);
  table.dataset.sortDirection = direction;
  headers.forEach((th, index) => {
    if (!(th instanceof HTMLTableCellElement)) return;
    const isActive = index === columnIndex;
    th.setAttribute('aria-sort', isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none');
    const indicator = th.querySelector('.table-sort-indicator');
    if (indicator instanceof HTMLElement) {
      indicator.textContent = isActive ? (direction === 'asc' ? '↑' : '↓') : '↕';
    }
  });
}

function collectSortableRowGroups(tbody) {
  const rows = [...tbody.rows];
  const groups = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.classList.contains('income-breakdown-row')) continue;
    const group = [row];
    const next = rows[index + 1];
    if (next?.classList.contains('income-breakdown-row')) {
      group.push(next);
      index += 1;
    }
    groups.push(group);
  }
  return groups;
}

function inferSortType(groups, columnIndex) {
  const values = groups
    .map((group) => rawCellValue(group[0], columnIndex))
    .filter((value) => value !== '');
  if (!values.length) return 'text';
  if (values.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))) return 'date';
  if (values.every((value) => /%$/.test(value.trim()) || isNumericLike(value))) return 'number';
  if (values.some((value) => value.includes('£'))) return 'currency';
  return 'text';
}

function readSortValue(row, columnIndex, type) {
  const value = rawCellValue(row, columnIndex);
  if (value === '') return type === 'text' ? '' : Number.NEGATIVE_INFINITY;
  if (type === 'date') return Date.parse(value) || Number.NEGATIVE_INFINITY;
  if (type === 'currency' || type === 'number') return parseNumericLike(value);
  return value.trim().toLocaleLowerCase('en-GB');
}

function rawCellValue(row, columnIndex) {
  const cell = row.cells[columnIndex];
  if (!(cell instanceof HTMLTableCellElement)) return '';
  return cell.dataset.sortValue || cell.textContent?.trim() || '';
}

function parseNumericLike(value) {
  const normalised = String(value).replace(/[^0-9.-]+/g, '');
  const parsed = Number.parseFloat(normalised);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function isNumericLike(value) {
  return Number.isFinite(parseNumericLike(value));
}

function compareSortValues(a, b, direction) {
  if (a === b) return 0;
  if (a < b) return direction === 'asc' ? -1 : 1;
  return direction === 'asc' ? 1 : -1;
}

function wireChartTooltips(root = document) {
  const tooltip = getOrCreateChartTooltip();
  const targets = root.querySelectorAll('[data-chart-tooltip]');
  targets.forEach((target) => {
    if (!(target instanceof HTMLElement || target instanceof SVGElement) || target.dataset.chartTooltipBound === 'true') return;
    target.dataset.chartTooltipBound = 'true';
    target.setAttribute('tabindex', target.getAttribute('tabindex') || '0');

    const show = () => showChartTooltip(tooltip, target);
    const move = () => showChartTooltip(tooltip, target);
    const hide = () => hideChartTooltip(tooltip);

    target.addEventListener('mouseenter', show);
    target.addEventListener('mousemove', move);
    target.addEventListener('focus', show);
    target.addEventListener('click', show);
    target.addEventListener('mouseleave', hide);
    target.addEventListener('blur', hide);
    target.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') hide();
    });
  });
}

function getOrCreateChartTooltip() {
  let tooltip = document.getElementById('chart-tooltip');
  if (tooltip) return tooltip;
  tooltip = document.createElement('div');
  tooltip.id = 'chart-tooltip';
  tooltip.className = 'chart-tooltip';
  tooltip.hidden = true;
  tooltip.setAttribute('role', 'tooltip');
  document.body.appendChild(tooltip);
  return tooltip;
}

function showChartTooltip(tooltip, target) {
  const text = target.getAttribute('data-chart-tooltip');
  if (!tooltip || !text) return;
  tooltip.innerHTML = String(text)
    .split('\n')
    .map((line) => `<div>${escapeHtmlText(line)}</div>`)
    .join('');
  tooltip.hidden = false;

  const rect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - tooltipRect.width - 12, Math.max(12, rect.left + rect.width / 2 - tooltipRect.width / 2));
  const top = Math.max(12, rect.top - tooltipRect.height - 12);
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function hideChartTooltip(tooltip) {
  if (!tooltip) return;
  tooltip.hidden = true;
}

function escapeHtmlText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function refreshConditionalSections(root = document) {
  toggleConditionalSections(root);
}

function wireModals(root = document) {
  root.querySelectorAll('[data-open-modal]').forEach((button) => {
    button.addEventListener('click', () => {
      const dialog = document.getElementById(button.dataset.openModal);
      if (!dialog || typeof dialog.showModal !== 'function') return;

      if (button.dataset.resetModal === 'true') {
        dialog.querySelectorAll('form').forEach((form) => form.reset());
      }

      Object.entries(button.dataset)
        .filter(([key]) => key.startsWith('fill'))
        .forEach(([key, value]) => {
          const fieldKey = key.slice(4);
          const normalisedKey = fieldKey.slice(0, 1).toLowerCase() + fieldKey.slice(1);
          const field = dialog.querySelector(`[data-modal-field="${normalisedKey}"]`);
          const arrayField = dialog.querySelector(`[data-modal-field-array="${normalisedKey}"]`);
          if (!field && arrayField instanceof HTMLElement) {
            const selectedValues = new Set(String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean));
            arrayField.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
              if (checkbox instanceof HTMLInputElement) {
                checkbox.checked = selectedValues.has(checkbox.value);
              }
            });
            return;
          }
          if (field instanceof HTMLInputElement && field.type === 'checkbox') {
            field.checked = value === 'true' || value === '1' || value === 'checked' || value === 'on';
          } else if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
            field.value = value;
          }
        });

      refreshConditionalSections(dialog);
      wireNumberInputs(dialog);
      wireSplitSliders(dialog);
      wireTransactionCategorySelects(dialog);
      wireSpendingWarningSelects(dialog);
      wireIncomeEstimateForms(dialog);
      wireSavingsProjectionForms(dialog);
      dialog.showModal();
    });
  });

  root.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => {
      const dialog = button.closest('dialog');
      if (dialog) dialog.close();
    });
  });

  root.querySelectorAll('dialog[data-modal]').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
}

function wireConfirmActions(root = document) {
  const dialog = document.getElementById('confirm-modal');
  if (!(dialog instanceof HTMLDialogElement)) return;

  const title = dialog.querySelector('#confirm-modal-title');
  const message = dialog.querySelector('#confirm-modal-message');
  const confirmButton = dialog.querySelector('[data-confirm-accept]');
  const cancelButtons = dialog.querySelectorAll('[data-confirm-cancel]');

  let pendingForm = null;

  const closeDialog = () => {
    pendingForm = null;
    dialog.close();
  };

  cancelButtons.forEach((button) => {
    if (!(button instanceof HTMLElement) || button.dataset.confirmBound === 'true') return;
    button.dataset.confirmBound = 'true';
    button.addEventListener('click', closeDialog);
  });

  if (confirmButton instanceof HTMLButtonElement && confirmButton.dataset.confirmBound !== 'true') {
    confirmButton.dataset.confirmBound = 'true';
    confirmButton.addEventListener('click', () => {
      if (!pendingForm) return;
      const form = pendingForm;
      closeDialog();
      form.submit();
    });
  }

  if (dialog.dataset.confirmDismissBound !== 'true') {
    dialog.dataset.confirmDismissBound = 'true';
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog();
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeDialog();
    });
  }

  root.querySelectorAll('form[data-confirm]').forEach((form) => {
    if (!(form instanceof HTMLFormElement) || form.dataset.confirmBound === 'true') return;
    form.dataset.confirmBound = 'true';
    form.addEventListener('submit', (event) => {
      if (form.dataset.confirmed === 'true') {
        form.dataset.confirmed = 'false';
        return;
      }

      const confirmMessage = form.dataset.confirm;
      if (!confirmMessage) return;

      event.preventDefault();
      pendingForm = form;

      if (title instanceof HTMLElement) {
        title.textContent = form.dataset.confirmTitle || 'Confirm action';
      }
      if (message instanceof HTMLElement) {
        message.textContent = confirmMessage;
      }
      if (confirmButton instanceof HTMLButtonElement) {
        confirmButton.textContent = form.dataset.confirmActionLabel || inferConfirmActionLabel(confirmMessage);
        confirmButton.focus();
      }

      dialog.showModal();
    });
  });
}

function wireMonthPickers(root = document) {
  root.querySelectorAll('[data-open-month-picker]').forEach((button) => {
    if (!(button instanceof HTMLButtonElement) || button.dataset.monthPickerBound === 'true') return;
    button.dataset.monthPickerBound = 'true';
    button.addEventListener('click', () => {
      const inputId = button.dataset.openMonthPicker;
      if (!inputId) return;
      const input = document.getElementById(inputId);
      if (!(input instanceof HTMLInputElement)) return;
      const rect = button.getBoundingClientRect();
      input.style.left = `${Math.round(rect.left)}px`;
      input.style.top = `${Math.round(rect.bottom + 8)}px`;
      input.style.width = `${Math.max(160, Math.round(rect.width))}px`;
      input.style.height = '1px';
      input.focus();
      if (typeof input.showPicker === 'function') {
        input.showPicker();
      } else {
        input.click();
      }
    });
  });
}

function inferConfirmActionLabel(confirmMessage) {
  const message = String(confirmMessage || '').toLowerCase();
  if (message.startsWith('delete')) return 'Delete';
  if (message.startsWith('reset')) return 'Reset';
  if (message.startsWith('remove')) return 'Remove';
  return 'Confirm';
}

function wireIncomeEstimateForms(root = document) {
  root.querySelectorAll('form[data-income-estimate-form]').forEach((form) => {
    if (!(form instanceof HTMLFormElement) || form.dataset.incomeEstimateBound === 'true') return;
    form.dataset.incomeEstimateBound = 'true';

    const modeField = form.querySelector('[name="income_entry_mode"]');
    const manualAmountField = form.querySelector('[name="manual_amount"]');
    const manualFrequencyField = form.querySelector('[name="manual_frequency"]');
    const saveButton = form.querySelector('button[name="action"][value="save"]');
    const calculateButton = form.querySelector('[data-calculate-income-estimate]');
    const summaryRoot = form.querySelector('[data-income-summary]');
    const manualSummary = summaryRoot?.querySelector('[data-income-summary-view="manual_net"]');
    const estimatedSummary = summaryRoot?.querySelector('[data-income-summary-view="estimated_from_gross"]');
    const emptyState = summaryRoot?.querySelector('[data-income-estimate-empty]');
    const results = summaryRoot?.querySelector('[data-income-estimate-results]');
    const errorBox = summaryRoot?.querySelector('[data-income-estimate-error]');

    const updateSummaryMode = () => {
      const isEstimated = modeField instanceof HTMLSelectElement && modeField.value === 'estimated_from_gross';
      if (manualSummary instanceof HTMLElement) manualSummary.hidden = isEstimated;
      if (estimatedSummary instanceof HTMLElement) estimatedSummary.hidden = !isEstimated;
    };

    const updateManualSummary = () => {
      const amount = parseMoneyValue(manualAmountField);
      const frequency = manualFrequencyField instanceof HTMLSelectElement ? manualFrequencyField.value : 'monthly';
      const monthly = frequency === 'yearly' ? Math.round(amount / 12) : amount;
      setText(form, '[data-summary-manual-amount]', formatCurrencyFromPence(amount));
      setText(form, '[data-summary-manual-frequency]', capitalise(frequency));
      setText(form, '[data-summary-manual-monthly]', formatCurrencyFromPence(monthly));
    };

    const resetEstimateStates = () => {
      if (errorBox instanceof HTMLElement) {
        errorBox.hidden = true;
        errorBox.textContent = '';
      }
    };

    const calculateEstimate = async () => {
      if (!(modeField instanceof HTMLSelectElement) || modeField.value !== 'estimated_from_gross') return true;

      resetEstimateStates();
      if (!form.reportValidity()) return false;

      const formData = new FormData(form);
      try {
        calculateButton?.setAttribute('aria-busy', 'true');
        const response = await fetch('/income/estimate', {
          method: 'POST',
          body: new URLSearchParams([...formData.entries()].map(([key, value]) => [key, String(value)])),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
          }
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || 'Unable to calculate the estimate.');
        }
        renderIncomeEstimate(summaryRoot, payload.estimate);
        return true;
      } catch (error) {
        if (errorBox instanceof HTMLElement) {
          errorBox.hidden = false;
          errorBox.textContent = error.message || String(error);
        }
        return false;
      } finally {
        calculateButton?.removeAttribute('aria-busy');
      }
    };

    form.querySelectorAll('[data-income-summary-trigger]').forEach((field) => {
      field.addEventListener('change', () => {
        updateSummaryMode();
        updateManualSummary();
      });
      field.addEventListener('input', () => {
        updateSummaryMode();
        updateManualSummary();
      });
    });

    if (calculateButton instanceof HTMLButtonElement) {
      calculateButton.addEventListener('click', async () => {
        await calculateEstimate();
      });
    }

    if (saveButton instanceof HTMLButtonElement) {
      saveButton.addEventListener('click', async (event) => {
        if (!(modeField instanceof HTMLSelectElement) || modeField.value !== 'estimated_from_gross') return;
        event.preventDefault();
        const ok = await calculateEstimate();
        if (!ok) return;
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit(saveButton);
        } else {
          form.submit();
        }
      });
    }

    updateSummaryMode();
    updateManualSummary();

    if (modeField instanceof HTMLSelectElement && modeField.value === 'estimated_from_gross') {
      const grossSalaryField = form.querySelector('[name="gross_annual_salary"]');
      if (grossSalaryField instanceof HTMLInputElement && grossSalaryField.value) {
        calculateEstimate();
      } else {
        if (emptyState instanceof HTMLElement) emptyState.hidden = false;
        if (results instanceof HTMLElement) results.hidden = true;
      }
    }
  });
}

function wireSavingsProjectionForms(root = document) {
  root.querySelectorAll('form[data-savings-projection-form]').forEach((form) => {
    if (!(form instanceof HTMLFormElement) || form.dataset.savingsProjectionBound === 'true') return;
    form.dataset.savingsProjectionBound = 'true';

    const accountTypeField = form.querySelector('[name="account_type"]');
    const presetField = form.querySelector('[name="projection_preset"]');
    const customRateField = form.querySelector('[name="projected_annual_rate_custom"]');
    const hiddenRateField = form.querySelector('[name="projected_annual_rate"]');
    const hiddenRateTypeField = form.querySelector('[name="projected_rate_type"]');
    const rateTypeOverrideField = form.querySelector('[name="projected_rate_type_override"]');
    const currentBalanceField = form.querySelector('[name="current_balance"]');
    const monthlyContributionField = form.querySelector('[name="monthly_contribution"]');
    const employerContributionField = form.querySelector('[name="employer_monthly_contribution"]');
    const includeLisaBonusField = form.querySelector('[name="include_lisa_bonus"]');
    const rateLabel = form.querySelector('[data-savings-rate-label]');
    const rateHelper = form.querySelector('[data-savings-rate-helper]');
    const customRateWrapper = form.querySelector('[data-savings-custom-rate]');
    const rateTypeOverrideWrapper = form.querySelector('[data-savings-rate-type-override]');
    const previewRateLabel = form.querySelector('[data-savings-preview-rate-label]');
    const previewRateValue = form.querySelector('[data-savings-preview-rate-value]');
    const previewMonthly = form.querySelector('[data-savings-preview-monthly]');
    const previewAnnual = form.querySelector('[data-savings-preview-annual]');
    const previewEmployerRow = form.querySelector('[data-savings-preview-employer-row]');
    const previewEmployer = form.querySelector('[data-savings-preview-employer]');
    const previewLisaRow = form.querySelector('[data-savings-preview-lisa-row]');
    const previewLisa = form.querySelector('[data-savings-preview-lisa]');
    const previewTotal = form.querySelector('[data-savings-preview-total]');
    const scenariosRoot = form.querySelector('[data-savings-scenarios]');
    const scenariosList = form.querySelector('[data-savings-scenarios-list]');

    const ratePresets = [
      { value: '0', label: 'No growth: 0%', rate: 0 },
      { value: '2', label: 'Low: 2%', rate: 2 },
      { value: '4', label: 'Medium: 4%', rate: 4 },
      { value: '6', label: 'High: 6%', rate: 6 }
    ];

    const updatePresetFromRate = () => {
      if (!(presetField instanceof HTMLSelectElement) || !(hiddenRateField instanceof HTMLInputElement)) return;
      const currentRate = String(Number(hiddenRateField.value || 0));
      const matchingPreset = ratePresets.find((preset) => String(preset.rate) === currentRate);
      presetField.value = matchingPreset ? matchingPreset.value : 'custom';
      if (customRateField instanceof HTMLInputElement && !matchingPreset) {
        customRateField.value = hiddenRateField.value || '';
      }
      if (rateTypeOverrideField instanceof HTMLSelectElement && hiddenRateTypeField instanceof HTMLInputElement) {
        rateTypeOverrideField.value = hiddenRateTypeField.value || 'interest';
      }
    };

    const update = () => {
      const accountType = accountTypeField instanceof HTMLSelectElement ? accountTypeField.value : 'current_account';
      const rateType = resolveSavingsRateType(accountType, rateTypeOverrideField instanceof HTMLSelectElement ? rateTypeOverrideField.value : 'interest');
      const rateLabelText = rateType === 'growth' ? 'Projected annual growth assumption' : 'Projected annual interest rate';

      if (rateLabel instanceof HTMLElement) rateLabel.textContent = rateLabelText;
      if (previewRateLabel instanceof HTMLElement) previewRateLabel.textContent = rateLabelText;
      if (rateHelper instanceof HTMLElement) {
        rateHelper.textContent = rateType === 'growth'
          ? 'Use a cautious planning assumption. Actual investment returns can be higher or lower.'
          : 'Use a cautious planning assumption. Actual interest may be higher or lower than this estimate.';
      }

      if (rateTypeOverrideWrapper instanceof HTMLElement) {
        rateTypeOverrideWrapper.hidden = accountType !== 'other';
      }
      if (hiddenRateTypeField instanceof HTMLInputElement) {
        hiddenRateTypeField.value = rateType;
      }

      if (presetField instanceof HTMLSelectElement && customRateWrapper instanceof HTMLElement) {
        customRateWrapper.hidden = presetField.value !== 'custom';
      }

      const annualRate = resolveSavingsPresetRate(presetField, customRateField, hiddenRateField);
      if (hiddenRateField instanceof HTMLInputElement) hiddenRateField.value = String(annualRate);
      if (previewRateValue instanceof HTMLElement) previewRateValue.textContent = `${formatPercent(annualRate)}`;

      const currentBalancePence = parseMoneyValue(currentBalanceField);
      const monthlyContributionPence = parseMoneyValue(monthlyContributionField);
      const employerContributionPence = accountType === 'pension' ? parseMoneyValue(employerContributionField) : 0;
      const includeLisaBonus = accountType === 'lifetime_isa' && includeLisaBonusField instanceof HTMLInputElement && includeLisaBonusField.checked;
      const projection = projectSavingsPreview({
        accountType,
        currentBalancePence,
        monthlyContributionPence,
        employerContributionPence,
        annualRate,
        includeLisaBonus
      });

      if (previewMonthly instanceof HTMLElement) previewMonthly.textContent = formatCurrencyFromPence(monthlyContributionPence);
      if (previewAnnual instanceof HTMLElement) previewAnnual.textContent = formatCurrencyFromPence(monthlyContributionPence * 12);
      if (previewEmployerRow instanceof HTMLElement) previewEmployerRow.hidden = employerContributionPence <= 0;
      if (previewEmployer instanceof HTMLElement) previewEmployer.textContent = formatCurrencyFromPence(employerContributionPence * 12);
      if (previewLisaRow instanceof HTMLElement) previewLisaRow.hidden = !includeLisaBonus || projection.lisaBonusPence <= 0;
      if (previewLisa instanceof HTMLElement) previewLisa.textContent = formatCurrencyFromPence(projection.lisaBonusPence);
      if (previewTotal instanceof HTMLElement) previewTotal.textContent = formatCurrencyFromPence(projection.projectedBalancePence);

      if (scenariosRoot instanceof HTMLElement && scenariosList instanceof HTMLElement) {
        const showScenarios = rateType === 'growth';
        scenariosRoot.hidden = !showScenarios;
        if (showScenarios) {
          scenariosList.innerHTML = ratePresets
            .map((preset) => {
              const scenario = projectSavingsPreview({
                accountType,
                currentBalancePence,
                monthlyContributionPence,
                employerContributionPence,
                annualRate: preset.rate,
                includeLisaBonus
              });
              return `<div><dt>${escapeHtmlText(preset.label)}</dt><dd>${escapeHtmlText(formatCurrencyFromPence(scenario.projectedBalancePence))}</dd></div>`;
            })
            .join('');
        }
      }
    };

    updatePresetFromRate();
    [
      accountTypeField,
      presetField,
      customRateField,
      rateTypeOverrideField,
      currentBalanceField,
      monthlyContributionField,
      employerContributionField,
      includeLisaBonusField
    ].forEach((field) => {
      if (!(field instanceof HTMLElement)) return;
      field.addEventListener('change', update);
      field.addEventListener('input', update);
    });

    form.addEventListener('submit', () => {
      const annualRate = resolveSavingsPresetRate(presetField, customRateField, hiddenRateField);
      if (hiddenRateField instanceof HTMLInputElement) hiddenRateField.value = String(annualRate);
      if (hiddenRateTypeField instanceof HTMLInputElement) {
        const accountType = accountTypeField instanceof HTMLSelectElement ? accountTypeField.value : 'current_account';
        hiddenRateTypeField.value = resolveSavingsRateType(accountType, rateTypeOverrideField instanceof HTMLSelectElement ? rateTypeOverrideField.value : 'interest');
      }
    });

    update();
  });
}

function resolveSavingsPresetRate(presetField, customRateField, hiddenRateField) {
  if (presetField instanceof HTMLSelectElement && presetField.value && presetField.value !== 'custom') {
    return Number(presetField.value) || 0;
  }
  if (customRateField instanceof HTMLInputElement && customRateField.value !== '') {
    return Number(customRateField.value) || 0;
  }
  if (hiddenRateField instanceof HTMLInputElement && hiddenRateField.value !== '') {
    return Number(hiddenRateField.value) || 0;
  }
  return 0;
}

function resolveSavingsRateType(accountType, overrideValue) {
  if (accountType === 'other') {
    return overrideValue === 'growth' ? 'growth' : 'interest';
  }
  return ['stocks_and_shares_isa', 'lifetime_isa', 'pension'].includes(accountType) ? 'growth' : 'interest';
}

function projectSavingsPreview({ accountType, currentBalancePence, monthlyContributionPence, employerContributionPence, annualRate, includeLisaBonus, months = 12 }) {
  let balancePence = Number(currentBalancePence || 0);
  let lisaAllowanceUsedPence = 0;
  let lisaBonusPence = 0;
  const monthlyRate = annualRate ? Math.pow(1 + annualRate / 100, 1 / 12) - 1 : 0;

  for (let index = 0; index < months; index += 1) {
    const eligibleLisaContributionPence = accountType === 'lifetime_isa' && includeLisaBonus
      ? Math.min(Number(monthlyContributionPence || 0), Math.max(0, 400000 - lisaAllowanceUsedPence))
      : 0;
    const bonusPence = Math.round(eligibleLisaContributionPence * 0.25);
    lisaAllowanceUsedPence += eligibleLisaContributionPence;
    lisaBonusPence += bonusPence;
    const contributionPence = Number(monthlyContributionPence || 0) + Number(employerContributionPence || 0) + bonusPence;
    const growthPence = Math.round((balancePence + contributionPence) * monthlyRate);
    balancePence += contributionPence + growthPence;
  }

  return {
    projectedBalancePence: balancePence,
    lisaBonusPence
  };
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2).replace(/\.00$/, '')}%`;
}

function renderIncomeEstimate(summaryRoot, estimate) {
  if (!(summaryRoot instanceof HTMLElement)) return;
  const emptyState = summaryRoot.querySelector('[data-income-estimate-empty]');
  const results = summaryRoot.querySelector('[data-income-estimate-results]');
  if (emptyState instanceof HTMLElement) emptyState.hidden = true;
  if (results instanceof HTMLElement) results.hidden = false;

  setText(summaryRoot, '[data-estimate-gross]', formatCurrencyFromPence(estimate.grossAnnualSalaryPence));
  setText(summaryRoot, '[data-estimate-income-tax]', formatNegativeCurrencyFromPence(estimate.estimatedIncomeTaxPence));
  setText(summaryRoot, '[data-estimate-ni]', formatNegativeCurrencyFromPence(estimate.estimatedNationalInsurancePence));
  setText(summaryRoot, '[data-estimate-student-loan]', formatNegativeCurrencyFromPence(estimate.estimatedStudentLoanRepaymentPence));
  setText(summaryRoot, '[data-estimate-net-annual]', formatCurrencyFromPence(estimate.estimatedNetAnnualIncomePence));
  setText(summaryRoot, '[data-estimate-net-monthly]', formatCurrencyFromPence(estimate.estimatedNetMonthlyIncomePence));
  setText(summaryRoot, '[data-estimate-budget-monthly]', formatCurrencyFromPence(estimate.plannedMonthlyPence));
  setText(summaryRoot, '[data-estimate-tax-year]', estimate.taxYear || '—');
  setText(summaryRoot, '[data-estimate-student-loan-plan]', estimate.studentLoanPlan || '—');
  setText(summaryRoot, '[data-estimate-postgraduate-status]', estimate.postgraduateLoanStatus || '—');
  setText(summaryRoot, '[data-estimate-pension-treatment]', estimate.pensionTreatment || '—');

  toggleEstimateRow(summaryRoot, '[data-estimate-postgraduate-row]', estimate.estimatedPostgraduateLoanRepaymentPence > 0);
  setText(summaryRoot, '[data-estimate-postgraduate]', formatNegativeCurrencyFromPence(estimate.estimatedPostgraduateLoanRepaymentPence || 0));
  toggleEstimateRow(summaryRoot, '[data-estimate-pension-row]', estimate.pensionContributionPence > 0);
  setText(summaryRoot, '[data-estimate-pension]', formatNegativeCurrencyFromPence(estimate.pensionContributionPence || 0));
  toggleEstimateRow(summaryRoot, '[data-estimate-other-row]', estimate.estimatedOtherDeductionsPence > 0);
  setText(summaryRoot, '[data-estimate-other]', formatNegativeCurrencyFromPence(estimate.estimatedOtherDeductionsPence || 0));
}

function toggleEstimateRow(root, selector, visible) {
  const row = root.querySelector(selector);
  if (row instanceof HTMLElement) row.hidden = !visible;
}

function setText(root, selector, value) {
  const element = root.querySelector(selector);
  if (element instanceof HTMLElement) element.textContent = value;
}

function parseMoneyValue(field) {
  if (!(field instanceof HTMLInputElement)) return 0;
  const value = Number.parseFloat(String(field.value || '').replace(/,/g, '.'));
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

function formatCurrencyFromPence(pence) {
  const value = Number(pence || 0);
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value / 100);
}

function formatNegativeCurrencyFromPence(pence) {
  return `-${formatCurrencyFromPence(Math.abs(Number(pence || 0)))}`;
}

function capitalise(value) {
  const text = String(value || '');
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

function wireNumberInputs(root = document) {
  root.querySelectorAll('input[data-number-input]').forEach((input) => {
    if (!(input instanceof HTMLInputElement) || input.dataset.numberBound === 'true') return;
    input.dataset.numberBound = 'true';

    const sanitise = () => {
      const decimals = Number(input.dataset.decimals || '2');
      const allowNegative = input.dataset.allowNegative === 'true';
      const raw = String(input.value || '').replace(/,/g, '.');
      let result = '';
      let hasDecimal = false;
      let decimalCount = 0;

      for (let index = 0; index < raw.length; index += 1) {
        const character = raw[index];

        if (character >= '0' && character <= '9') {
          if (!hasDecimal) {
            result += character;
          } else if (decimalCount < decimals) {
            result += character;
            decimalCount += 1;
          }
          continue;
        }

        if (character === '.' && decimals > 0 && !hasDecimal) {
          result += character;
          hasDecimal = true;
          continue;
        }

        if (character === '-' && allowNegative && index === 0 && !result.includes('-')) {
          result = `-${result}`;
        }
      }

      if (result !== input.value) input.value = result;
      input.setCustomValidity('');
    };

    input.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const allowedKeys = ['Backspace', 'Tab', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'];
      if (allowedKeys.includes(event.key)) return;

      const decimals = Number(input.dataset.decimals || '2');
      const allowNegative = input.dataset.allowNegative === 'true';
      const selectionStart = input.selectionStart ?? 0;
      const selectionEnd = input.selectionEnd ?? 0;
      const currentValue = input.value || '';

      if (/^\d$/.test(event.key)) return;

      if (event.key === '.' && decimals > 0) {
        const nextValue = currentValue.slice(0, selectionStart) + '.' + currentValue.slice(selectionEnd);
        if (nextValue.split('.').length <= 2) return;
      }

      if (event.key === '-' && allowNegative && selectionStart === 0 && !currentValue.includes('-')) return;

      event.preventDefault();
    });

    input.addEventListener(
      'wheel',
      (event) => {
        if (document.activeElement !== input) return;

        event.preventDefault();
        input.blur();
        scrollWheelTarget(input, event.deltaX, event.deltaY);
      },
      { passive: false }
    );

    input.addEventListener('input', sanitise);
    input.addEventListener('paste', () => window.setTimeout(sanitise, 0));
    sanitise();
  });
}

function scrollWheelTarget(input, deltaX, deltaY) {
  const container = findScrollableAncestor(input);
  if (container) {
    container.scrollBy({ left: deltaX, top: deltaY, behavior: 'auto' });
    return;
  }

  window.scrollBy({ left: deltaX, top: deltaY, behavior: 'auto' });
}

function findScrollableAncestor(element) {
  let current = element.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    const canScrollY = /(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight;
    const canScrollX = /(auto|scroll)/.test(style.overflowX) && current.scrollWidth > current.clientWidth;
    if (canScrollY || canScrollX) return current;
    current = current.parentElement;
  }
  return null;
}

function wireSplitSliders(root = document) {
  root.querySelectorAll('[data-split-slider]').forEach((slider) => {
    if (!(slider instanceof HTMLInputElement)) return;
    const container = slider.closest('.split-slider-card');
    if (!(container instanceof HTMLElement)) return;

    const secondaryInput = container.querySelector('[data-split-secondary-input]');
    const primaryOutput = container.querySelector('[data-split-primary-output]');
    const secondaryOutput = container.querySelector('[data-split-secondary-output]');
    const primaryAmount = container.querySelector('[data-split-primary-amount]');
    const secondaryAmount = container.querySelector('[data-split-secondary-amount]');
    const amountInput = slider.form?.querySelector('[data-split-amount-source]');

    const sync = () => {
      let primary = Number(slider.value || '50');
      if (!Number.isFinite(primary)) primary = 50;
      primary = Math.min(100, Math.max(0, Math.round(primary * 100) / 100));
      const secondary = Math.round((100 - primary) * 100) / 100;
      const totalAmount = amountInput instanceof HTMLInputElement ? Number.parseFloat(String(amountInput.value || '0').replace(/,/g, '.')) || 0 : 0;
      const primaryAmountValue = totalAmount * (primary / 100);
      const secondaryAmountValue = totalAmount * (secondary / 100);

      slider.value = String(primary);
      slider.style.setProperty('--split-value', `${primary}%`);
      if (secondaryInput instanceof HTMLInputElement) secondaryInput.value = String(secondary);
      if (primaryOutput instanceof HTMLElement) primaryOutput.textContent = formatSplitPercent(primary);
      if (secondaryOutput instanceof HTMLElement) secondaryOutput.textContent = formatSplitPercent(secondary);
      if (primaryAmount instanceof HTMLElement) primaryAmount.textContent = formatSplitCurrency(primaryAmountValue);
      if (secondaryAmount instanceof HTMLElement) secondaryAmount.textContent = formatSplitCurrency(secondaryAmountValue);
    };

    if (slider.dataset.splitBound !== 'true') {
      slider.dataset.splitBound = 'true';
      slider.addEventListener('input', sync);
      slider.addEventListener('change', sync);
      if (amountInput instanceof HTMLInputElement) {
        amountInput.addEventListener('input', sync);
        amountInput.addEventListener('change', sync);
      }
    }

    sync();
  });
}

function formatSplitPercent(value) {
  const rounded = Math.round(Number(value || 0) * 100) / 100;
  if (Number.isInteger(rounded)) return `${rounded}%`;
  return `${String(rounded).replace(/(?:\\.0+|(\\.\\d+?)0+)$/, '$1')}%`;
}

function formatSplitCurrency(value) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function wireTransactionCategorySelects(root = document) {
  root.querySelectorAll('select[data-transaction-category-select]').forEach((select) => {
    if (!(select instanceof HTMLSelectElement)) return;
    const group = select.closest('[data-transaction-category-group]');
    const form = select.closest('form');
    const typeSelect = group?.querySelector('[data-transaction-type-select]') || form?.querySelector('[data-transaction-type-select]');
    if (!(typeSelect instanceof HTMLSelectElement)) return;

    const allowedKindsForType = (type) => {
      if (type === 'income') return ['income'];
      if (type === 'savings') return ['savings'];
      return ['expense', 'debt'];
    };

    const update = () => {
      const allowedKinds = allowedKindsForType(typeSelect.value);
      let selectedStillVisible = false;

      [...select.options].forEach((option) => {
        const kind = option.dataset.kind || '';
        const isPlaceholder = !option.value;
        const visible = isPlaceholder || allowedKinds.includes(kind);
        option.hidden = !visible;
        option.disabled = !visible;
        if (visible && option.value === select.value) selectedStillVisible = true;
      });

      if (!selectedStillVisible) {
        const firstVisible = [...select.options].find((option) => !option.disabled);
        select.value = firstVisible?.value || '';
      }
    };

    if (select.dataset.transactionCategoryBound !== 'true') {
      select.dataset.transactionCategoryBound = 'true';
      typeSelect.addEventListener('change', update);
      typeSelect.addEventListener('input', update);
    }

    update();
  });
}

function wireSpendingWarningSelects(root = document) {
  root.querySelectorAll('select[data-spending-warning-select]').forEach((select) => {
    if (!(select instanceof HTMLSelectElement)) return;
    const warning = select.closest('form, .form-section, fieldset')?.querySelector('[data-spending-duplicate-warning]');
    if (!(warning instanceof HTMLElement)) return;

    const parseIds = (value) =>
      new Set(
        String(value || '')
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      );

    const typeFieldName = select.dataset.spendingTypeSource || '';
    const typeField =
      (typeFieldName && select.closest('form')?.querySelector(`[name="${CSS.escape(typeFieldName)}"]`)) || null;
    const regularDuplicateIds = parseIds(select.dataset.warningRegularCategoryIds);
    const variableDuplicateIds = parseIds(select.dataset.warningVariableCategoryIds);
    const regularMessage = select.dataset.warningRegularMessage || '';
    const variableMessage = select.dataset.warningVariableMessage || '';

    const update = () => {
      const mode = typeField instanceof HTMLSelectElement ? typeField.value : '';
      const duplicateIds = mode === 'variable_estimate' ? variableDuplicateIds : regularDuplicateIds;
      const message = mode === 'variable_estimate' ? variableMessage : regularMessage;
      const show = Boolean(select.value) && duplicateIds.has(select.value) && Boolean(message);
      warning.hidden = !show;
      warning.textContent = show ? message : '';
    };

    if (select.dataset.spendingWarningBound !== 'true') {
      select.dataset.spendingWarningBound = 'true';
      select.addEventListener('change', update);
      select.addEventListener('input', update);
      if (typeField instanceof HTMLSelectElement) {
        typeField.addEventListener('change', update);
        typeField.addEventListener('input', update);
      }
    }

    update();
  });
}

function wireMobileNav(root = document) {
  const nav = root.querySelector('.site-nav');
  const toggle = root.querySelector('[data-mobile-nav-toggle]');
  const panel = root.querySelector('[data-mobile-nav-panel]');
  if (!(nav instanceof HTMLElement) || !(toggle instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) return;

  const closeNav = () => {
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
  };

  const openNav = () => {
    nav.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
  };

  toggle.addEventListener('click', () => {
    if (nav.classList.contains('is-open')) {
      closeNav();
    } else {
      openNav();
    }
  });

  panel.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeNav);
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Node)) return;
    if (!nav.contains(event.target)) closeNav();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeNav();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeNav();
  });
}
