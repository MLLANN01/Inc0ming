import { DayOfWeek, RadarItem } from '../models/types';

export type UrgencyLevel = 'urgent' | 'warning' | 'normal' | 'past';

export function parseDateMDYY(str: string): Date | null {
    const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (!match) { return null; }
    const month = parseInt(match[1], 10);
    const day = parseInt(match[2], 10);
    const year = 2000 + parseInt(match[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) { return null; }
    return new Date(year, month - 1, day);
}

export function formatDateMDYY(date: Date): string {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const y = date.getFullYear() % 100;
    return `${m}/${d}/${y < 10 ? '0' + y : y}`;
}

export function daysUntil(date: Date): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function getUrgencyLevel(days: number, warningDays = 7, urgentDays = 1): UrgencyLevel {
    if (days < 0) { return 'past'; }
    if (days <= urgentDays) { return 'urgent'; }
    if (days <= warningDays) { return 'warning'; }
    return 'normal';
}

const DAY_INDEX: Record<DayOfWeek, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Returns the next upcoming date (today or future) that falls on one of the given days. */
export function nextWeeklyOccurrence(days: DayOfWeek[]): Date | null {
    if (days.length === 0) { return null; }
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayDow = now.getDay();
    let minOffset = 8; // more than 7
    for (const d of days) {
        const target = DAY_INDEX[d];
        let offset = (target - todayDow + 7) % 7;
        if (offset < minOffset) { minOffset = offset; }
    }
    if (minOffset > 7) { return null; }
    const result = new Date(now);
    result.setDate(result.getDate() + minOffset);
    return result;
}

/** Returns this year's date if not passed, else next year's date. */
export function nextYearlyOccurrence(month: number, day: number): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const thisYear = new Date(now.getFullYear(), month - 1, day);
    thisYear.setHours(0, 0, 0, 0);
    if (thisYear >= now) { return thisYear; }
    return new Date(now.getFullYear() + 1, month - 1, day);
}

/** Returns the effective (next) date for a radar item. */
export function effectiveDate(item: RadarItem): Date | null {
    if (item.date) { return item.date; }
    if (!item.recurrence) { return null; }
    if (item.recurrence.type === 'weekly') {
        return nextWeeklyOccurrence(item.recurrence.days);
    }
    return nextYearlyOccurrence(item.recurrence.month, item.recurrence.day);
}

/** True if the given date is today. */
export function isToday(date: Date): boolean {
    const now = new Date();
    return date.getFullYear() === now.getFullYear()
        && date.getMonth() === now.getMonth()
        && date.getDate() === now.getDate();
}
