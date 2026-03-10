// @ts-nocheck
/* Goals Renderer — goal cards with milestones and progress bars */
(function () {
    var currentData = null;
    var expandedGoalIds = {}; // track which goals are expanded across re-renders
    var swimlaneNames = [];

    function setSwimlanes(names) {
        swimlaneNames = names || [];
    }

    function postMessage(msg) {
        if (window.DashboardBridge) { window.DashboardBridge.postMessage(msg); }
    }

    // Shared utility aliases
    var parseMDYY = window.DateUtils.parseMDYY;
    var daysUntil = window.DateUtils.daysUntil;
    var getDaysClass = window.DateUtils.getDaysClass;
    var formatDaysBadge = window.DateUtils.formatDaysBadge;
    var toISODate = window.DateUtils.toISODate;
    var fromISODate = window.DateUtils.fromISODate;
    var createInlineEdit = window.EditUtils.createInlineEdit;
    var createAutocompleteEdit = window.EditUtils.createAutocompleteEdit;

    function computeProgress(goal) {
        if (goal.milestones.length === 0) { return goal.completed ? 100 : 0; }
        var total = 0;
        for (var i = 0; i < goal.milestones.length; i++) {
            if (goal.milestones[i].completed) { total += goal.milestones[i].weight; }
        }
        return Math.min(total, 100);
    }

    function getProgressColor(pct) {
        if (pct >= 100) { return 'var(--goal-blue, #4488ff)'; }
        if (pct >= 75) { return 'var(--goal-green, #44bb44)'; }
        if (pct >= 50) { return 'var(--goal-yellow, #ffcc00)'; }
        if (pct >= 25) { return 'var(--goal-orange, #ff8c00)'; }
        return 'var(--goal-red, #ff4444)';
    }

    function setData(data) {
        currentData = data;
        render(data);
    }

    function render(data) {
        var grid = document.getElementById('goals-grid');
        if (!grid) { return; }

        grid.innerHTML = '';

        if (!data || !data.sections || data.sections.length === 0) { return; }

        for (var si = 0; si < data.sections.length; si++) {
            (function (section) {
                var card = document.createElement('div');
                card.className = 'goal-card';

                // Header
                var header = document.createElement('div');
                header.className = 'goal-card-header';

                var nameSpan = document.createElement('span');
                nameSpan.className = 'goal-card-name';
                nameSpan.textContent = section.name;

                // Double-click name to rename
                nameSpan.addEventListener('dblclick', function (e) {
                    e.stopPropagation();
                    var input = createInlineEdit(section.name, function (newName) {
                        postMessage({ type: 'renameGoalSection', id: section.id, name: newName });
                        input.replaceWith(nameSpan);
                        nameSpan.textContent = newName;
                    }, function () {
                        input.replaceWith(nameSpan);
                    });
                    nameSpan.replaceWith(input);
                    input.focus();
                    input.select();
                });

                var delSectionBtn = document.createElement('button');
                delSectionBtn.className = 'goal-section-delete-btn';
                delSectionBtn.textContent = '\u00d7';
                delSectionBtn.title = 'Delete category';
                delSectionBtn.addEventListener('click', function () {
                    postMessage({ type: 'deleteGoalSection', id: section.id });
                });

                header.appendChild(nameSpan);
                header.appendChild(delSectionBtn);
                card.appendChild(header);

                // Goal items
                var goalsList = document.createElement('div');
                goalsList.className = 'goal-items-list';

                for (var gi = 0; gi < section.items.length; gi++) {
                    (function (goal) {
                        var goalContainer = document.createElement('div');
                        goalContainer.className = 'goal-item-container';

                        // Main goal row
                        var goalRow = document.createElement('div');
                        goalRow.className = 'goal-item' + (goal.completed ? ' completed' : '');

                        var checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.checked = goal.completed;
                        checkbox.addEventListener('change', function (e) {
                            e.stopPropagation();
                            if (!goal.completed) {
                                // If prompt already open, treat re-click as confirm
                                var existing = goalRow.parentNode.querySelector('.completion-prompt');
                                if (existing && existing._finish) {
                                    checkbox.checked = true;
                                    var inp = existing.querySelector('input');
                                    existing._finish(inp ? inp.value.trim() : '');
                                } else {
                                    showCompletionPrompt(goalRow, checkbox, function (note) {
                                        postMessage({ type: 'toggleGoal', id: goal.id, completionNote: note });
                                    });
                                }
                            } else {
                                postMessage({ type: 'toggleGoal', id: goal.id, completionNote: '' });
                            }
                        });

                        var textSpan = document.createElement('span');
                        textSpan.className = 'goal-text';
                        textSpan.textContent = goal.text;

                        // Double-click text to edit
                        textSpan.addEventListener('dblclick', function (e) {
                            e.stopPropagation();
                            var input = createInlineEdit(goal.text, function (newText) {
                                postMessage({ type: 'editGoal', id: goal.id, text: newText });
                                input.replaceWith(textSpan);
                                textSpan.textContent = newText;
                            }, function () {
                                input.replaceWith(textSpan);
                            });
                            textSpan.replaceWith(input);
                            input.focus();
                            input.select();
                        });

                        // Progress bar
                        var pct = computeProgress(goal);
                        var progressWrap = document.createElement('div');
                        progressWrap.className = 'goal-progress-bar';
                        var progressFill = document.createElement('div');
                        progressFill.className = 'goal-progress-fill';
                        progressFill.style.width = pct + '%';
                        progressFill.style.background = getProgressColor(pct);
                        progressWrap.appendChild(progressFill);

                        var progressLabel = document.createElement('span');
                        progressLabel.className = 'goal-progress-label';
                        progressLabel.textContent = pct + '%';

                        // Due date badge
                        var dueBadge = null;
                        if (goal.dueDate) {
                            var dueD = parseMDYY(goal.dueDate);
                            if (dueD) {
                                var days = daysUntil(dueD);
                                dueBadge = document.createElement('span');
                                dueBadge.className = 'due-badge ' + getDaysClass(days);
                                dueBadge.textContent = formatDaysBadge(days);
                                dueBadge.title = 'Due: ' + goal.dueDate;
                            }
                        }

                        // Radar badge (editable via double-click)
                        var radarBadge = document.createElement('span');
                        radarBadge.className = 'goal-radar-badge';
                        if (goal.radarLink) {
                            radarBadge.textContent = goal.radarLink;
                        } else {
                            radarBadge.textContent = 'No lane';
                            radarBadge.classList.add('empty');
                        }
                        radarBadge.addEventListener('dblclick', function (e) {
                            e.stopPropagation();
                            var acWrapper = createAutocompleteEdit(goal.radarLink || '', swimlaneNames, function (val) {
                                postMessage({ type: 'editGoalRadarLink', id: goal.id, radarLink: val });
                                acWrapper.replaceWith(radarBadge);
                                radarBadge.textContent = val || 'No lane';
                                if (val) { radarBadge.classList.remove('empty'); }
                                else { radarBadge.classList.add('empty'); }
                            }, function () {
                                acWrapper.replaceWith(radarBadge);
                            });
                            radarBadge.replaceWith(acWrapper);
                            acWrapper._input.focus();
                            acWrapper._input.select();
                        });

                        var delGoalBtn = document.createElement('button');
                        delGoalBtn.className = 'goal-delete-btn';
                        delGoalBtn.textContent = '\u00d7';
                        delGoalBtn.title = 'Delete goal';
                        delGoalBtn.addEventListener('click', function (e) {
                            e.stopPropagation();
                            postMessage({ type: 'deleteGoal', id: goal.id });
                        });

                        goalRow.appendChild(checkbox);
                        goalRow.appendChild(textSpan);
                        goalRow.appendChild(progressWrap);
                        goalRow.appendChild(progressLabel);
                        if (dueBadge) { goalRow.appendChild(dueBadge); }
                        goalRow.appendChild(radarBadge);
                        goalRow.appendChild(delGoalBtn);

                        goalContainer.appendChild(goalRow);

                        // Expanded details area (click to toggle)
                        var expanded = document.createElement('div');
                        expanded.className = expandedGoalIds[goal.id] ? 'goal-expanded' : 'goal-expanded collapsed';

                        // Due date row (double-click to edit with date picker)
                        var dueRow = document.createElement('div');
                        dueRow.className = 'goal-due-row';
                        if (goal.dueDate) {
                            var dueParsed = parseMDYY(goal.dueDate);
                            var dueDays = dueParsed ? daysUntil(dueParsed) : null;
                            dueRow.textContent = 'Due: ' + goal.dueDate;
                            if (dueDays !== null) {
                                dueRow.textContent += ' (' + formatDaysBadge(dueDays) + ')';
                                dueRow.style.color = '';
                                var cls = getDaysClass(dueDays);
                                if (cls === 'urgent' || cls === 'past') { dueRow.style.color = 'var(--urgent)'; }
                                else if (cls === 'warning') { dueRow.style.color = 'var(--warning)'; }
                            }
                        } else {
                            dueRow.textContent = 'No due date set';
                            dueRow.classList.add('empty');
                        }
                        dueRow.addEventListener('dblclick', function (e) {
                            e.stopPropagation();
                            var dateInput = document.createElement('input');
                            dateInput.type = 'date';
                            dateInput.className = 'goal-due-input';
                            dateInput.value = toISODate(goal.dueDate);
                            var dueDone = false;

                            function dueCleanup() {
                                document.removeEventListener('mousedown', onDueDocClick, true);
                            }

                            function saveDue() {
                                if (dueDone) { return; }
                                dueDone = true;
                                dueCleanup();
                                var newDate = fromISODate(dateInput.value);
                                postMessage({ type: 'editGoalDueDate', id: goal.id, dueDate: newDate });
                                dateInput.replaceWith(dueRow);
                                if (newDate) {
                                    dueRow.textContent = 'Due: ' + newDate;
                                    dueRow.classList.remove('empty');
                                } else {
                                    dueRow.textContent = 'No due date set';
                                    dueRow.classList.add('empty');
                                }
                            }

                            function cancelDue() {
                                if (dueDone) { return; }
                                dueDone = true;
                                dueCleanup();
                                dateInput.replaceWith(dueRow);
                            }

                            function onDueDocClick(e2) {
                                if (e2.target !== dateInput) { saveDue(); }
                            }

                            dateInput.addEventListener('change', saveDue);
                            dateInput.addEventListener('blur', function () {
                                setTimeout(function () {
                                    if (!dueDone) { saveDue(); }
                                }, 100);
                            });
                            dateInput.addEventListener('keydown', function (e2) {
                                if (e2.key === 'Escape') { cancelDue(); }
                            });

                            document.addEventListener('mousedown', onDueDocClick, true);
                            dueRow.replaceWith(dateInput);
                            dateInput.focus();
                        });
                        expanded.appendChild(dueRow);

                        // Completion note (if any)
                        if (goal.completionNote) {
                            var compRow = document.createElement('div');
                            compRow.className = 'goal-completion-note';
                            compRow.textContent = 'Completed ' + goal.completionNote;
                            compRow.addEventListener('dblclick', function (e) {
                                e.stopPropagation();
                                var input = createInlineEdit(goal.completionNote, function (val) {
                                    postMessage({ type: 'editGoalCompletionNote', id: goal.id, completionNote: val });
                                    input.replaceWith(compRow);
                                    compRow.textContent = 'Completed ' + val;
                                }, function () {
                                    input.replaceWith(compRow);
                                });
                                compRow.replaceWith(input);
                                input.focus();
                                input.select();
                            });
                            expanded.appendChild(compRow);
                        }

                        // Milestones list
                        var msList = document.createElement('div');
                        msList.className = 'milestone-list';

                        for (var mi = 0; mi < goal.milestones.length; mi++) {
                            (function (ms) {
                                var msRow = document.createElement('div');
                                msRow.className = 'milestone-item' + (ms.completed ? ' completed' : '');

                                var msCheck = document.createElement('input');
                                msCheck.type = 'checkbox';
                                msCheck.checked = ms.completed;
                                msCheck.addEventListener('change', function (e) {
                                    e.stopPropagation();
                                    if (!ms.completed) {
                                        // If prompt already open, treat re-click as confirm
                                        var existing = msRow.parentNode.querySelector('.completion-prompt');
                                        if (existing && existing._finish) {
                                            msCheck.checked = true;
                                            var inp = existing.querySelector('input');
                                            existing._finish(inp ? inp.value.trim() : '');
                                        } else {
                                            showCompletionPrompt(msRow, msCheck, function (note) {
                                                postMessage({ type: 'toggleMilestone', id: ms.id, completionNote: note });
                                            });
                                        }
                                    } else {
                                        postMessage({ type: 'toggleMilestone', id: ms.id, completionNote: '' });
                                    }
                                });

                                var msText = document.createElement('span');
                                msText.className = 'milestone-text';
                                msText.textContent = ms.text;

                                // Double-click to edit milestone
                                msText.addEventListener('dblclick', function (e) {
                                    e.stopPropagation();
                                    var editWrap = document.createElement('div');
                                    editWrap.className = 'milestone-edit-form';

                                    var textInput = document.createElement('input');
                                    textInput.type = 'text';
                                    textInput.className = 'inline-edit';
                                    textInput.value = ms.text;

                                    var weightInput = document.createElement('input');
                                    weightInput.type = 'number';
                                    weightInput.className = 'inline-edit milestone-weight-input';
                                    weightInput.value = ms.weight;
                                    weightInput.min = '0';
                                    weightInput.max = '100';
                                    weightInput.title = 'Weight %';

                                    var msDueInput = document.createElement('input');
                                    msDueInput.type = 'date';
                                    msDueInput.className = 'milestone-due-input';
                                    msDueInput.value = toISODate(ms.dueDate);
                                    msDueInput.title = 'Due date';

                                    var editDone = false;

                                    function editCleanup() {
                                        document.removeEventListener('mousedown', onEditDocClick, true);
                                    }

                                    function save() {
                                        if (editDone) { return; }
                                        editDone = true;
                                        editCleanup();
                                        var newText = textInput.value.trim();
                                        var newWeight = parseInt(weightInput.value, 10) || 0;
                                        var newDue = fromISODate(msDueInput.value);
                                        if (newText) {
                                            postMessage({ type: 'editMilestone', id: ms.id, text: newText, weight: newWeight });
                                            if (newDue !== (ms.dueDate || '')) {
                                                postMessage({ type: 'editMilestoneDueDate', id: ms.id, dueDate: newDue });
                                            }
                                        }
                                        editWrap.replaceWith(msRow);
                                    }

                                    function cancel() {
                                        if (editDone) { return; }
                                        editDone = true;
                                        editCleanup();
                                        editWrap.replaceWith(msRow);
                                    }

                                    function onEditDocClick(e) {
                                        if (!editWrap.contains(e.target)) { save(); }
                                    }

                                    textInput.addEventListener('keydown', function (e) {
                                        if (e.key === 'Enter') { save(); }
                                        if (e.key === 'Escape') { cancel(); }
                                    });
                                    weightInput.addEventListener('keydown', function (e) {
                                        if (e.key === 'Enter') { save(); }
                                        if (e.key === 'Escape') { cancel(); }
                                    });
                                    msDueInput.addEventListener('keydown', function (e) {
                                        if (e.key === 'Enter') { save(); }
                                        if (e.key === 'Escape') { cancel(); }
                                    });
                                    textInput.addEventListener('blur', function () {
                                        setTimeout(function () {
                                            if (!editWrap.contains(document.activeElement)) { save(); }
                                        }, 100);
                                    });
                                    weightInput.addEventListener('blur', function () {
                                        setTimeout(function () {
                                            if (!editWrap.contains(document.activeElement)) { save(); }
                                        }, 100);
                                    });
                                    msDueInput.addEventListener('blur', function () {
                                        setTimeout(function () {
                                            if (!editWrap.contains(document.activeElement)) { save(); }
                                        }, 100);
                                    });

                                    document.addEventListener('mousedown', onEditDocClick, true);

                                    editWrap.appendChild(textInput);
                                    editWrap.appendChild(weightInput);
                                    editWrap.appendChild(msDueInput);
                                    msRow.replaceWith(editWrap);
                                    textInput.focus();
                                    textInput.select();
                                });

                                var msWeight = document.createElement('span');
                                msWeight.className = 'milestone-weight';
                                msWeight.textContent = '(' + ms.weight + '%)';

                                // Milestone due date badge
                                var msDueBadge = null;
                                if (ms.dueDate) {
                                    var msDueD = parseMDYY(ms.dueDate);
                                    if (msDueD) {
                                        var msDays = daysUntil(msDueD);
                                        msDueBadge = document.createElement('span');
                                        msDueBadge.className = 'due-badge ' + getDaysClass(msDays);
                                        msDueBadge.textContent = formatDaysBadge(msDays);
                                        msDueBadge.title = 'Due: ' + ms.dueDate;
                                    }
                                }

                                var msDelBtn = document.createElement('button');
                                msDelBtn.className = 'milestone-delete-btn';
                                msDelBtn.textContent = '\u00d7';
                                msDelBtn.title = 'Delete milestone';
                                msDelBtn.addEventListener('click', function (e) {
                                    e.stopPropagation();
                                    postMessage({ type: 'deleteMilestone', id: ms.id });
                                });

                                msRow.appendChild(msCheck);
                                msRow.appendChild(msText);
                                msRow.appendChild(msWeight);
                                if (msDueBadge) { msRow.appendChild(msDueBadge); }
                                msRow.appendChild(msDelBtn);

                                // Milestone completion note
                                if (ms.completionNote) {
                                    var msCompNote = document.createElement('div');
                                    msCompNote.className = 'milestone-completion-note';
                                    msCompNote.textContent = 'Completed ' + ms.completionNote;
                                    msList.appendChild(msRow);
                                    msList.appendChild(msCompNote);
                                } else {
                                    msList.appendChild(msRow);
                                }
                            })(goal.milestones[mi]);
                        }

                        expanded.appendChild(msList);

                        // Add milestone input
                        var msAddRow = document.createElement('div');
                        msAddRow.className = 'milestone-add-row';

                        var msAddInput = document.createElement('input');
                        msAddInput.type = 'text';
                        msAddInput.className = 'milestone-add-input';
                        msAddInput.placeholder = 'Add milestone...';

                        var msWeightInput = document.createElement('input');
                        msWeightInput.type = 'number';
                        msWeightInput.className = 'milestone-add-weight';
                        msWeightInput.placeholder = '%';
                        msWeightInput.min = '0';
                        msWeightInput.max = '100';

                        function submitMilestone() {
                            var text = msAddInput.value.trim();
                            if (text) {
                                var weight = parseInt(msWeightInput.value, 10) || 0;
                                postMessage({ type: 'addMilestone', goalId: goal.id, text: text, weight: weight });
                                msAddInput.value = '';
                                msWeightInput.value = '';
                            }
                        }

                        msAddInput.addEventListener('keydown', function (e) {
                            if (e.key === 'Enter') { submitMilestone(); }
                        });
                        msWeightInput.addEventListener('keydown', function (e) {
                            if (e.key === 'Enter') { submitMilestone(); }
                        });

                        msAddRow.appendChild(msAddInput);
                        msAddRow.appendChild(msWeightInput);
                        expanded.appendChild(msAddRow);

                        goalContainer.appendChild(expanded);

                        // Click goal row to expand/collapse
                        textSpan.addEventListener('click', function (e) {
                            var isCollapsed = expanded.classList.toggle('collapsed');
                            if (isCollapsed) {
                                delete expandedGoalIds[goal.id];
                            } else {
                                expandedGoalIds[goal.id] = true;
                            }
                        });

                        goalsList.appendChild(goalContainer);
                    })(section.items[gi]);
                }

                card.appendChild(goalsList);

                // Add goal input
                var addGoalRow = document.createElement('div');
                addGoalRow.className = 'goal-add-row';

                var addGoalInput = document.createElement('input');
                addGoalInput.type = 'text';
                addGoalInput.className = 'goal-add-input';
                addGoalInput.placeholder = 'Add goal...';
                addGoalInput.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') {
                        var text = addGoalInput.value.trim();
                        if (text) {
                            postMessage({ type: 'addGoal', sectionId: section.id, text: text });
                            addGoalInput.value = '';
                        }
                    }
                });

                addGoalRow.appendChild(addGoalInput);
                card.appendChild(addGoalRow);

                grid.appendChild(card);
            })(data.sections[si]);
        }
    }

    function showCompletionPrompt(row, checkbox, onDone) {
        // Don't reverse the checkbox — let the browser toggle stand.
        // The prompt gives the user a chance to add a note before confirming.

        // If a prompt is already open on this row, don't stack another
        var existing = row.parentNode.querySelector('.completion-prompt');
        if (existing) { return; }

        var finished = false;
        var prompt = document.createElement('div');
        prompt.className = 'completion-prompt';

        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-edit';
        input.placeholder = 'Completion note (optional)...';

        function promptCleanup() {
            document.removeEventListener('mousedown', onPromptDocClick, true);
        }

        function finish(note) {
            if (finished) { return; }
            finished = true;
            promptCleanup();
            prompt.remove();
            onDone(note || '');
        }

        function cancel() {
            if (finished) { return; }
            finished = true;
            promptCleanup();
            checkbox.checked = false; // revert since user cancelled
            prompt.remove();
        }

        function onPromptDocClick(e) {
            // Click outside prompt and not on the checkbox → confirm with current note
            if (!prompt.contains(e.target) && e.target !== checkbox) {
                finish(input.value.trim());
            }
        }

        // Expose finish so the checkbox change handler can call it directly
        prompt._finish = finish;

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { finish(input.value.trim()); }
            if (e.key === 'Escape') { cancel(); }
        });
        // Use setTimeout on blur so a checkbox re-click or mousedown fires first
        input.addEventListener('blur', function () {
            setTimeout(function () {
                if (!finished) { finish(input.value.trim()); }
            }, 150);
        });

        document.addEventListener('mousedown', onPromptDocClick, true);

        prompt.appendChild(input);
        row.parentNode.insertBefore(prompt, row.nextSibling);
        input.focus();
    }

    window.GoalsRenderer = { setData: setData, setSwimlanes: setSwimlanes };
})();
