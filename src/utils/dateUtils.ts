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
