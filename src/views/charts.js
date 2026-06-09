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
  const height = 380;
  const padding = { top: 30, right: 34, bottom: 64, left: 92 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = forecast.flatMap((row) => [row.openingBalancePence, row.closingBalancePence, row.netMovementPence, 0]);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawRange = rawMax - rawMin;
  const pad = Math.max(10_000, rawRange ? rawRange * 0.12 : Math.max(Math.abs(rawMax || 0), 50_000) * 0.12);
  const minValue = Math.min(0, rawMin - pad);
  const maxValue = Math.max(0, rawMax + pad);
  const range = maxValue - minValue || 1;
  const step = plotWidth / Math.max(1, forecast.length);
  const barWidth = Math.max(14, Math.min(34, step * 0.48));
  const guideValues = [maxValue, minValue + range / 2, minValue].filter((value, index, rows) => rows.indexOf(value) === index);
  const zeroY = yFor(0, minValue, range, padding, plotHeight);
  const linePoints = forecast.map((row, index) => {
    const x = padding.left + step * index + step / 2;
    const y = yFor(row.closingBalancePence, minValue, range, padding, plotHeight);
    return `${round(x)},${round(y)}`;
  });
  const lowestRow = forecast.reduce((lowest, row) => (row.closingBalancePence < lowest.closingBalancePence ? row : lowest), forecast[0]);
  const lowestIndex = forecast.indexOf(lowestRow);
  const finalRow = forecast.at(-1);
  const finalIndex = forecast.length - 1;
  const showLowestAnnotation = lowestRow && lowestIndex !== finalIndex;

  return `<div class="cashflow-chart-block" role="img" aria-label="Cashflow resilience chart">
    <svg class="cashflow-chart" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      ${guideValues
        .map((value) => {
          const y = yFor(value, minValue, range, padding, plotHeight);
          return `<line class="guide-line" x1="${padding.left}" y1="${round(y)}" x2="${width - padding.right}" y2="${round(y)}"></line>
            <text class="axis-label" x="12" y="${round(y + 4)}">${formatAxisCurrency(value)}</text>`;
        })
        .join('')}
      <line class="forecast-zero-line" x1="${padding.left}" y1="${round(zeroY)}" x2="${width - padding.right}" y2="${round(zeroY)}"></line>
      ${forecast
        .map((row, index) => {
          const x = padding.left + step * index + step / 2;
          const valueY = yFor(row.netMovementPence, minValue, range, padding, plotHeight);
          const y = Math.min(zeroY, valueY);
          const barHeight = Math.max(2, Math.abs(zeroY - valueY));
          const tone = row.netMovementPence < 0 ? 'negative' : row.netMovementPence > 0 ? 'positive' : 'neutral';
          return `<rect class="forecast-net-bar ${tone}" x="${round(x - barWidth / 2)}" y="${round(y)}" width="${round(barWidth)}" height="${round(barHeight)}"></rect>`;
        })
        .join('')}
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
      ${showLowestAnnotation ? forecastAnnotation(lowestRow, lowestIndex, step, padding, plotHeight, minValue, range, 'Lowest') : ''}
      ${finalRow ? forecastAnnotation(finalRow, finalIndex, step, padding, plotHeight, minValue, range, 'Final') : ''}
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
      <div class="legend-row simple"><span class="legend-bar forecast-positive"></span><span>Monthly surplus</span></div>
      <div class="legend-row simple"><span class="legend-bar forecast-negative"></span><span>Monthly deficit</span></div>
      <div class="legend-row simple"><span class="legend-line"></span><span>Projected closing balance</span></div>
    </div>
  </div>`;
}

export function savingsProjectionChart(projection, { emptyMessage = 'No projected savings data yet.'} = {}) {
  if (!projection.months.length) return `<div class="chart-empty">${escapeHtml(emptyMessage)}</div>`;

  const width = 920;
  const height = 360;
  const padding = { top: 24, right: 28, bottom: 54, left: 86 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const cumulativeRows = buildSavingsProjectionSeries(projection.months);
  const accountNames = projection.accounts.map((account) => account.name);
  const stackedSeries = buildStackedSavingsSeries(cumulativeRows, accountNames);
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
  const labelStep = projectionLabelStep(cumulativeRows.length);

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
      ${accountNames
        .map((_, index) => savingsAreaPath(stackedSeries, index, { padding, plotHeight, minValue, range, step }))
        .join('')}
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
            ${index % labelStep === 0 || index === cumulativeRows.length - 1 ? `<circle class="savings-point" cx="${round(x)}" cy="${round(y)}" r="4"></circle>` : ''}
          </g>`;
        })
        .join('')}
      ${cumulativeRows
        .filter((_, index) => index % labelStep === 0 || index === cumulativeRows.length - 1)
        .map((row) => {
          const originalIndex = cumulativeRows.indexOf(row);
          const x = padding.left + step * originalIndex + step / 2;
          return `<text class="month-label" x="${round(x)}" y="${height - 20}" text-anchor="middle">${escapeHtml(shortMonth(row.month))}</text>`;
        })
        .join('')}
    </svg>
    <div class="chart-legend forecast-legend">
      <div class="legend-row simple"><span class="legend-line savings-line-key"></span><span>Projected balance</span></div>
      ${projection.accounts
        .map(
          (account, index) => `<div class="legend-row simple">
            <span class="legend-swatch swatch-${index % 8}"></span>
            <span>${escapeHtml(account.name)}</span>
          </div>`
        )
        .join('')}
    </div>
  </div>`;
}

export function savingsMonthlyAdditionsChart(rows = [], { emptyMessage = 'No monthly additions yet.' } = {}) {
  const chartRows = rows.filter((row) => Number(row.totalPence || 0) > 0);
  if (!chartRows.length) return `<div class="chart-empty">${escapeHtml(emptyMessage)}</div>`;

  const chartId = `savings-monthly-additions-${Math.random().toString(36).slice(2)}`;
  const orderedRows = [...chartRows].reverse();
  const rowData = orderedRows.map((row) => ({
    name: row.name,
    incomePence: Number(row.personalPence || 0),
    employerPence: Number(row.employerPence || 0),
    bonusPence: Number(row.bonusPence || 0),
    totalPence: Number(row.totalPence || 0)
  }));
  const hasEmployer = rowData.some((row) => row.employerPence > 0);
  const hasBonus = rowData.some((row) => row.bonusPence > 0);
  const legendData = ['From income', ...(hasEmployer ? ['Employer contribution'] : []), ...(hasBonus ? ['Bonus / top-up'] : [])];
  const chartConfig = {
    textStyle: {
      fontFamily: 'inherit',
      color: '#17211b'
    },
    legend: {
      bottom: 0,
      left: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: {
        color: '#5e6b63',
        fontWeight: 700
      },
      data: legendData
    },
    grid: {
      left: 6,
      right: 112,
      top: 10,
      bottom: legendData.length > 1 ? 42 : 24,
      containLabel: true
    },
    xAxis: {
      type: 'value',
      min: 0,
      axisLabel: {
        formatter: '£{value}'
      },
      splitLine: {
        lineStyle: { color: 'rgba(56, 45, 31, 0.09)' }
      }
    },
    yAxis: {
      type: 'category',
      data: rowData.map((row) => row.name),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        color: '#17211b',
        fontWeight: 700
      }
    },
    series: [
      monthlyAdditionSeries('From income', rowData, 'incomePence', '#1f6f5b'),
      ...(hasEmployer ? [monthlyAdditionSeries('Employer contribution', rowData, 'employerPence', '#4b5fb5')] : []),
      ...(hasBonus ? [monthlyAdditionSeries('Bonus / top-up', rowData, 'bonusPence', '#d4863c')] : [])
    ]
  };

  return `<div id="${chartId}" class="echarts-dashboard-chart savings-monthly-additions-chart" role="img" aria-label="Monthly additions breakdown chart" data-echarts-chart data-chart-type="savings-monthly-additions" data-chart-config="${escapeHtml(JSON.stringify(chartConfig))}"></div>`;
}

export function savingsContributionChart(projection, { emptyMessage = 'No projected contributions data yet.' } = {}) {
  if (!projection.months.length) return `<div class="chart-empty">${escapeHtml(emptyMessage)}</div>`;

  const contributionRows = buildSavingsContributionSeries(projection.months);
  const accountNames = projection.accounts
    .map((account) => account.name)
    .filter((name) => contributionRows.some((row) => Number(row.byAccount[name] || 0) > 0));
  if (!accountNames.length) return `<div class="chart-empty">${escapeHtml(emptyMessage)}</div>`;

  const width = 920;
  const height = 360;
  const padding = { top: 24, right: 28, bottom: 54, left: 86 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(0, ...contributionRows.map((row) => row.totalPence));
  const range = maxValue || 1;
  const step = plotWidth / Math.max(1, contributionRows.length);
  const barWidth = Math.max(24, step * 0.58);
  const yTicks = buildCurrencyTicks(maxValue, 5);

  return `<div class="cashflow-chart-block" role="img" aria-label="Monthly contributions by pot">
    <svg class="cashflow-chart" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      ${yTicks
        .map((value) => {
          const y = yFor(value, 0, range, padding, plotHeight);
          return `<line class="guide-line" x1="${padding.left}" y1="${round(y)}" x2="${width - padding.right}" y2="${round(y)}"></line>
            <text class="axis-label" x="12" y="${round(y + 4)}">${formatAxisCurrency(value)}</text>`;
        })
        .join('')}
      <line class="axis-line" x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}"></line>
      ${contributionRows
        .map((row, rowIndex) => {
          const x = padding.left + step * rowIndex + step / 2;
          let runningTotal = 0;
          const stacks = accountNames
            .map((name, accountIndex) => {
              const value = Number(row.byAccount[name] || 0);
              if (value <= 0) return '';
              const lower = runningTotal;
              runningTotal += value;
              const topY = yFor(runningTotal, 0, range, padding, plotHeight);
              const bottomY = yFor(lower, 0, range, padding, plotHeight);
              return `<rect class="contribution-bar stack-${accountIndex % 8}" x="${round(x - barWidth / 2)}" y="${round(topY)}" width="${round(barWidth)}" height="${round(bottomY - topY)}"></rect>`;
            })
            .join('');
          return `<g>
            ${stacks}
            <rect class="closing-hit" x="${round(x - step / 2)}" y="${padding.top}" width="${round(step)}" height="${plotHeight}" tabindex="0" data-chart-tooltip="${escapeHtml(savingsContributionTooltip(row, accountNames))}" aria-label="${escapeHtml(savingsContributionTooltip(row, accountNames))}">
              <title>${savingsContributionTooltip(row, accountNames)}</title>
            </rect>
          </g>`;
        })
        .join('')}
      ${contributionRows
        .map((row, rowIndex) => {
          const x = padding.left + step * rowIndex + step / 2;
          return `<text class="month-label" x="${round(x)}" y="${height - 20}" text-anchor="middle">${escapeHtml(shortMonth(row.month))}</text>`;
        })
        .join('')}
    </svg>
    <div class="chart-legend forecast-legend">
      ${accountNames
        .map(
          (name, index) => `<div class="legend-row simple">
            <span class="legend-swatch swatch-${index % 8}"></span>
            <span>${escapeHtml(name)}</span>
          </div>`
        )
        .join('')}
    </div>
  </div>`;
}

export function incomeAllocationSankeyChart({
  plannedIncomePence = 0,
  spendingPence = 0,
  savingsPence = 0,
  retirementPence = 0,
  availablePence = 0,
  shortfallPence = 0,
  emptyMessage = 'No planned income to allocate yet.'
} = {}) {
  const income = Math.max(0, Number(plannedIncomePence || 0));
  const spending = Math.max(0, Number(spendingPence || 0));
  const savings = Math.max(0, Number(savingsPence || 0));
  const retirement = Math.max(0, Number(retirementPence || 0));
  const available = Math.max(0, Number(availablePence || 0));
  const targetAllocation = spending + savings + retirement;
  const shortfall = Math.max(0, Number(shortfallPence || 0), targetAllocation - income);
  const totalAllocation = targetAllocation + (shortfall > 0 ? 0 : available);
  const allocated = totalAllocation + shortfall;
  if (income <= 0 && allocated <= 0) return `<div class="chart-empty">${escapeHtml(emptyMessage)}</div>`;

  const planRequiresLabel = 'Plan requires';
  const plannedSpendingLabel = 'Planned spending';
  const nodes = [
    ...(income > 0 ? [allocationNode('Planned income', income, income, '#1f6f5b')] : []),
    ...(shortfall > 0 ? [allocationNode('Shortfall', shortfall, income, '#a7342d')] : []),
    allocationNode(planRequiresLabel, totalAllocation, income, '#7f7668', { showPercentage: false }),
    ...(spending > 0 ? [allocationNode(plannedSpendingLabel, spending, income, '#d69a50')] : []),
    ...(savings > 0 ? [allocationNode('Savings', savings, income, '#2f8f77')] : []),
    ...(retirement > 0 ? [allocationNode('Retirement', retirement, income, '#6875c7')] : []),
    ...(shortfall === 0 && available > 0 ? [allocationNode('Available after plan', available, income, '#37a98b')] : [])
  ];
  const links = [
    income > 0 ? sankeyLink('Planned income', planRequiresLabel, shortfall > 0 ? income : totalAllocation, income) : null,
    shortfall > 0 ? sankeyLink('Shortfall', planRequiresLabel, shortfall, income) : null,
    spending > 0 ? sankeyLink(planRequiresLabel, plannedSpendingLabel, spending, income) : null,
    savings > 0 ? sankeyLink(planRequiresLabel, 'Savings', savings, income) : null,
    retirement > 0 ? sankeyLink(planRequiresLabel, 'Retirement', retirement, income) : null,
    shortfall === 0 && available > 0 ? sankeyLink(planRequiresLabel, 'Available after plan', available, income) : null
  ].filter(Boolean);
  const mobileLegendRows = [
    income > 0 ? { label: 'Planned income', valuePence: income, percentage: 100, tone: 'income' } : null,
    { label: planRequiresLabel, valuePence: totalAllocation, percentage: percentOfIncome(totalAllocation, income), tone: 'requires' },
    spending > 0 ? { label: plannedSpendingLabel, valuePence: spending, percentage: percentOfIncome(spending, income), tone: 'spending' } : null,
    savings > 0 ? { label: 'Savings', valuePence: savings, percentage: percentOfIncome(savings, income), tone: 'savings' } : null,
    retirement > 0 ? { label: 'Retirement', valuePence: retirement, percentage: percentOfIncome(retirement, income), tone: 'retirement' } : null,
    shortfall > 0
      ? { label: 'Shortfall after plan', valuePence: shortfall, percentage: percentOfIncome(shortfall, income), tone: 'shortfall' }
      : available > 0
        ? { label: 'Available after plan', valuePence: available, percentage: percentOfIncome(available, income), tone: 'available' }
        : null
  ].filter(Boolean);

  const chartId = `income-allocation-${Math.random().toString(36).slice(2)}`;
  const chartConfig = {
    textStyle: {
      fontFamily: 'inherit',
      color: '#17211b'
    },
    aria: {
      enabled: true,
      description: 'Income allocation chart showing planned income and any shortfall funding the plan requirement, then flowing to planned spending, savings, retirement, and available money where applicable.'
    },
    animation: true,
    animationDuration: 650,
    tooltip: {
      trigger: 'item'
    },
    series: [
      {
        type: 'sankey',
        emphasis: { focus: 'adjacency' },
        nodeAlign: 'justify',
        nodeGap: 14,
        nodeWidth: 14,
        draggable: false,
        layoutIterations: 32,
        data: nodes,
        links,
        lineStyle: {
          color: 'gradient',
          curveness: 0.42,
          opacity: 0.38
        },
        label: {
          color: '#17211b',
          fontWeight: 700,
          fontSize: 12,
          lineHeight: 16,
          width: 165,
          overflow: 'break'
        }
      }
    ]
  };

  return `<div class="echarts-sankey-block">
    <div id="${chartId}" class="echarts-sankey" role="img" aria-label="Income allocation chart" data-echarts-chart data-chart-type="income-allocation" data-chart-config="${escapeHtml(JSON.stringify(chartConfig))}"></div>
    <div class="sankey-mobile-legend" aria-label="Income allocation values">
      ${mobileLegendRows.map((row) => `<div class="sankey-mobile-legend-row ${escapeHtml(row.tone)}">
        <span class="sankey-mobile-swatch" aria-hidden="true"></span>
        <span>${escapeHtml(row.label)}</span>
        <strong>${formatCurrency(row.valuePence)}${income > 0 ? ` · ${row.percentage}%` : ''}</strong>
      </div>`).join('')}
    </div>
    ${shortfall > 0 ? `<div class="shortfall-warning" role="status">
      <strong>Shortfall after plan</strong>
      <span>Plan exceeds income by ${formatCurrency(shortfall)}.</span>
    </div>` : ''}
  </div>`;
}

export function dashboardSpendingPressureChart(rows = [], { emptyMessage = 'No planned spending yet.' } = {}) {
  const chartRows = rows.filter((row) => Number(row.valuePence || 0) > 0);
  if (!chartRows.length) return `<div class="chart-empty">${escapeHtml(emptyMessage)}</div>`;

  const chartId = `dashboard-spending-pressure-${Math.random().toString(36).slice(2)}`;
  const orderedRows = [...chartRows].reverse();
  const chartConfig = {
    textStyle: {
      fontFamily: 'inherit',
      color: '#17211b'
    },
    grid: {
      left: 6,
      right: 112,
      top: 10,
      bottom: 18,
      containLabel: true
    },
    xAxis: {
      type: 'value',
      min: 0,
      axisLabel: {
        formatter: '£{value}'
      },
      splitLine: {
        lineStyle: { color: 'rgba(56, 45, 31, 0.09)' }
      }
    },
    yAxis: {
      type: 'category',
      data: orderedRows.map((row) => row.label),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        color: '#17211b',
        fontWeight: 700
      }
    },
    series: [
      {
        name: 'Planned spending',
        type: 'bar',
        barWidth: 12,
        data: orderedRows.map((row) => ({
          name: row.label,
          value: Number((Number(row.valuePence || 0) / 100).toFixed(2)),
          valuePence: Number(row.valuePence || 0),
          percentage: Number(row.percentage || 0)
        })),
        itemStyle: {
          color: '#d4863c',
          borderRadius: 2
        }
      }
    ]
  };

  return `<div id="${chartId}" class="echarts-dashboard-chart" role="img" aria-label="Spending pressure chart" data-echarts-chart data-chart-type="dashboard-spending-pressure" data-chart-config="${escapeHtml(JSON.stringify(chartConfig))}"></div>`;
}

export function dashboardSavingsAllocationChart(rows = [], { emptyMessage = 'No planned savings allocation yet.' } = {}) {
  const chartRows = rows.filter((row) => Number(row.valuePence || 0) > 0 || Number(row.topUpPence || 0) > 0);
  if (!chartRows.length) return `<div class="chart-empty">${escapeHtml(emptyMessage)}</div>`;

  const chartId = `dashboard-savings-allocation-${Math.random().toString(36).slice(2)}`;
  const orderedRows = [...chartRows].reverse();
  const rowData = orderedRows.map((row) => ({
    name: row.label,
    incomePence: Number(row.valuePence || 0),
    topUpPence: Number(row.topUpPence || 0),
    totalPence: Number(row.valuePence || 0) + Number(row.topUpPence || 0)
  }));
  const hasTopUps = rowData.some((row) => row.topUpPence > 0);
  const chartConfig = {
    textStyle: {
      fontFamily: 'inherit',
      color: '#17211b'
    },
    legend: {
      bottom: 0,
      left: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: {
        color: '#5e6b63',
        fontWeight: 700
      },
      data: hasTopUps ? ['From income', 'Employer contribution'] : ['From income']
    },
    grid: {
      left: 6,
      right: 112,
      top: 10,
      bottom: hasTopUps ? 42 : 24,
      containLabel: true
    },
    xAxis: {
      type: 'value',
      min: 0,
      axisLabel: {
        formatter: '£{value}'
      },
      splitLine: {
        lineStyle: { color: 'rgba(56, 45, 31, 0.09)' }
      }
    },
    yAxis: {
      type: 'category',
      data: rowData.map((row) => row.name),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        color: '#17211b',
        fontWeight: 700
      }
    },
    series: [
      {
        name: 'From income',
        type: 'bar',
        stack: 'total',
        barWidth: 12,
        data: rowData.map((row) => ({
          name: row.name,
          value: Number((row.incomePence / 100).toFixed(2)),
          valuePence: row.incomePence,
          totalPence: row.totalPence,
          topUpPence: row.topUpPence
        })),
        itemStyle: {
          color: '#1f6f5b',
          borderRadius: hasTopUps ? [2, 0, 0, 2] : 2
        }
      },
      ...(hasTopUps ? [
        {
          name: 'Employer contribution',
          type: 'bar',
          stack: 'total',
          barWidth: 12,
          data: rowData.map((row) => ({
            name: row.name,
            value: Number((row.topUpPence / 100).toFixed(2)),
            valuePence: row.topUpPence,
            totalPence: row.totalPence,
            incomePence: row.incomePence
          })),
          itemStyle: {
            color: '#4b5fb5',
            borderRadius: [0, 2, 2, 0]
          }
        }
      ] : [])
    ]
  };

  return `<div id="${chartId}" class="echarts-dashboard-chart" role="img" aria-label="Savings allocation chart" data-echarts-chart data-chart-type="dashboard-savings-allocation" data-chart-config="${escapeHtml(JSON.stringify(chartConfig))}"></div>`;
}

function allocationNode(name, valuePence, incomePence, color, { showPercentage = true } = {}) {
  return {
    name,
    valuePence: Number(valuePence || 0),
    percentageOfIncome: percentOfIncome(valuePence, incomePence),
    displayLabel: allocationLabel(name, valuePence, incomePence, { showPercentage }),
    itemStyle: { color }
  };
}

function allocationLabel(name, valuePence, incomePence, { showPercentage = true } = {}) {
  const percentage = percentOfIncome(valuePence, incomePence);
  return [
    name,
    showPercentage ? `${formatCurrency(valuePence)} · ${percentage}%` : formatCurrency(valuePence)
  ].join('\n');
}

function sankeyLink(source, target, valuePence, incomePence) {
  return {
    source,
    target,
    value: Number((Number(valuePence || 0) / 100).toFixed(2)),
    valuePence: Number(valuePence || 0),
    percentageOfIncome: percentOfIncome(valuePence, incomePence)
  };
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

function projectionLabelStep(rowCount) {
  if (rowCount <= 14) return 1;
  if (rowCount <= 36) return 3;
  if (rowCount <= 60) return 6;
  return 12;
}

function monthlyAdditionSeries(name, rows, key, colour) {
  return {
    name,
    type: 'bar',
    stack: 'total',
    barWidth: 14,
    data: rows.map((row) => ({
      name: row.name,
      value: Number((Number(row[key] || 0) / 100).toFixed(2)),
      valuePence: Number(row[key] || 0),
      totalPence: Number(row.totalPence || 0),
      incomePence: Number(row.incomePence || 0),
      employerPence: Number(row.employerPence || 0),
      bonusPence: Number(row.bonusPence || 0)
    })),
    itemStyle: {
      color: colour,
      borderRadius: 2
    }
  };
}

function buildSavingsContributionSeries(months) {
  return months.map((row) => {
    const byAccount = Object.fromEntries(
      (row.accounts || []).map((account) => [
        account.name,
        Number(account.personalContributionPence || 0) + Number(account.employerContributionPence || 0) + Number(account.bonusPence || 0)
      ])
    );
    const totalPence = Object.values(byAccount).reduce((sum, value) => sum + Number(value || 0), 0);
    return {
      month: row.month,
      byAccount,
      totalPence
    };
  });
}

function buildStackedSavingsSeries(rows, accountNames) {
  return rows.map((row) => {
    let runningTotal = 0;
    const points = accountNames.map((name) => {
      const account = row.accounts.find((entry) => entry.name === name);
      const value = Number(account?.closingBalancePence || 0);
      const lower = runningTotal;
      const upper = runningTotal + value;
      runningTotal = upper;
      return { lower, upper };
    });
    return { month: row.month, points };
  });
}

function savingsAreaPath(seriesRows, index, { padding, plotHeight, minValue, range, step }) {
  if (!seriesRows.length) return '';
  const topPoints = [];
  const bottomPoints = [];

  seriesRows.forEach((row, rowIndex) => {
    const point = row.points[index];
    const x = padding.left + step * rowIndex + step / 2;
    topPoints.push(`${round(x)},${round(yFor(point.upper, minValue, range, padding, plotHeight))}`);
    bottomPoints.push(`${round(x)},${round(yFor(point.lower, minValue, range, padding, plotHeight))}`);
  });

  return `<path class="savings-stack-area stack-${index % 8}" d="M ${topPoints[0]} L ${topPoints.slice(1).join(' L ')} L ${bottomPoints.reverse().join(' L ')} Z"></path>`;
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

function percentOfIncome(value, income) {
  if (!income) return 0;
  return Math.round((Number(value || 0) / Number(income || 1)) * 100);
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

function forecastAnnotation(row, index, step, padding, plotHeight, minValue, range, label) {
  const x = padding.left + step * index + step / 2;
  const y = yFor(row.closingBalancePence, minValue, range, padding, plotHeight);
  const textY = Math.max(padding.top + 14, y - 16);
  const plotRight = 920 - padding.right;
  const isNearRightEdge = x > plotRight - 130;
  const textX = isNearRightEdge ? x - 8 : x + 8;
  const textAnchor = isNearRightEdge ? 'end' : 'start';
  return `<g class="forecast-annotation">
    <line x1="${round(x)}" y1="${round(y)}" x2="${round(x)}" y2="${round(textY + 4)}"></line>
    <text x="${round(textX)}" y="${round(textY)}" text-anchor="${textAnchor}">${escapeHtml(label)} ${formatAxisCurrency(row.closingBalancePence)}</text>
  </g>`;
}

function forecastTooltip(row) {
  const annualCostLines = (row.annualCostItems || []).map(
    (item) => `Annual cost: ${item.name} (${formatCurrency(item.monthlyEquivalentPence)}/month equivalent)`
  );
  const scenarioLines = [
    Number(row.oneOffCostPence || 0) > 0 ? `One-off cost: -${formatCurrency(row.oneOffCostPence)}` : '',
    Number(row.oneOffIncomePence || 0) > 0 ? `One-off income: ${formatCurrency(row.oneOffIncomePence)}` : '',
    Number(row.scenarioIncomeAdjustmentPence || 0) ? `Income scenario adjustment: ${formatSignedCurrency(row.scenarioIncomeAdjustmentPence)}` : '',
    Number(row.scenarioSpendingAdjustmentPence || 0) ? `Spending scenario adjustment: ${formatSignedCurrency(row.scenarioSpendingAdjustmentPence)}` : '',
    Number(row.scenarioSavingsAdjustmentPence || 0) ? `Savings scenario adjustment: ${formatSignedCurrency(row.scenarioSavingsAdjustmentPence)}` : ''
  ].filter(Boolean);
  return [
    monthLabel(row.month),
    `Opening balance: ${formatCurrency(row.openingBalancePence)}`,
    `Planned income: ${formatCurrency(row.expectedIncomePence)}`,
    `Planned spending: -${formatCurrency(row.expectedExpensesPence)}`,
    `Planned savings: -${formatCurrency(row.expectedSavingsPence)}`,
    `Net movement: ${formatSignedCurrency(row.netMovementPence)}`,
    `Closing balance: ${formatCurrency(row.closingBalancePence)}`,
    ...annualCostLines,
    ...scenarioLines
  ].join('\n');
}

function savingsProjectionTooltip(row) {
  const accountLines = (row.accounts || [])
    .map((account) => `${account.name}: ${formatCurrency(account.closingBalancePence)}`);
  return [
    monthLabel(row.month),
    `Projected total: ${formatCurrency(row.totalPence)}`,
    ...accountLines,
    `Personal contributions to date: ${formatCurrency(row.personalContributionPence)}`,
    `Employer and LISA top-ups to date: ${formatCurrency(row.topUpsPence)}`,
    `Projected growth / interest to date: ${formatCurrency(row.growthPence)}`
  ].join('\n');
}

function savingsContributionTooltip(row, accountNames) {
  return [
    monthLabel(row.month),
    ...accountNames.map((name) => `${name}: ${formatCurrency(row.byAccount[name] || 0)}`),
    `Total monthly contributions: ${formatCurrency(row.totalPence)}`
  ].join('\n');
}
