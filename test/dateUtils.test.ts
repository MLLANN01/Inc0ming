import * as assert from 'assert';
import { parseDateMDYY, formatDateMDYY, daysUntil, getUrgencyLevel } from '../src/utils/dateUtils';

suite('Date Utils', () => {
    test('parseDateMDYY parses valid date', () => {
        const d = parseDateMDYY('3/15/26');
        assert.ok(d);
        assert.strictEqual(d!.getFullYear(), 2026);
        assert.strictEqual(d!.getMonth(), 2); // March = 2
        assert.strictEqual(d!.getDate(), 15);
    });

    test('parseDateMDYY handles single digit month/day', () => {
        const d = parseDateMDYY('1/5/26');
        assert.ok(d);
        assert.strictEqual(d!.getMonth(), 0); // January = 0
        assert.strictEqual(d!.getDate(), 5);
    });

    test('parseDateMDYY returns null for invalid format', () => {
        assert.strictEqual(parseDateMDYY('not-a-date'), null);
        assert.strictEqual(parseDateMDYY('2026-03-15'), null);
        assert.strictEqual(parseDateMDYY(''), null);
    });

    test('parseDateMDYY returns null for invalid month', () => {
        assert.strictEqual(parseDateMDYY('13/1/26'), null);
        assert.strictEqual(parseDateMDYY('0/1/26'), null);
    });

    test('formatDateMDYY formats correctly', () => {
        const d = new Date(2026, 2, 15); // March 15, 2026
        assert.strictEqual(formatDateMDYY(d), '3/15/26');
    });

    test('formatDateMDYY pads year', () => {
        const d = new Date(2005, 0, 1); // Jan 1, 2005
        assert.strictEqual(formatDateMDYY(d), '1/1/05');
    });

    test('daysUntil returns positive for future dates', () => {
        const future = new Date();
        future.setDate(future.getDate() + 10);
        assert.strictEqual(daysUntil(future), 10);
    });

    test('daysUntil returns negative for past dates', () => {
        const past = new Date();
        past.setDate(past.getDate() - 5);
        assert.strictEqual(daysUntil(past), -5);
    });

    test('daysUntil returns 0 for today', () => {
        assert.strictEqual(daysUntil(new Date()), 0);
    });

    test('getUrgencyLevel returns past for negative', () => {
        assert.strictEqual(getUrgencyLevel(-1), 'past');
    });

    test('getUrgencyLevel returns urgent for 0-1 days', () => {
        assert.strictEqual(getUrgencyLevel(0), 'urgent');
        assert.strictEqual(getUrgencyLevel(1), 'urgent');
    });

    test('getUrgencyLevel returns warning for 2-7 days', () => {
        assert.strictEqual(getUrgencyLevel(2), 'warning');
        assert.strictEqual(getUrgencyLevel(7), 'warning');
    });

    test('getUrgencyLevel returns normal for 8+ days', () => {
        assert.strictEqual(getUrgencyLevel(8), 'normal');
        assert.strictEqual(getUrgencyLevel(100), 'normal');
    });

    test('getUrgencyLevel respects custom thresholds', () => {
        assert.strictEqual(getUrgencyLevel(3, 14, 3), 'urgent');
        assert.strictEqual(getUrgencyLevel(10, 14, 3), 'warning');
        assert.strictEqual(getUrgencyLevel(15, 14, 3), 'normal');
    });
});
