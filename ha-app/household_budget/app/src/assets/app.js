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
  wireMobileCardSorts();
  wireTableSearches();
  wireCountUps();
  wireECharts();
  wireChartTooltips();
  wireNumberInputs();
  wireSplitSliders();
  wireTransactionCategorySelects();
  wireSpendingWarningSelects();
  wireIncomeEstimateForms();
  wireSavingsProjectionForms();
  wireSteppedForms();
  wireMonthPickers();
  wireConfirmActions();
  wireModals();
  wireMobileNav();
});

function wireECharts(root = document) {
  if (!window.echarts) return;
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const compactMedia = window.matchMedia?.('(max-width: 980px)');

  root.querySelectorAll('[data-echarts-chart]').forEach((element) => {
    if (!(element instanceof HTMLElement) || element.dataset.echartsBound === 'true') return;
    element.dataset.echartsBound = 'true';

    let config;
    try {
      config = JSON.parse(element.dataset.chartConfig || '{}');
    } catch {
      return;
    }

    const chart = window.echarts.init(element, null, { renderer: 'svg' });
    const render = () => {
      const compact = Boolean(compactMedia?.matches);
      const option = chartOptionForElement(element, config, { compact, reducedMotion: prefersReducedMotion });
      chart.setOption(option, true);
      chart.resize();
    };

    render();

    if (compactMedia?.addEventListener) {
      compactMedia.addEventListener('change', render);
    }

    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => chart.resize());
      observer.observe(element);
    } else {
      window.addEventListener('resize', () => chart.resize());
    }
  });
}

function chartOptionForElement(element, config, { compact = false, reducedMotion = false } = {}) {
  switch (element.dataset.chartType) {
    case 'income-allocation':
      return incomeAllocationChartOption(config, { compact, reducedMotion });
    case 'dashboard-spending-pressure':
      return dashboardSpendingPressureChartOption(config, { reducedMotion });
    case 'dashboard-savings-allocation':
      return dashboardSavingsAllocationChartOption(config, { reducedMotion });
    case 'planned-spending-owner':
      return plannedSpendingOwnerChartOption(config, { reducedMotion });
    default:
      return { ...config, animation: !reducedMotion };
  }
}

function incomeAllocationChartOption(config, { compact = false, reducedMotion = false } = {}) {
  const option = {
    ...config,
    animation: !reducedMotion,
    tooltip: {
      trigger: 'item',
      renderMode: 'richText',
      formatter(params) {
        const data = params.data || {};
        if (params.dataType !== 'edge') {
          return data.displayLabel || params.name || '';
        }
        return [
          `${data.source || ''} -> ${data.target || ''}`,
          formatCurrencyFromPence(Number(data.valuePence || 0)),
          `${Number(data.percentageOfIncome || 0)}% of planned income`
        ].join('\n');
      }
    }
  };

  if (compact) {
    option.series = (option.series || []).map((series) => ({
      ...series,
      nodeGap: 12,
      nodeWidth: 14,
      left: 8,
      right: 8,
      top: 10,
      bottom: 10,
      orient: 'vertical',
      label: {
        ...(series.label || {}),
        formatter(params) {
          return params.data?.displayLabel || params.name || '';
        },
        fontSize: 12,
        lineHeight: 15,
        position: 'inside',
        overflow: 'break',
        width: 118
      }
    }));
  } else {
    option.series = (option.series || []).map((series) => ({
      ...series,
      left: 20,
      right: 165,
      top: 20,
      bottom: 18,
      label: {
        ...(series.label || {}),
        formatter(params) {
          return params.data?.displayLabel || params.name || '';
        },
        position: 'right',
        width: 148,
        overflow: 'break'
      }
    }));
  }

  return option;
}

function dashboardSpendingPressureChartOption(config, { reducedMotion = false } = {}) {
  return {
    ...config,
    animation: !reducedMotion,
    tooltip: {
      trigger: 'item',
      renderMode: 'richText',
      formatter(params) {
        const data = params.data || {};
        return [
          data.name || params.name || 'Planned spending',
          formatCurrencyFromPence(Number(data.valuePence || 0)),
          `${Number(data.percentage || 0)}% of planned spending`
        ].join('\n');
      }
    },
    series: (config.series || []).map((series) => ({
      ...series,
      label: {
        show: true,
        position: 'right',
        color: '#5e6b63',
        fontWeight: 800,
        formatter(params) {
          const data = params.data || {};
          return `${formatCurrencyFromPence(Number(data.valuePence || 0))} · ${Number(data.percentage || 0)}%`;
        }
      }
    }))
  };
}

function dashboardSavingsAllocationChartOption(config, { reducedMotion = false } = {}) {
  const series = config.series || [];
  return {
    ...config,
    animation: !reducedMotion,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      renderMode: 'richText',
      formatter(params) {
        const entries = Array.isArray(params) ? params : [params];
        const first = entries[0]?.data || {};
        const fromIncome = entries.find((entry) => entry.seriesName === 'From income')?.data?.valuePence || 0;
        const employer = entries.find((entry) => entry.seriesName === 'Employer contribution')?.data?.valuePence || 0;
        const lines = [
          first.name || entries[0]?.name || 'Savings pot',
          `Total contribution: ${formatCurrencyFromPence(Number(first.totalPence || Number(fromIncome) + Number(employer)))}`,
          `From income: ${formatCurrencyFromPence(Number(fromIncome))}`
        ];
        if (Number(employer) > 0) {
          lines.push(`Employer contribution: ${formatCurrencyFromPence(Number(employer))}`);
        }
        return lines.join('\n');
      }
    },
    series: series.map((seriesItem, index) => {
      const isLastSeries = index === series.length - 1;
      return {
        ...seriesItem,
        label: isLastSeries
          ? {
              show: true,
              position: 'right',
              color: '#5e6b63',
              fontWeight: 800,
              formatter(params) {
                return formatCurrencyFromPence(Number(params.data?.totalPence || 0));
              }
            }
          : { show: false }
      };
    })
  };
}

function plannedSpendingOwnerChartOption(config, { reducedMotion = false } = {}) {
  const series = config.series || [];
  return {
    ...config,
    animation: !reducedMotion,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      renderMode: 'richText',
      formatter(params) {
        const entries = Array.isArray(params) ? params : [params];
        const first = entries[0]?.data || {};
        const lines = [
          first.name || entries[0]?.name || 'Category',
          `Total planned spending: ${formatCurrencyFromPence(Number(first.categoryTotalPence || 0))}`,
          `${Number(first.totalPercentage || 0)}% of planned spending`
        ];
        for (const entry of entries) {
          const data = entry.data || {};
          if (Number(data.valuePence || 0) <= 0) continue;
          lines.push(`${entry.seriesName}: ${formatCurrencyFromPence(Number(data.valuePence || 0))} (${Number(data.categorySharePercentage || 0)}% of category)`);
        }
        return lines.join('\n');
      }
    },
    series: series.map((seriesItem) => ({
      ...seriesItem,
      label: {
        show: true,
        position: 'right',
        color: '#5e6b63',
        fontWeight: 800,
        formatter(params) {
          const data = params.data || {};
          if (!data.isLabelCarrier) return '';
          return `${formatCurrencyFromPence(Number(data.categoryTotalPence || 0))} · ${Number(data.totalPercentage || 0)}%`;
        }
      }
    }))
  };
}

function wireCountUps(root = document) {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  root.querySelectorAll('[data-countup-value]').forEach((element) => {
    if (!(element instanceof HTMLElement) || element.dataset.countupBound === 'true') return;
    element.dataset.countupBound = 'true';
    const targetValue = Number(element.dataset.countupValue || 0);
    const kind = element.dataset.countupKind || 'currency';
    const delay = Math.max(0, Number(element.dataset.countupDelay || 0));

    if (!Number.isFinite(targetValue) || prefersReducedMotion) {
      element.textContent = formatCountupValue(targetValue, kind);
      return;
    }

    const duration = 680;
    const start = performance.now();
    const fromValue = 0;

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentValue = fromValue + (targetValue - fromValue) * eased;
      element.textContent = formatCountupValue(currentValue, kind, progress < 1);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        element.textContent = formatCountupValue(targetValue, kind);
      }
    };

    window.setTimeout(() => requestAnimationFrame(tick), delay);
  });
}

function formatCountupValue(value, kind, isAnimating = false) {
  const safeValue = Number.isFinite(value) ? value : 0;
  switch (kind) {
    case 'integer':
      return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(Math.round(safeValue));
    case 'percentage':
      return `${Math.round(safeValue)}%`;
    case 'currency':
    default: {
      const amount = safeValue / 100;
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(isAnimating ? amount : Math.round(safeValue) / 100);
    }
  }
}

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

function wireMobileCardSorts(root = document) {
  root.querySelectorAll('[data-mobile-card-sort]').forEach((control) => {
    if (!(control instanceof HTMLSelectElement) || control.dataset.mobileSortBound === 'true') return;
    const listId = control.dataset.mobileCardSort || '';
    const list = listId ? root.getElementById?.(listId) || document.getElementById(listId) : null;
    if (!(list instanceof HTMLElement)) return;
    control.dataset.mobileSortBound = 'true';

    const sortCards = () => {
      const [key, direction = 'asc'] = String(control.value || '').split(':');
      if (!key) return;
      const cards = [...list.querySelectorAll('[data-mobile-sort-card]')].filter((card) => card instanceof HTMLElement);
      cards.sort((a, b) => compareMobileCardValues(a, b, key, direction));
      cards.forEach((card) => list.appendChild(card));
    };

    control.addEventListener('change', sortCards);
    sortCards();
  });
}

function wireTableSearches(root = document) {
  const responsiveWrappers = [...root.querySelectorAll('.desktop-table-wrapper')].filter((wrapper) => wrapper instanceof HTMLElement);
  responsiveWrappers.forEach((wrapper, index) => {
    const table = wrapper.querySelector('table.data-table');
    if (!(table instanceof HTMLTableElement) || wrapper.dataset.tableSearchBound === 'true') return;
    wrapper.dataset.tableSearchBound = 'true';
    const mobileRegion = wrapper.nextElementSibling instanceof HTMLElement && wrapper.nextElementSibling.classList.contains('mobile-card-region')
      ? wrapper.nextElementSibling
      : null;
    const control = buildTableSearchControl(`responsive-table-search-${index}`, table);
    wrapper.parentElement?.insertBefore(control, wrapper);
    const input = control.querySelector('input');
    if (input instanceof HTMLInputElement) {
      input.addEventListener('input', () => filterTableAndCards(table, mobileRegion, input.value));
    }
  });

  root.querySelectorAll('table.data-table').forEach((table, index) => {
    if (!(table instanceof HTMLTableElement)) return;
    if (table.closest('.desktop-table-wrapper')) return;
    if (table.dataset.tableSearchBound === 'true') return;
    table.dataset.tableSearchBound = 'true';
    const control = buildTableSearchControl(`standalone-table-search-${index}`, table);
    table.parentElement?.insertBefore(control, table);
    const input = control.querySelector('input');
    if (input instanceof HTMLInputElement) {
      input.addEventListener('input', () => filterTableAndCards(table, null, input.value));
    }
  });
}

function buildTableSearchControl(id, table) {
  const control = document.createElement('div');
  control.className = 'table-search-control';
  const caption = table.closest('.card')?.querySelector('h2, h3')?.textContent?.trim();
  const label = caption ? `Search ${caption}` : 'Search table';
  control.innerHTML = `<label for="${id}" class="sr-only">${escapeHtmlText(label)}</label><input id="${id}" type="search" placeholder="${escapeHtmlText(label)}" autocomplete="off">`;
  return control;
}

function filterTableAndCards(table, mobileRegion, query) {
  const normalisedQuery = normaliseSearchText(query);
  collectSortableRowGroups(table.tBodies?.[0]).forEach((group) => {
    const visible = !normalisedQuery || normaliseSearchText(group.map((row) => row.textContent || '').join(' ')).includes(normalisedQuery);
    group.forEach((row) => {
      row.hidden = !visible;
    });
  });

  if (mobileRegion instanceof HTMLElement) {
    mobileRegion.querySelectorAll('[data-mobile-sort-card]').forEach((card) => {
      if (!(card instanceof HTMLElement)) return;
      const visible = !normalisedQuery || normaliseSearchText(card.textContent || '').includes(normalisedQuery);
      card.hidden = !visible;
    });
  }
}

function normaliseSearchText(value) {
  return String(value || '').trim().toLowerCase();
}

function compareMobileCardValues(a, b, key, direction) {
  const sortDirection = direction === 'desc' ? 'desc' : 'asc';
  const first = readMobileCardSortValue(a, key);
  const second = readMobileCardSortValue(b, key);
  const result = typeof first === 'number' && typeof second === 'number'
    ? first - second
    : String(first).localeCompare(String(second), 'en-GB', { sensitivity: 'base', numeric: true });
  return sortDirection === 'desc' ? 0 - result : result;
}

function readMobileCardSortValue(card, key) {
  if (!(card instanceof HTMLElement)) return '';
  const value = card.dataset[`sort${capitalise(key)}`] ?? '';
  const numeric = Number(value);
  if (value !== '' && Number.isFinite(numeric)) return numeric;
  return value;
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
  if (!(tbody instanceof HTMLTableSectionElement)) return [];
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
      wireSteppedForms(dialog);
      dialog.querySelectorAll('form[data-stepped-form]').forEach((form) => {
        if (typeof form._resetSteppedForm === 'function') {
          form._resetSteppedForm();
        }
      });
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
    const errorBox = form.querySelector('[data-income-estimate-error]') || summaryRoot?.querySelector('[data-income-estimate-error]');

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
        const response = await fetch(appUrl('/income/estimate'), {
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
    if (!(form instanceof HTMLFormElement)) return;
    if (form.dataset.savingsProjectionBound === 'true') {
      if (typeof form._refreshSavingsProjection === 'function') {
        form._refreshSavingsProjection();
      }
      return;
    }
    form.dataset.savingsProjectionBound = 'true';

    const accountTypeField = form.querySelector('[name="account_type"]');
    const presetField = form.querySelector('[name="projection_preset"]');
    const customRateField = form.querySelector('[name="projected_annual_rate_custom"]');
    const hiddenRateField = form.querySelector('[name="projected_annual_rate"]');
    const hiddenRateTypeField = form.querySelector('[name="projected_rate_type"]');
    const rateTypeOverrideField = form.querySelector('[name="projected_rate_type_override"]');
    const idField = form.querySelector('[name="id"]');
    const currentBalanceField = form.querySelector('[name="current_balance"]');
    const monthlyContributionField = form.querySelector('[name="monthly_contribution"]');
    const employerContributionField = form.querySelector('[name="employer_monthly_contribution"]');
    const includeLisaBonusField = form.querySelector('[name="include_lisa_bonus"]');
    const availableForCashflowField = form.querySelector('[name="available_for_household_cashflow"]');
    const accessTypeField = form.querySelector('[name="access_type"]');
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
    let accessDirty = false;

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
      const accessDefaults = defaultSavingsAccess(accountType);
      const rateType = resolveSavingsRateType(accountType, rateTypeOverrideField instanceof HTMLSelectElement ? rateTypeOverrideField.value : 'interest');
      const rateLabelText = rateType === 'growth' ? 'Projected annual growth assumption' : 'Projected annual interest rate';

      if (!accessDirty && idField instanceof HTMLInputElement && !idField.value) {
        if (accessTypeField instanceof HTMLSelectElement) accessTypeField.value = accessDefaults.accessType;
        if (availableForCashflowField instanceof HTMLInputElement) availableForCashflowField.checked = accessDefaults.availableForHouseholdCashflow;
      }

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

    [availableForCashflowField, accessTypeField].forEach((field) => {
      if (!(field instanceof HTMLElement)) return;
      field.addEventListener('change', () => {
        accessDirty = true;
      });
      field.addEventListener('input', () => {
        accessDirty = true;
      });
    });

    form.addEventListener('submit', () => {
      const annualRate = resolveSavingsPresetRate(presetField, customRateField, hiddenRateField);
      if (hiddenRateField instanceof HTMLInputElement) hiddenRateField.value = String(annualRate);
      if (hiddenRateTypeField instanceof HTMLInputElement) {
        const accountType = accountTypeField instanceof HTMLSelectElement ? accountTypeField.value : 'current_account';
        hiddenRateTypeField.value = resolveSavingsRateType(accountType, rateTypeOverrideField instanceof HTMLSelectElement ? rateTypeOverrideField.value : 'interest');
      }
    });

    form._refreshSavingsProjection = () => {
      accessDirty = Boolean(idField instanceof HTMLInputElement && idField.value);
      updatePresetFromRate();
      update();
    };

    update();
  });
}

function wireSteppedForms(root = document) {
  root.querySelectorAll('form[data-stepped-form]').forEach((form) => {
    if (!(form instanceof HTMLFormElement)) return;
    if (form.dataset.steppedFormBound === 'true') {
      if (typeof form._refreshSteppedForm === 'function') {
        form._refreshSteppedForm();
      }
      return;
    }
    form.dataset.steppedFormBound = 'true';

    const stepTitle = form.querySelector('[data-step-title]');
    const stepCurrent = form.querySelector('[data-step-current]');
    const stepTotal = form.querySelector('[data-step-total]');
    const progressBar = form.querySelector('[data-step-progress-bar]');
    const backButton = form.querySelector('[data-step-back]');
    const nextButton = form.querySelector('[data-step-next]');
    const finalOnly = [...form.querySelectorAll('[data-show-on-final-step]')];
    const firstOnly = [...form.querySelectorAll('[data-hide-on-final-step]')];

    const getVisibleSteps = () =>
      [...form.querySelectorAll('[data-form-step]')].filter((step) => step instanceof HTMLElement && !step.hidden);

    const readCurrentStep = () => {
      const steps = getVisibleSteps();
      if (!steps.length) return { steps, index: 0 };
      const rawIndex = Number(form.dataset.currentStep || 0);
      return { steps, index: Math.min(Math.max(rawIndex, 0), steps.length - 1) };
    };

    const render = () => {
      const { steps } = readCurrentStep();
      let { index } = readCurrentStep();
      if (!steps.length) return;

      const currentStepId = form.dataset.currentStepId || '';
      const matchingIndex = steps.findIndex((step) => step.dataset.stepId === currentStepId);
      if (matchingIndex >= 0) index = matchingIndex;
      form.dataset.currentStep = String(index);
      form.dataset.currentStepId = steps[index].dataset.stepId || '';

      steps.forEach((step, stepIndex) => {
        step.classList.toggle('form-step-inactive', stepIndex !== index);
        step.setAttribute('aria-hidden', stepIndex !== index ? 'true' : 'false');
      });

      if (stepTitle instanceof HTMLElement) {
        stepTitle.textContent = steps[index].dataset.stepTitle || `Step ${index + 1}`;
      }
      if (stepCurrent instanceof HTMLElement) stepCurrent.textContent = String(index + 1);
      if (stepTotal instanceof HTMLElement) stepTotal.textContent = String(steps.length);
      if (progressBar instanceof HTMLElement) {
        const percentage = steps.length > 1 ? ((index + 1) / steps.length) * 100 : 100;
        progressBar.style.width = `${percentage}%`;
      }
      if (backButton instanceof HTMLElement) backButton.toggleAttribute('hidden', index === 0);
      if (nextButton instanceof HTMLElement) nextButton.toggleAttribute('hidden', index >= steps.length - 1);
      finalOnly.forEach((element) => element.toggleAttribute('hidden', index < steps.length - 1));
      firstOnly.forEach((element) => element.toggleAttribute('hidden', index >= steps.length - 1));
    };

    const validateStep = (step) => {
      if (!(step instanceof HTMLElement)) return true;
      const fields = [...step.querySelectorAll('input, select, textarea')].filter((field) => {
        if (!(field instanceof HTMLElement)) return false;
        if (field.closest('[hidden]')) return false;
        if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
          return !field.disabled;
        }
        return false;
      });

      for (const field of fields) {
        if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
          if (!field.reportValidity()) return false;
        }
      }
      return true;
    };

    if (backButton instanceof HTMLButtonElement) {
      backButton.addEventListener('click', () => {
        const { index } = readCurrentStep();
        form.dataset.currentStep = String(Math.max(0, index - 1));
        form.dataset.currentStepId = '';
        render();
      });
    }

    if (nextButton instanceof HTMLButtonElement) {
      nextButton.addEventListener('click', () => {
        const { steps, index } = readCurrentStep();
        const step = steps[index];
        if (!validateStep(step)) return;
        form.dataset.currentStep = String(Math.min(steps.length - 1, index + 1));
        form.dataset.currentStepId = '';
        render();
      });
    }

    form._refreshSteppedForm = render;
    form._resetSteppedForm = () => {
      form.dataset.currentStep = '0';
      form.dataset.currentStepId = '';
      render();
    };

    form.addEventListener('change', render);
    form.addEventListener('input', render);
    form.querySelectorAll('[data-form-step]').forEach((step, index) => {
      if (step instanceof HTMLElement && !step.dataset.stepId) {
        step.dataset.stepId = `step-${index + 1}`;
      }
    });

    render();
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

function defaultSavingsAccess(accountType) {
  switch (accountType) {
    case 'current_account':
    case 'easy_access_savings':
      return { accessType: 'instant_access', availableForHouseholdCashflow: true };
    case 'fixed_savings':
      return { accessType: 'notice', availableForHouseholdCashflow: false };
    case 'cash_isa':
      return { accessType: 'penalty_withdrawal', availableForHouseholdCashflow: true };
    case 'stocks_and_shares_isa':
      return { accessType: 'penalty_withdrawal', availableForHouseholdCashflow: false };
    case 'lifetime_isa':
    case 'pension':
      return { accessType: 'locked_until_age', availableForHouseholdCashflow: false };
    default:
      return { accessType: 'instant_access', availableForHouseholdCashflow: false };
  }
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

function appUrl(path) {
  const base = String(window.__APP_BASE_PATH__ || document.body?.dataset?.appBasePath || '').replace(/\/+$/, '');
  const target = String(path || '/');
  if (!base || !target.startsWith('/')) return target;
  return `${base}${target}`;
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
