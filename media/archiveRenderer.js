// @ts-nocheck
/* Archive Renderer — accomplished items grouped by type */
(function () {
    var currentData = null;

    function postMessage(msg) {
        if (window.DashboardBridge) { window.DashboardBridge.postMessage(msg); }
    }

    function setData(data) {
        currentData = data;
        render(data);
    }

    function render(data) {
        var container = document.getElementById('archive-list');
        if (!container) { return; }
        container.innerHTML = '';

        // Update count badge
        var badge = document.getElementById('archive-count');
        if (badge) {
            badge.textContent = data && data.length ? data.length : '0';
            badge.style.display = data && data.length ? '' : 'none';
        }

        if (!data || data.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'archive-empty';
            empty.textContent = 'No accomplished items yet.';
            container.appendChild(empty);
            return;
        }

        // Group items by type
        var groups = {
            goal: { label: 'Completed Goals', items: [] },
            todo: { label: 'Completed Todos', items: [] },
            radar: { label: 'Past Events', items: [] },
        };

        for (var i = 0; i < data.length; i++) {
            var item = data[i];
            var key = item.sourceType;
            if (groups[key]) {
                groups[key].items.push(item);
            }
        }

        var groupOrder = ['goal', 'todo', 'radar'];

        for (var g = 0; g < groupOrder.length; g++) {
            var group = groups[groupOrder[g]];
            if (group.items.length === 0) { continue; }

            // Group header
            var header = document.createElement('div');
            header.className = 'archive-group-header';
            header.textContent = group.label;
            container.appendChild(header);

            for (var j = 0; j < group.items.length; j++) {
                (function (item) {
                    var row = document.createElement('div');
                    row.className = 'archive-item';

                    // Icon
                    var icon = document.createElement('span');
                    icon.className = 'archive-icon';
                    icon.textContent = item.sourceType === 'radar' ? '\u2022' : '\u2713';
                    row.appendChild(icon);

                    // Item text
                    var textEl = document.createElement('span');
                    textEl.className = 'archive-text';
                    textEl.textContent = item.text;
                    textEl.title = item.text;
                    row.appendChild(textEl);

                    // Section origin badge
                    var sectionBadge = document.createElement('span');
                    sectionBadge.className = 'archive-section-badge';
                    sectionBadge.textContent = item.sectionName;
                    row.appendChild(sectionBadge);

                    // Date (if available)
                    if (item.dueDate) {
                        var dateEl = document.createElement('span');
                        dateEl.className = 'archive-date';
                        dateEl.textContent = item.dueDate;
                        row.appendChild(dateEl);
                    }

                    // Delete button
                    var delBtn = document.createElement('button');
                    delBtn.className = 'archive-delete-btn';
                    delBtn.textContent = '\u00d7';
                    delBtn.title = 'Delete';
                    delBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        if (item.sourceType === 'todo') {
                            postMessage({ type: 'deleteTodoItem', id: item.id });
                        } else if (item.sourceType === 'goal') {
                            postMessage({ type: 'deleteGoal', id: item.id });
                        } else if (item.sourceType === 'radar') {
                            postMessage({ type: 'deleteRadarItem', id: item.id });
                        }
                    });
                    row.appendChild(delBtn);

                    container.appendChild(row);

                    // Completion note (for goals)
                    if (item.sourceType === 'goal' && item.completionNote) {
                        var noteRow = document.createElement('div');
                        noteRow.className = 'archive-completion-note';
                        noteRow.textContent = item.completionNote;
                        container.appendChild(noteRow);
                    }

                    // Milestone summary (for goals)
                    if (item.sourceType === 'goal' && item.milestoneCount > 0) {
                        var msRow = document.createElement('div');
                        msRow.className = 'archive-milestone-summary';
                        msRow.textContent = item.milestonesCompleted + '/' + item.milestoneCount + ' milestones completed';
                        container.appendChild(msRow);
                    }
                })(group.items[j]);
            }
        }
    }

    window.ArchiveRenderer = { setData: setData };
})();
