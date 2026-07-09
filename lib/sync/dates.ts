export type DateRange = {
  dateFrom: string;
  dateTo: string;
};

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getDaysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function subtractUtcMonths(date: Date, monthsBack: number): Date {
  const targetMonthStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - monthsBack, 1)
  );
  const year = targetMonthStart.getUTCFullYear();
  const month = targetMonthStart.getUTCMonth();
  const day = Math.min(date.getUTCDate(), getDaysInUtcMonth(year, month));

  return new Date(Date.UTC(year, month, day));
}

export function getDefaultSyncDateRange(monthsBack = 6, now = new Date()): DateRange {
  const dateTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dateFrom = subtractUtcMonths(dateTo, monthsBack);
  dateFrom.setUTCDate(dateFrom.getUTCDate() + 1);

  return {
    dateFrom: toIsoDate(dateFrom),
    dateTo: toIsoDate(dateTo)
  };
}

export function enumerateDates(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${dateFrom}T00:00:00.000Z`);
  const end = new Date(`${dateTo}T00:00:00.000Z`);

  while (cursor <= end) {
    dates.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}
