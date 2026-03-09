// @ts-nocheck
/* Reminder Renderer — meeting cards with talking points */
(function () {
    var currentData = null;

    function postMessage(msg) {
        if (window.DashboardBridge) { window.DashboardBridge.postMessage(msg); }
    }

    function getTodayDayName() {
        var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return days[new Date().getDay()];
    }

    function setData(data) {
        currentData = data;
        render(data);
    }

    function render(data) {
        var grid = document.getElementById('reminders-grid');
        if (!grid) { return; }

        grid.innerHTML = '';

        if (!data || !data.meetings || data.meetings.length === 0) { return; }

        var today = getTodayDayName();

        for (var i = 0; i < data.meetings.length; i++) {
            (function (meeting) {
                var isToday = meeting.days.indexOf(today) >= 0;

                var card = document.createElement('div');
                card.className = 'reminder-card' + (isToday ? ' reminder-today' : '');

                // Header
                var header = document.createElement('div');
                header.className = 'reminder-card-header';

                var nameSpan = document.createElement('span');
                nameSpan.className = 'reminder-card-name';
                nameSpan.textContent = meeting.name;

                // Double-click name to rename
                nameSpan.addEventListener('dblclick', function (e) {
                    e.stopPropagation();
                    var editForm = document.createElement('div');
                    editForm.className = 'reminder-rename-form';

                    var nameInput = document.createElement('input');
                    nameInput.type = 'text';
                    nameInput.className = 'inline-edit';
                    nameInput.value = meeting.name;

                    var daysInput = document.createElement('input');
                    daysInput.type = 'text';
                    daysInput.className = 'inline-edit';
                    daysInput.value = meeting.days.join(', ');
                    daysInput.placeholder = 'Days (e.g. Mon, Wed)';

                    function save() {
                        var newName = nameInput.value.trim();
                        if (newName) {
                            postMessage({
                                type: 'renameMeeting',
                                id: meeting.id,
                                name: newName,
                                days: daysInput.value.trim(),
                            });
                        }
                        editForm.replaceWith(header);
                    }

                    function cancel() {
                        editForm.replaceWith(header);
                    }

                    nameInput.addEventListener('keydown', function (e) {
                        if (e.key === 'Enter') { save(); }
                        if (e.key === 'Escape') { cancel(); }
                    });
                    daysInput.addEventListener('keydown', function (e) {
                        if (e.key === 'Enter') { save(); }
                        if (e.key === 'Escape') { cancel(); }
                    });
                    nameInput.addEventListener('blur', function () {
                        // Delay to allow click on daysInput
                        setTimeout(function () {
                            if (!editForm.contains(document.activeElement)) { save(); }
                        }, 100);
                    });
                    daysInput.addEventListener('blur', function () {
                        setTimeout(function () {
                            if (!editForm.contains(document.activeElement)) { save(); }
                        }, 100);
                    });

                    editForm.appendChild(nameInput);
                    editForm.appendChild(daysInput);
                    header.replaceWith(editForm);
                    nameInput.focus();
                    nameInput.select();
                });

                // Day badges
                var badgeContainer = document.createElement('div');
                badgeContainer.className = 'reminder-day-badges';
                for (var di = 0; di < meeting.days.length; di++) {
                    var badge = document.createElement('span');
                    badge.className = 'day-badge' + (meeting.days[di] === today ? ' day-today' : '');
                    badge.textContent = meeting.days[di];
                    badgeContainer.appendChild(badge);
                }

                // Header buttons (hover-reveal)
                var headerBtns = document.createElement('div');
                headerBtns.className = 'reminder-header-btns';

                var clearBtn = document.createElement('button');
                clearBtn.className = 'reminder-clear-btn';
                clearBtn.textContent = 'Clear All';
                clearBtn.title = 'Remove all talking points';
                clearBtn.addEventListener('click', function () {
                    postMessage({ type: 'clearMeeting', id: meeting.id });
                });

                var delMeetingBtn = document.createElement('button');
                delMeetingBtn.className = 'reminder-delete-meeting-btn';
                delMeetingBtn.textContent = '\u00d7';
                delMeetingBtn.title = 'Delete meeting';
                delMeetingBtn.addEventListener('click', function () {
                    postMessage({ type: 'deleteMeeting', id: meeting.id });
                });

                headerBtns.appendChild(clearBtn);
                headerBtns.appendChild(delMeetingBtn);

                header.appendChild(nameSpan);
                header.appendChild(badgeContainer);
                header.appendChild(headerBtns);
                card.appendChild(header);

                // Points list
                var pointsList = document.createElement('div');
                pointsList.className = 'reminder-points';

                for (var pi = 0; pi < meeting.points.length; pi++) {
                    (function (point) {
                        var pointRow = document.createElement('div');
                        pointRow.className = 'reminder-point';

                        var bullet = document.createElement('span');
                        bullet.className = 'reminder-bullet';
                        bullet.textContent = '\u2022';

                        var textSpan = document.createElement('span');
                        textSpan.className = 'reminder-point-text';
                        textSpan.textContent = point.text;

                        // Double-click to edit
                        textSpan.addEventListener('dblclick', function () {
                            var input = document.createElement('input');
                            input.type = 'text';
                            input.className = 'inline-edit';
                            input.value = point.text;

                            function save() {
                                var newText = input.value.trim();
                                if (newText && newText !== point.text) {
                                    postMessage({
                                        type: 'editPoint',
                                        id: point.id,
                                        text: newText,
                                    });
                                }
                                input.replaceWith(textSpan);
                                textSpan.textContent = newText || point.text;
                            }

                            input.addEventListener('blur', save);
                            input.addEventListener('keydown', function (e) {
                                if (e.key === 'Enter') { save(); }
                                if (e.key === 'Escape') { input.replaceWith(textSpan); }
                            });

                            textSpan.replaceWith(input);
                            input.focus();
                            input.select();
                        });

                        var delBtn = document.createElement('button');
                        delBtn.className = 'reminder-point-delete';
                        delBtn.textContent = '\u00d7';
                        delBtn.title = 'Delete point';
                        delBtn.addEventListener('click', function () {
                            postMessage({ type: 'deletePoint', id: point.id });
                        });

                        pointRow.appendChild(bullet);
                        pointRow.appendChild(textSpan);
                        pointRow.appendChild(delBtn);
                        pointsList.appendChild(pointRow);
                    })(meeting.points[pi]);
                }

                card.appendChild(pointsList);

                // Inline add input (always visible)
                var addRow = document.createElement('div');
                addRow.className = 'reminder-add-row';

                var addInput = document.createElement('input');
                addInput.type = 'text';
                addInput.className = 'reminder-add-input';
                addInput.placeholder = 'Add talking point...';
                addInput.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') {
                        var text = addInput.value.trim();
                        if (text) {
                            postMessage({
                                type: 'addPoint',
                                meetingId: meeting.id,
                                text: text,
                            });
                            addInput.value = '';
                        }
                    }
                });

                addRow.appendChild(addInput);
                card.appendChild(addRow);

                grid.appendChild(card);
            })(data.meetings[i]);
        }
    }

    window.ReminderRenderer = { setData: setData };
})();
