const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonth() {
  return todayIso().slice(0, 7);
}

export function monthLabel(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${MONTHS[monthNumber - 1]} ${year}`;
}

export function monthRange(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

export function addMonths(month, offset) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

export function isItemActiveInMonth(item, month) {
  const { start, end } = monthRange(month);
  const startsBeforeEnd = !item.start_date || item.start_date <= end;
  const endsAfterStart = !item.end_date || item.end_date >= start;
  return Number(item.is_active) === 1 && startsBeforeEnd && endsAfterStart;
}

export function taxYearForDate(dateIso) {
  const [year, month, day] = dateIso.split('-').map(Number);
  const startsThisCalendarYear = month > 4 || (month === 4 && day >= 6);
  const startYear = startsThisCalendarYear ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export function taxYearRange(taxYear) {
  const [startYear, endYear] = taxYear.split('-').map(Number);
  return {
    start: `${startYear}-04-06`,
    end: `${endYear}-04-05`
  };
}
