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

    window.DateUtils = {
        parseMDYY: parseMDYY,
        daysUntil: daysUntil,
        getDaysClass: getDaysClass,
        formatDaysBadge: formatDaysBadge,
        toISODate: toISODate,
        fromISODate: fromISODate,
    };
})();
