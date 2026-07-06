export type DateRange = {
  dateFrom: string;
  dateTo: string;
};

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getDefaultSyncDateRange(daysBack = 30, now = new Date()): DateRange {
  const dateTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dateFrom = new Date(dateTo);
  dateFrom.setUTCDate(dateFrom.getUTCDate() - daysBack + 1);

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
