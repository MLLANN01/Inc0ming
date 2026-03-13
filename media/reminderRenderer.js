// @ts-nocheck
/* Reminder Renderer — recurring radar items as cards with day badges and sub-item management */
(function () {
    var currentData = null;

    function postMessage(msg) {
        if (window.DashboardBridge) { window.DashboardBridge.postMessage(msg); }
    }

    function setData(radarData) {
        currentData = radarData;
        render(radarData);
    }

    function render(radarData) {
        var grid = document.getElementById('meeting-notes-grid');
        if (!grid) { return; }
        grid.innerHTML = '';

        if (!radarData || !radarData.swimlanes) { return; }

        var todayName = window.DateUtils.getTodayDayName();

        for (var si = 0; si < radarData.swimlanes.length; si++) {
            var swimlane = radarData.swimlanes[si];
            var recurringItems = collectRecurringItems(swimlane);
            if (recurringItems.length === 0) { continue; }

            for (var ri = 0; ri < recurringItems.length; ri++) {
                var card = createCard(recurringItems[ri], todayName);
                grid.appendChild(card);
            }
        }
    }

    function collectRecurringItems(swimlane) {
        var items = [];
        for (var i = 0; i < swimlane.items.length; i++) {
            if (swimlane.items[i].recurrence) {
                items.push(swimlane.items[i]);
            }
        }
        for (var s = 0; s < swimlane.subGroups.length; s++) {
            var sg = swimlane.subGroups[s];
            for (var j = 0; j < sg.items.length; j++) {
                if (sg.items[j].recurrence) {
                    items.push(sg.items[j]);
                }
            }
        }
        return items;
    }

    function createCard(item, todayName) {
        var card = document.createElement('div');
        card.className = 'meeting-card';
        card.setAttribute('data-item-id', item.id);

        // Check if this item occurs today
        var eff = window.DateUtils.effectiveDate(item);
        if (eff && window.DateUtils.isToday(eff)) {
            card.classList.add('meeting-card-today');
        }

        // Header
        var header = document.createElement('div');
        header.className = 'meeting-card-header';

        var labelSpan = document.createElement('span');
        labelSpan.className = 'meeting-card-label';
        labelSpan.textContent = item.label;
        labelSpan.title = 'Double-click to rename';
        labelSpan.addEventListener('dblclick', function () {
            var input = window.EditUtils.createInlineEdit(item.label, function (newLabel) {
                if (newLabel) {
                    postMessage({ type: 'editRadarItem', id: item.id, label: newLabel, dateStr: '' });
                }
                input.replaceWith(labelSpan);
            }, function () {
                input.replaceWith(labelSpan);
            });
            labelSpan.replaceWith(input);
            input.focus();
            input.select();
        });

        header.appendChild(labelSpan);

        // Day badges for weekly items
        if (item.recurrence && item.recurrence.type === 'weekly') {
            var badges = document.createElement('span');
            badges.className = 'meeting-day-badges';
            badges.title = 'Double-click to edit schedule';
            var days = item.recurrence.days;
            for (var d = 0; d < days.length; d++) {
                var badge = document.createElement('span');
                badge.className = 'day-badge';
                if (days[d] === todayName) {
                    badge.classList.add('day-today');
                }
                badge.textContent = days[d];
                badges.appendChild(badge);
            }
            badges.addEventListener('dblclick', function (e) {
                e.stopPropagation();
                var currentDays = item.recurrence.days.join(', ');
                var input = window.EditUtils.createInlineEdit(currentDays, function (newVal) {
                    if (newVal) {
                        postMessage({ type: 'editRecurringSchedule', id: item.id, days: newVal });
                    }
                    input.replaceWith(badges);
                }, function () {
                    input.replaceWith(badges);
                });
                badges.replaceWith(input);
                input.focus();
                input.select();
            });
            header.appendChild(badges);
        }

        // Yearly badge
        if (item.recurrence && item.recurrence.type === 'yearly') {
            var yearlyBadge = document.createElement('span');
            yearlyBadge.className = 'meeting-yearly-badge';
            yearlyBadge.textContent = item.recurrence.month + '/' + item.recurrence.day;
            yearlyBadge.title = 'Double-click to edit schedule';
            yearlyBadge.addEventListener('dblclick', function (e) {
                e.stopPropagation();
                var currentMD = item.recurrence.month + '/' + item.recurrence.day;
                var input = window.EditUtils.createInlineEdit(currentMD, function (newVal) {
                    if (newVal) {
                        postMessage({ type: 'editRecurringSchedule', id: item.id, monthDay: newVal });
                    }
                    input.replaceWith(yearlyBadge);
                }, function () {
                    input.replaceWith(yearlyBadge);
                });
                yearlyBadge.replaceWith(input);
                input.focus();
                input.select();
            });
            header.appendChild(yearlyBadge);
        }

        // Delete button
        var delBtn = document.createElement('button');
        delBtn.className = 'meeting-delete-btn';
        delBtn.textContent = '\u00d7';
        delBtn.title = 'Delete';
        delBtn.addEventListener('click', function () {
            postMessage({ type: 'deleteRadarItem', id: item.id });
        });
        header.appendChild(delBtn);

        card.appendChild(header);

        // Sub-items list
        var subList = document.createElement('div');
        subList.className = 'meeting-sub-items';

        var subItems = item.subItems || [];
        for (var si = 0; si < subItems.length; si++) {
            (function (sub) {
                var subRow = document.createElement('div');
                subRow.className = 'meeting-sub-item';

                var bullet = document.createElement('span');
                bullet.className = 'sub-item-bullet';
                bullet.textContent = '\u2022';

                var textSpan = document.createElement('span');
                textSpan.className = 'meeting-sub-item-text';
                textSpan.textContent = sub.text;
                textSpan.title = 'Double-click to edit';
                textSpan.addEventListener('dblclick', function () {
                    var input = window.EditUtils.createInlineEdit(sub.text, function (newText) {
                        if (newText) {
                            postMessage({ type: 'editSubItem', id: sub.id, text: newText });
                        }
                        input.replaceWith(textSpan);
                    }, function () {
                        input.replaceWith(textSpan);
                    });
                    textSpan.replaceWith(input);
                    input.focus();
                    input.select();
                });

                var subDel = document.createElement('button');
                subDel.className = 'meeting-sub-item-delete';
                subDel.textContent = '\u00d7';
                subDel.title = 'Delete sub-item';
                subDel.addEventListener('click', function () {
                    postMessage({ type: 'deleteSubItem', id: sub.id });
                });

                subRow.appendChild(bullet);
                subRow.appendChild(textSpan);
                subRow.appendChild(subDel);
                subList.appendChild(subRow);
            })(subItems[si]);
        }

        card.appendChild(subList);

        // Add sub-item row
        var addRow = document.createElement('div');
        addRow.className = 'meeting-add-row';
        var addInput = document.createElement('input');
        addInput.type = 'text';
        addInput.placeholder = 'Add agenda item...';
        addInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                var text = addInput.value.trim();
                if (text) {
                    postMessage({ type: 'addSubItem', radarItemId: item.id, text: text });
                    addInput.value = '';
                }
            }
        });
        addRow.appendChild(addInput);
        card.appendChild(addRow);

        return card;
    }

    window.ReminderRenderer = { setData: setData };
})();
