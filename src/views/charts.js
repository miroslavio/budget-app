import { pieChartSegments } from '../services/chartService.js';
import { monthLabel } from '../utils/dates.js';
import { formatCurrency, formatSignedCurrency } from './html.js';
import { escapeHtml } from './html.js';

export function pieChart(series, { title = 'Expenses', emptyMessage = 'No expense data yet.' } = {}) {
  const { total, segments } = pieChartSegments(series);
  if (!segments.length) return `<div class="chart-empty">${escapeHtml(emptyMessage)}</div>`;

  const radius = 95;
  const centre = 110;

  return `<div class="pie-chart-block" role="img" aria-label="${escapeHtml(title)} pie chart">
    <svg class="pie-chart" viewBox="0 0 220 220" aria-hidden="true">
      ${segments
        .map((segment, index) => {
          const tooltip = `${segment.label}\nAmount: ${formatCurrency(segment.value)}\nShare of expected spending: ${Math.round(segment.percentage * 100)}%`;
          if (segment.percentage >= 0.999999) {
            return `<circle cx="${centre}" cy="${centre}" r="${radius}" fill="${segment.colour}" tabindex="0" data-chart-tooltip="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}"></circle>`;
          }
          const start = pointOnCircle(centre, centre, radius, segment.start);
          const end = pointOnCircle(centre, centre, radius, segment.end);
          const path = `M ${centre} ${centre} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${segment.largeArc} 1 ${end.x} ${end.y} Z`;
          return `<path d="${path}" fill="${segment.colour}" tabindex="0" data-chart-tooltip="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}"></path>`;
        })
        .join('')}
      <circle cx="${centre}" cy="${centre}" r="52" class="pie-hole"></circle>
      <text x="${centre}" y="${centre - 5}" text-anchor="middle" class="pie-total-label">Total</text>
      <text x="${centre}" y="${centre + 18}" text-anchor="middle" class="pie-total-value">${formatCurrency(total)}</text>
    </svg>
    <div class="chart-legend">
      ${segments
        .map(
          (segment, index) => `<div class="legend-row">
            <span class="legend-swatch swatch-${index % 8}"></span>
            <span>${escapeHtml(segment.label)}</span>
            <strong>${formatCurrency(segment.value)} · ${Math.round(segment.percentage * 100)}%</strong>
          </div>`
        )
        .join('')}
    </div>
  </div>`;
}

export function cashflowForecastChart(forecast) {
  if (!forecast.length) return '<div class="chart-empty">No forecast data yet.</div>';

  const width = 920;
  const height = 340;
  const padding = { top: 24, right: 28, bottom: 54, left: 92 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = forecast.flatMap((row) => [row.openingBalancePence, row.closingBalancePence]);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawRange = rawMax - rawMin;
  const pad = Math.max(10_000, rawRange ? rawRange * 0.12 : Math.max(Math.abs(rawMax || 0), 50_000) * 0.12);
  const minValue = rawMin - pad;
  const maxValue = rawMax + pad;
  const range = maxValue - minValue || 1;
  const step = plotWidth / Math.max(1, forecast.length);
  const guideValues = [maxValue, minValue + range / 2, minValue];
  const linePoints = forecast.map((row, index) => {
    const x = padding.left + step * index + step / 2;
    const y = yFor(row.closingBalancePence, minValue, range, padding, plotHeight);
    return `${round(x)},${round(y)}`;
  });
  const areaPoints = [
    `${padding.left + step / 2},${height - padding.bottom}`,
    ...linePoints,
    `${padding.left + step * (forecast.length - 1) + step / 2},${height - padding.bottom}`
  ].join(' ');

  return `<div class="cashflow-chart-block" role="img" aria-label="Projected closing balance chart">
    <svg class="cashflow-chart" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      ${guideValues
        .map((value) => {
          const y = yFor(value, minValue, range, padding, plotHeight);
          return `<line class="guide-line" x1="${padding.left}" y1="${round(y)}" x2="${width - padding.right}" y2="${round(y)}"></line>
            <text class="axis-label" x="12" y="${round(y + 4)}">${formatCurrency(Math.round(value))}</text>`;
        })
        .join('')}
      <polyline class="closing-area" points="${areaPoints}"></polyline>
      <polyline class="closing-line" points="${linePoints.join(' ')}"></polyline>
      ${forecast
        .map((row, index) => {
          const x = padding.left + step * index + step / 2;
          const y = yFor(row.closingBalancePence, minValue, range, padding, plotHeight);
          return `<g>
            <circle class="closing-hit" cx="${round(x)}" cy="${round(y)}" r="16" tabindex="0" data-chart-tooltip="${escapeHtml(forecastTooltip(row))}" aria-label="${escapeHtml(forecastTooltip(row))}">
              <title>${forecastTooltip(row)}</title>
            </circle>
            <circle class="closing-point" cx="${round(x)}" cy="${round(y)}" r="4"></circle>
          </g>`;
        })
        .join('')}
      ${forecast
        .filter((_, index) => index % Math.ceil(forecast.length / 6) === 0)
        .map((row) => {
          const originalIndex = forecast.indexOf(row);
          const x = padding.left + step * originalIndex + step / 2;
          return `<text class="month-label" x="${round(x)}" y="${height - 20}" text-anchor="middle">${escapeHtml(shortMonth(row.month))}</text>`;
        })
        .join('')}
    </svg>
    <div class="chart-legend forecast-legend">
      <div class="legend-row simple"><span class="legend-line"></span><span>Projected closing balance</span></div>
    </div>
  </div>`;
}

export function savingsProjectionChart(projection, { emptyMessage = 'No projected savings data yet.' } = {}) {
  if (!projection.months.length) return `<div class="chart-empty">${escapeHtml(emptyMessage)}</div>`;

  const width = 920;
  const height = 360;
  const padding = { top: 24, right: 28, bottom: 54, left: 86 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const cumulativeRows = buildSavingsProjectionSeries(projection.months);
  const values = cumulativeRows.flatMap((row) => [row.totalPence]);
  const maxValue = Math.max(0, ...values);
  const minValue = 0;
  const range = maxValue || 1;
  const step = plotWidth / Math.max(1, projection.months.length);
  const linePoints = cumulativeRows.map((row, index) => {
    const x = padding.left + step * index + step / 2;
    const y = yFor(row.totalPence, minValue, range, padding, plotHeight);
    return `${round(x)},${round(y)}`;
  });
  const areaPoints = [
    `${padding.left + step / 2},${height - padding.bottom}`,
    ...linePoints,
    `${padding.left + step * (cumulativeRows.length - 1) + step / 2},${height - padding.bottom}`
  ].join(' ');
  const yTicks = buildCurrencyTicks(maxValue, 5);

  return `<div class="cashflow-chart-block" role="img" aria-label="Projected savings balances chart">
    <svg class="cashflow-chart" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      ${yTicks
        .map((value) => {
          const y = yFor(value, minValue, range, padding, plotHeight);
          return `<line class="guide-line" x1="${padding.left}" y1="${round(y)}" x2="${width - padding.right}" y2="${round(y)}"></line>
            <text class="axis-label" x="12" y="${round(y + 4)}">${formatAxisCurrency(value)}</text>`;
        })
        .join('')}
      <line class="axis-line" x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}"></line>
      <polyline class="closing-area savings-area" points="${areaPoints}"></polyline>
      <polyline class="savings-line" points="${linePoints.join(' ')}"></polyline>
      ${cumulativeRows
        .map((row, index) => {
          const x = padding.left + step * index + step / 2;
          const y = yFor(row.totalPence, minValue, range, padding, plotHeight);
          return `<g>
            <rect class="closing-hit" x="${round(x - step / 2)}" y="${padding.top}" width="${round(step)}" height="${plotHeight}" tabindex="0" data-chart-tooltip="${escapeHtml(savingsProjectionTooltip(row))}" aria-label="${escapeHtml(savingsProjectionTooltip(row))}">
              <title>${savingsProjectionTooltip(row)}</title>
            </rect>
            <circle class="savings-point" cx="${round(x)}" cy="${round(y)}" r="4"></circle>
          </g>`;
        })
        .join('')}
      ${cumulativeRows
        .map((row) => {
          const originalIndex = cumulativeRows.indexOf(row);
          const x = padding.left + step * originalIndex + step / 2;
          return `<text class="month-label" x="${round(x)}" y="${height - 20}" text-anchor="middle">${escapeHtml(shortMonth(row.month))}</text>`;
        })
        .join('')}
    </svg>
    <div class="chart-legend forecast-legend">
      <div class="legend-row simple"><span class="legend-line savings-line-key"></span><span>Projected balance</span></div>
    </div>
    <table class="data-table chart-data-table">
      <thead><tr><th>Month</th><th>Projected balance</th></tr></thead>
      <tbody>${cumulativeRows
        .map((row) => `<tr><td>${escapeHtml(monthLabel(row.month))}</td><td>${formatCurrency(row.totalPence)}</td></tr>`)
        .join('')}</tbody>
    </table>
  </div>`;
}

function buildSavingsProjectionSeries(months) {
  if (!months.length) return [];
  const startingBalancePence = Number(months[0].openingBalancePence || 0);
  let personalContributionPence = 0;
  let topUpsPence = 0;
  let growthPence = 0;

  return months.map((row) => {
    personalContributionPence += Number(row.personalContributionPence || 0);
      topUpsPence += Number(row.employerContributionPence || 0) + Number(row.bonusPence || 0);
      growthPence += Number(row.growthPence || 0);
      return {
        month: row.month,
        startingBalancePence,
        personalContributionPence,
        topUpsPence,
        growthPence,
        totalPence: startingBalancePence + personalContributionPence + topUpsPence + growthPence,
        accounts: row.accounts || []
      };
  });
}

function buildCurrencyTicks(maxValue, count = 5) {
  const safeMax = Math.max(0, Number(maxValue || 0));
  const rawStep = safeMax / Math.max(1, count - 1);
  const step = niceCurrencyStep(rawStep || 1000);
  const top = Math.max(step * (count - 1), Math.ceil(safeMax / step) * step);
  const ticks = [];
  for (let value = 0; value <= top; value += step) {
    ticks.push(value);
  }
  return ticks;
}

function niceCurrencyStep(value) {
  const safeValue = Math.max(1, Number(value || 1));
  const exponent = Math.pow(10, Math.floor(Math.log10(safeValue)));
  const fraction = safeValue / exponent;
  if (fraction <= 1) return 1 * exponent;
  if (fraction <= 2) return 2 * exponent;
  if (fraction <= 5) return 5 * exponent;
  return 10 * exponent;
}

function formatAxisCurrency(pence) {
  const pounds = Math.round(Number(pence || 0) / 100);
  if (Math.abs(pounds) >= 1000) {
    const thousands = pounds / 1000;
    const text = Number.isInteger(thousands) ? `${thousands}` : thousands.toFixed(1).replace(/\.0$/, '');
    return `£${text}k`;
  }
  return `£${pounds}`;
}

function pointOnCircle(cx, cy, radius, percentage) {
  const angle = percentage * Math.PI * 2 - Math.PI / 2;
  return {
    x: round(cx + radius * Math.cos(angle)),
    y: round(cy + radius * Math.sin(angle))
  };
}

function round(value) {
  return Number(value.toFixed(3));
}

function yFor(value, minValue, range, padding, plotHeight) {
  return padding.top + (1 - (value - minValue) / range) * plotHeight;
}

function shortMonth(month) {
  const [name, year] = monthLabel(month).split(' ');
  return `${name.slice(0, 3)} ${year.slice(2)}`;
}

function forecastTooltip(row) {
  return [
    monthLabel(row.month),
    `Opening balance: ${formatCurrency(row.openingBalancePence)}`,
    `Planned income: ${formatCurrency(row.expectedIncomePence)}`,
    `Planned spending: -${formatCurrency(row.expectedExpensesPence)}`,
    `Planned savings: -${formatCurrency(row.expectedSavingsPence)}`,
    `Projected closing balance: ${formatCurrency(row.closingBalancePence)}`
  ].join('\n');
}

function savingsProjectionTooltip(row) {
  const accountLines = (row.accounts || [])
    .map((account) => `${account.name}: ${formatCurrency(account.closingBalancePence)}`);
  return [
    monthLabel(row.month),
    `Total projected balance: ${formatCurrency(row.totalPence)}`,
    ...accountLines,
    `Personal contributions to date: ${formatCurrency(row.personalContributionPence)}`,
    `Employer and LISA top-ups to date: ${formatCurrency(row.topUpsPence)}`,
    `Projected growth / interest to date: ${formatCurrency(row.growthPence)}`,
    `Projected balance: ${formatCurrency(row.totalPence)}`
  ].join('\n');
}
