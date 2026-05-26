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
        .map((segment) => {
          if (segment.percentage >= 0.999999) {
            return `<circle cx="${centre}" cy="${centre}" r="${radius}" fill="${segment.colour}"></circle>`;
          }
          const start = pointOnCircle(centre, centre, radius, segment.start);
          const end = pointOnCircle(centre, centre, radius, segment.end);
          const path = `M ${centre} ${centre} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${segment.largeArc} 1 ${end.x} ${end.y} Z`;
          return `<path d="${path}" fill="${segment.colour}"></path>`;
        })
        .join('')}
      <circle cx="${centre}" cy="${centre}" r="52" class="pie-hole"></circle>
      <text x="${centre}" y="${centre - 5}" text-anchor="middle" class="pie-total-label">Total</text>
      <text x="${centre}" y="${centre + 18}" text-anchor="middle" class="pie-total-value">${formatCurrency(total)}</text>
    </svg>
    <div class="chart-legend">
      ${segments
        .map(
          (segment) => `<div class="legend-row">
            <span class="legend-swatch swatch-${segments.indexOf(segment) % 8}"></span>
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
            <circle class="closing-hit" cx="${round(x)}" cy="${round(y)}" r="16">
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
  const height = 320;
  const padding = { top: 24, right: 28, bottom: 54, left: 86 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = projection.months.flatMap((row) => [row.openingBalancePence, row.closingBalancePence]);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const range = maxValue - minValue || 1;
  const step = plotWidth / Math.max(1, projection.months.length);
  const linePoints = projection.months.map((row, index) => {
    const x = padding.left + step * index + step / 2;
    const y = yFor(row.closingBalancePence, minValue, range, padding, plotHeight);
    return `${round(x)},${round(y)}`;
  });

  return `<div class="cashflow-chart-block" role="img" aria-label="Projected savings balances chart">
    <svg class="cashflow-chart" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <line class="axis-line" x1="${padding.left}" y1="${yFor(0, minValue, range, padding, plotHeight)}" x2="${width - padding.right}" y2="${yFor(0, minValue, range, padding, plotHeight)}"></line>
      <text class="axis-label" x="12" y="${yFor(0, minValue, range, padding, plotHeight) + 4}">${formatCurrency(0)}</text>
      <polyline class="savings-line" points="${linePoints.join(' ')}"></polyline>
      ${projection.months
        .map((row, index) => {
          const x = padding.left + step * index + step / 2;
          const y = yFor(row.closingBalancePence, minValue, range, padding, plotHeight);
          return `<circle class="savings-point" cx="${round(x)}" cy="${round(y)}" r="4"></circle>`;
        })
        .join('')}
      ${projection.months
        .filter((_, index) => index % Math.ceil(projection.months.length / 6) === 0)
        .map((row) => {
          const originalIndex = projection.months.indexOf(row);
          const x = padding.left + step * originalIndex + step / 2;
          return `<text class="month-label" x="${round(x)}" y="${height - 20}" text-anchor="middle">${escapeHtml(shortMonth(row.month))}</text>`;
        })
        .join('')}
    </svg>
    <div class="chart-legend forecast-legend">
      <div class="legend-row"><span class="legend-line savings-line-key"></span><span>Tracked balances</span><strong>${formatCurrency(projection.months[projection.months.length - 1].closingBalancePence)}</strong></div>
      <div class="legend-row"><span class="legend-swatch forecast-positive"></span><span>Personal contributions</span><strong>${formatCurrency(totalSavingsPersonalContributions(projection.months))}</strong></div>
      <div class="legend-row"><span class="legend-swatch savings-extra"></span><span>Employer and LISA top-ups</span><strong>${formatCurrency(totalSavingsExtraAdditions(projection.months))}</strong></div>
      <div class="legend-row"><span class="legend-swatch savings-growth"></span><span>Projected growth / interest</span><strong>${formatCurrency(totalSavingsGrowth(projection.months))}</strong></div>
    </div>
  </div>`;
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
    `Income: ${formatCurrency(row.expectedIncomePence)}`,
    `Expenses: ${formatCurrency(row.expectedExpensesPence)}`,
    `Savings: ${formatCurrency(row.expectedSavingsPence)}`,
    `Net movement: ${formatSignedCurrency(row.netMovementPence)}`,
    `Projected closing balance: ${formatCurrency(row.closingBalancePence)}`
  ].join('\n');
}

function totalSavingsPersonalContributions(months) {
  return months.reduce((sum, row) => sum + Number(row.personalContributionPence || 0), 0);
}

function totalSavingsExtraAdditions(months) {
  return months.reduce((sum, row) => sum + Number(row.employerContributionPence || 0) + Number(row.bonusPence || 0), 0);
}

function totalSavingsGrowth(months) {
  return months.reduce((sum, row) => sum + Number(row.growthPence || 0), 0);
}
