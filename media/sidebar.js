// @ts-nocheck
/* Sidebar webview — status + agenda rendering */
(function () {
    var vscode = acquireVsCodeApi();

    window.addEventListener('message', function (event) {
        var msg = event.data;
        if (msg.type === 'statusUpdate') {
            renderStatus(msg.data);
            renderAgenda(msg.data);
        }
    });

    function renderStatus(data) {
        var container = document.getElementById('todo-status');
        if (!container) { return; }
        container.innerHTML = '';

        if (data.sections.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'agenda-empty';
            empty.textContent = 'No todo sections yet.';
            container.appendChild(empty);
            return;
        }

        for (var i = 0; i < data.sections.length; i++) {
            var section = data.sections[i];

            var row = document.createElement('div');
            row.className = 'progress-row';

            // Label row
            var label = document.createElement('div');
            label.className = 'progress-label';

            var nameEl = document.createElement('span');
            nameEl.className = 'progress-name';
            nameEl.textContent = section.name;

            var countEl = document.createElement('span');
            countEl.className = 'progress-count';
            countEl.textContent = section.completed + '/' + section.total;

            label.appendChild(nameEl);
            label.appendChild(countEl);
            row.appendChild(label);

            // Progress bar
            var bar = document.createElement('div');
            bar.className = 'progress-bar';

            var fill = document.createElement('div');
            fill.className = 'progress-fill ' + getProgressClass(section.percent);
            fill.style.width = section.percent + '%';

            bar.appendChild(fill);
            row.appendChild(bar);

            container.appendChild(row);
        }

        // Summary line
        var summary = document.createElement('div');
        summary.className = 'status-summary';

        var todoSummary = document.createElement('span');
        todoSummary.textContent = data.completedTodos + '/' + data.totalTodos + ' done';

        var radarSummary = document.createElement('span');
        radarSummary.textContent = data.totalRadar + ' tracked';

        summary.appendChild(todoSummary);
        summary.appendChild(radarSummary);
        container.appendChild(summary);
    }

    function renderAgenda(data) {
        var container = document.getElementById('agenda-list');
        if (!container) { return; }
        container.innerHTML = '';

        if (data.agenda.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'agenda-empty';
            empty.textContent = 'Nothing due this week.';
            container.appendChild(empty);
            return;
        }

        for (var i = 0; i < data.agenda.length; i++) {
            var item = data.agenda[i];

            var row = document.createElement('div');
            row.className = 'agenda-item';

            var dot = document.createElement('div');
            dot.className = 'agenda-dot ' + item.urgency;

            var label = document.createElement('span');
            label.className = 'agenda-label';
            label.textContent = item.label;
            label.title = item.date + ' — ' + item.label;

            var days = document.createElement('span');
            days.className = 'agenda-days ' + item.urgency;
            if (item.days === 0) {
                days.textContent = 'today';
            } else if (item.days === 1) {
                days.textContent = '1d';
            } else {
                days.textContent = item.days + 'd';
            }

            row.appendChild(dot);
            row.appendChild(label);
            row.appendChild(days);
            container.appendChild(row);
        }
    }

    function getProgressClass(percent) {
        if (percent >= 100) { return 'done'; }
        if (percent >= 60) { return 'high'; }
        if (percent >= 30) { return 'mid'; }
        return 'low';
    }

    // Open dashboard button
    var dashBtn = document.getElementById('open-dashboard-btn');
    if (dashBtn) {
        dashBtn.addEventListener('click', function () {
            vscode.postMessage({ type: 'openDashboard' });
        });
    }
})();
