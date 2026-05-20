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
  const padding = { top: 28, right: 28, bottom: 54, left: 78 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = forecast.flatMap((row) => [row.netMovementPence, row.closingBalancePence, row.openingBalancePence]);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const range = maxValue - minValue || 1;
  const step = plotWidth / Math.max(1, forecast.length);
  const barWidth = Math.min(42, step * 0.52);
  const zeroY = yFor(0, minValue, range, padding, plotHeight);
  const linePoints = forecast.map((row, index) => {
    const x = padding.left + step * index + step / 2;
    const y = yFor(row.closingBalancePence, minValue, range, padding, plotHeight);
    return `${round(x)},${round(y)}`;
  });

  return `<div class="cashflow-chart-block" role="img" aria-label="Monthly cashflow forecast chart">
    <svg class="cashflow-chart" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <line class="axis-line" x1="${padding.left}" y1="${zeroY}" x2="${width - padding.right}" y2="${zeroY}"></line>
      <text class="axis-label" x="12" y="${zeroY + 4}">${formatCurrency(0)}</text>
      ${forecast
        .map((row, index) => {
          const x = padding.left + step * index + step / 2 - barWidth / 2;
          const barY = yFor(Math.max(0, row.netMovementPence), minValue, range, padding, plotHeight);
          const barBottom = yFor(Math.min(0, row.netMovementPence), minValue, range, padding, plotHeight);
          const y = Math.min(barY, barBottom);
          const h = Math.max(2, Math.abs(barBottom - barY));
          const tone = row.netMovementPence >= 0 ? 'positive' : 'negative';
          return `<rect class="movement-bar ${tone}" x="${round(x)}" y="${round(y)}" width="${round(barWidth)}" height="${round(h)}"></rect>`;
        })
        .join('')}
      <polyline class="closing-line" points="${linePoints.join(' ')}"></polyline>
      ${forecast
        .map((row, index) => {
          const x = padding.left + step * index + step / 2;
          const y = yFor(row.closingBalancePence, minValue, range, padding, plotHeight);
          return `<circle class="closing-point" cx="${round(x)}" cy="${round(y)}" r="4"></circle>`;
        })
        .join('')}
      ${forecast
        .filter((_, index) => index % Math.ceil(forecast.length / 6) === 0)
        .map((row, index, rows) => {
          const originalIndex = forecast.indexOf(row);
          const x = padding.left + step * originalIndex + step / 2;
          return `<text class="month-label" x="${round(x)}" y="${height - 20}" text-anchor="middle">${escapeHtml(shortMonth(row.month))}</text>`;
        })
        .join('')}
    </svg>
    <div class="chart-legend forecast-legend">
      <div class="legend-row"><span class="legend-swatch forecast-positive"></span><span>Positive monthly movement</span><strong>${formatSignedCurrency(totalPositive(forecast))}</strong></div>
      <div class="legend-row"><span class="legend-swatch forecast-negative"></span><span>Negative monthly movement</span><strong>${formatSignedCurrency(totalNegative(forecast))}</strong></div>
      <div class="legend-row"><span class="legend-line"></span><span>Projected closing balance</span><strong>${formatCurrency(forecast[forecast.length - 1].closingBalancePence)}</strong></div>
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

function totalPositive(forecast) {
  return forecast.reduce((sum, row) => sum + Math.max(0, row.netMovementPence), 0);
}

function totalNegative(forecast) {
  return forecast.reduce((sum, row) => sum + Math.min(0, row.netMovementPence), 0);
}
