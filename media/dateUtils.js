// @ts-nocheck
/* Shared date utilities for webview renderers */
(function () {
    function parseMDYY(str) {
        if (!str) { return null; }
        var parts = str.split('/');
        if (parts.length !== 3) { return null; }
        var m = parseInt(parts[0], 10);
        var d = parseInt(parts[1], 10);
        var y = parseInt(parts[2], 10);
        if (isNaN(m) || isNaN(d) || isNaN(y)) { return null; }
        return new Date(2000 + y, m - 1, d);
    }

    function daysUntil(date) {
        var now = new Date();
        now.setHours(0, 0, 0, 0);
        var target = new Date(date.getTime());
        target.setHours(0, 0, 0, 0);
        return Math.round((target - now) / 86400000);
    }

    function getDaysClass(days) {
        if (days < 0) { return 'past'; }
        if (days <= 30) { return 'urgent'; }
        if (days <= 90) { return 'warning'; }
        return 'normal';
    }

    function formatDaysBadge(days) {
        if (days === 0) { return 'today'; }
        if (days > 0) { return days + 'd'; }
        return Math.abs(days) + 'd ago';
    }

    function toISODate(mdyy) {
        var d = parseMDYY(mdyy);
        if (!d) { return ''; }
        var yyyy = d.getFullYear();
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        var dd = String(d.getDate()).padStart(2, '0');
        return yyyy + '-' + mm + '-' + dd;
    }

    function fromISODate(iso) {
        if (!iso) { return ''; }
        var parts = iso.split('-');
        if (parts.length !== 3) { return ''; }
        var y = parseInt(parts[0], 10) - 2000;
        var m = parseInt(parts[1], 10);
        var d = parseInt(parts[2], 10);
        return m + '/' + d + '/' + y;
    }

    var DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

    function nextWeeklyOccurrence(days) {
        if (!days || days.length === 0) { return null; }
        var now = new Date();
        now.setHours(0, 0, 0, 0);
        var todayDow = now.getDay();
        var minOffset = 8;
        for (var i = 0; i < days.length; i++) {
            var target = DAY_INDEX[days[i]];
            if (target === undefined) { continue; }
            var offset = (target - todayDow + 7) % 7;
            if (offset < minOffset) { minOffset = offset; }
        }
        if (minOffset > 7) { return null; }
        var result = new Date(now);
        result.setDate(result.getDate() + minOffset);
        return result;
    }

    function nextYearlyOccurrence(month, day) {
        var now = new Date();
        now.setHours(0, 0, 0, 0);
        var thisYear = new Date(now.getFullYear(), month - 1, day);
        thisYear.setHours(0, 0, 0, 0);
        if (thisYear >= now) { return thisYear; }
        return new Date(now.getFullYear() + 1, month - 1, day);
    }

    function effectiveDate(item) {
        if (item.date) { return new Date(item.date); }
        if (!item.recurrence) { return null; }
        if (item.recurrence.type === 'weekly') {
            return nextWeeklyOccurrence(item.recurrence.days);
        }
        return nextYearlyOccurrence(item.recurrence.month, item.recurrence.day);
    }

    function isToday(date) {
        var now = new Date();
        return date.getFullYear() === now.getFullYear()
            && date.getMonth() === now.getMonth()
            && date.getDate() === now.getDate();
    }

    function getTodayDayName() {
        var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return days[new Date().getDay()];
    }

    window.DateUtils = {
        parseMDYY: parseMDYY,
        daysUntil: daysUntil,
        getDaysClass: getDaysClass,
        formatDaysBadge: formatDaysBadge,
        toISODate: toISODate,
        fromISODate: fromISODate,
        nextWeeklyOccurrence: nextWeeklyOccurrence,
        nextYearlyOccurrence: nextYearlyOccurrence,
        effectiveDate: effectiveDate,
        isToday: isToday,
        getTodayDayName: getTodayDayName,
    };
})();
