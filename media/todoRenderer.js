// @ts-nocheck
/* Todo DOM Renderer — widget grid layout with inline details */
(function () {
    var todoData = null;
    var currentLayout = {};
    var draggedItemId = null;
    var expandedItemId = null;
    var swimlaneNames = [];

    function setSwimlanes(names) {
        swimlaneNames = names || [];
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

    function setData(data, layout) {
        todoData = data;
        if (layout) { currentLayout = layout; }
        render();
    }

    function render() {
        var container = document.getElementById('todo-grid');
        if (!container || !todoData) { return; }

        // Index existing widget elements to preserve their inline layout styles
        var existingWidgets = {};
        var existingEls = container.querySelectorAll('.grid-widget');
        for (var ei = 0; ei < existingEls.length; ei++) {
            existingWidgets[existingEls[ei].dataset.sectionId] = existingEls[ei];
        }
        var activeSectionIds = {};

        for (var si = 0; si < todoData.sections.length; si++) {
            (function (section) {
                activeSectionIds[section.id] = true;

                // Reuse existing widget element to preserve gridColumn/height
                var widget = existingWidgets[section.id];
                var isNew = !widget;

                if (isNew) {
                    widget = document.createElement('div');
                    widget.className = 'grid-widget';
                    widget.dataset.sectionId = section.id;

                    // Apply saved layout for newly created widgets
                    var cfg = currentLayout[section.id];
                    if (cfg) {
                        if (cfg.w) { widget.style.gridColumn = 'span ' + cfg.w; }
                        if (cfg.h) { widget.style.height = cfg.h + 'px'; }
                    }
                }

                // Clear contents but keep the shell element (preserves inline styles)
                widget.innerHTML = '';

                // ---- Widget Header (drag handle) ----
                var header = document.createElement('div');
                header.className = 'widget-header';

                var titleEl = document.createElement('span');
                titleEl.className = 'widget-title';
                titleEl.textContent = section.name;

                // Double-click to rename section
                titleEl.addEventListener('dblclick', function (e) {
                    e.stopPropagation();
                    var input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'inline-edit';
                    input.value = section.name;
                    titleEl.replaceWith(input);
                    input.focus();
                    input.select();
                    var renameDone = false;

                    function renameCleanup() {
                        document.removeEventListener('mousedown', onRenameDocClick, true);
                    }

                    function save() {
                        if (renameDone) { return; }
                        renameDone = true;
                        renameCleanup();
                        var newName = input.value.trim();
                        if (newName && newName !== section.name) {
                            window.DashboardBridge.postMessage({
                                type: 'renameTodoSection',
                                id: section.id,
                                name: newName,
                            });
                        }
                        input.replaceWith(titleEl);
                        titleEl.textContent = newName || section.name;
                    }

                    function onRenameDocClick(e2) {
                        if (e2.target !== input) { save(); }
                    }

                    input.addEventListener('blur', save);
                    input.addEventListener('keydown', function (e) {
                        if (e.key === 'Enter') { save(); }
                        if (e.key === 'Escape') {
                            if (renameDone) { return; }
                            renameDone = true;
                            renameCleanup();
                            input.replaceWith(titleEl);
                        }
                    });

                    document.addEventListener('mousedown', onRenameDocClick, true);
                });
                header.appendChild(titleEl);

                // Add todo button
                var addBtn = document.createElement('button');
                addBtn.className = 'section-add-btn';
                addBtn.textContent = '+';
                addBtn.title = 'Add todo to this section';
                addBtn.addEventListener('click', function () {
                    var form = widget.querySelector('.section-add-form');
                    if (form) {
                        form.classList.remove('hidden');
                        form.querySelector('input').focus();
                    }
                });
                header.appendChild(addBtn);

                // Delete section button
                var delBtn = document.createElement('button');
                delBtn.className = 'section-delete-btn';
                delBtn.textContent = '\u00d7';
                delBtn.title = 'Delete section';
                delBtn.addEventListener('click', function () {
                    window.DashboardBridge.postMessage({
                        type: 'deleteTodoSection',
                        id: section.id,
                    });
                });
                header.appendChild(delBtn);

                widget.appendChild(header);

                // ---- Widget Body (scrollable item list) ----
                var body = document.createElement('div');
                body.className = 'widget-body';

                // Drop zone handlers for the widget body
                body.addEventListener('dragover', function (e) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    widget.classList.add('drag-over');

                    // Calculate drop indicator position
                    var afterElement = getDragAfterElement(body, e.clientY);
                    var indicator = body.querySelector('.drop-indicator');
                    if (!indicator) {
                        indicator = document.createElement('div');
                        indicator.className = 'drop-indicator';
                        body.appendChild(indicator);
                    }
                    if (afterElement) {
                        body.insertBefore(indicator, afterElement);
                    } else {
                        body.appendChild(indicator);
                    }
                    indicator.style.display = 'block';
                });

                body.addEventListener('dragleave', function (e) {
                    if (!body.contains(e.relatedTarget)) {
                        widget.classList.remove('drag-over');
                        var indicator = body.querySelector('.drop-indicator');
                        if (indicator) { indicator.style.display = 'none'; }
                    }
                });

                body.addEventListener('drop', function (e) {
                    e.preventDefault();
                    widget.classList.remove('drag-over');
                    var indicator = body.querySelector('.drop-indicator');
                    if (indicator) { indicator.style.display = 'none'; }

                    var itemId = e.dataTransfer.getData('text/plain');
                    if (!itemId) { return; }

                    var afterElement = getDragAfterElement(body, e.clientY);
                    var newIndex;
                    if (afterElement) {
                        var allItems = body.querySelectorAll('.todo-item');
                        newIndex = 0;
                        for (var ai = 0; ai < allItems.length; ai++) {
                            if (allItems[ai] === afterElement) {
                                newIndex = ai;
                                break;
                            }
                        }
                    } else {
                        newIndex = section.items.length;
                    }

                    window.DashboardBridge.postMessage({
                        type: 'moveTodo',
                        id: itemId,
                        targetSectionId: section.id,
                        newIndex: newIndex,
                    });
                });

                // Render items
                for (var i = 0; i < section.items.length; i++) {
                    (function (item) {
                        var row = document.createElement('div');
                        row.className = 'todo-item' + (item.completed ? ' completed' : '');
                        row.draggable = true;
                        row.dataset.itemId = item.id;

                        row.addEventListener('dragstart', function (e) {
                            draggedItemId = item.id;
                            e.dataTransfer.setData('text/plain', item.id);
                            e.dataTransfer.effectAllowed = 'move';
                            setTimeout(function () { row.classList.add('dragging'); }, 0);
                        });

                        row.addEventListener('dragend', function () {
                            row.classList.remove('dragging');
                            draggedItemId = null;
                            var allWidgets = document.querySelectorAll('.grid-widget');
                            for (var wi = 0; wi < allWidgets.length; wi++) {
                                allWidgets[wi].classList.remove('drag-over');
                                var ind = allWidgets[wi].querySelector('.drop-indicator');
                                if (ind) { ind.style.display = 'none'; }
                            }
                        });

                        // Checkbox
                        var cb = document.createElement('input');
                        cb.type = 'checkbox';
                        cb.checked = item.completed;
                        cb.addEventListener('change', function () {
                            window.DashboardBridge.postMessage({
                                type: 'toggleTodo',
                                id: item.id,
                            });
                        });
                        row.appendChild(cb);

                        // Text
                        var textEl = document.createElement('span');
                        textEl.className = 'todo-text';
                        textEl.textContent = item.text;

                        // Click to expand/collapse notes
                        textEl.addEventListener('click', function () {
                            if (expandedItemId === item.id) {
                                expandedItemId = null;
                            } else {
                                expandedItemId = item.id;
                            }
                            render();
                        });

                        // Double-click to inline edit
                        textEl.addEventListener('dblclick', function (e) {
                            e.stopPropagation();
                            var input = document.createElement('input');
                            input.type = 'text';
                            input.className = 'inline-edit';
                            input.value = item.text;
                            textEl.replaceWith(input);
                            input.focus();
                            input.select();
                            var textDone = false;

                            function textCleanup() {
                                document.removeEventListener('mousedown', onTextDocClick, true);
                            }

                            function save() {
                                if (textDone) { return; }
                                textDone = true;
                                textCleanup();
                                var newText = input.value.trim();
                                if (newText && newText !== item.text) {
                                    window.DashboardBridge.postMessage({
                                        type: 'editTodoItem',
                                        id: item.id,
                                        text: newText,
                                    });
                                }
                                input.replaceWith(textEl);
                                textEl.textContent = newText || item.text;
                            }

                            function onTextDocClick(e2) {
                                if (e2.target !== input) { save(); }
                            }

                            input.addEventListener('blur', save);
                            input.addEventListener('keydown', function (e) {
                                if (e.key === 'Enter') { save(); }
                                if (e.key === 'Escape') {
                                    if (textDone) { return; }
                                    textDone = true;
                                    textCleanup();
                                    input.replaceWith(textEl);
                                }
                            });

                            document.addEventListener('mousedown', onTextDocClick, true);
                        });
                        row.appendChild(textEl);

                        // Due date badge
                        if (item.dueDate) {
                            var dueD = parseMDYY(item.dueDate);
                            if (dueD) {
                                var days = daysUntil(dueD);
                                var dueBadge = document.createElement('span');
                                dueBadge.className = 'due-badge ' + getDaysClass(days);
                                dueBadge.textContent = formatDaysBadge(days);
                                dueBadge.title = 'Due: ' + item.dueDate;
                                dueBadge.addEventListener('dblclick', function (e) {
                                    e.stopPropagation();
                                    var dateInput = document.createElement('input');
                                    dateInput.type = 'date';
                                    dateInput.className = 'todo-due-input';
                                    dateInput.value = toISODate(item.dueDate);
                                    var badgeDueDone = false;

                                    function badgeDueCleanup() {
                                        document.removeEventListener('mousedown', onBadgeDueDocClick, true);
                                    }

                                    function saveDue() {
                                        if (badgeDueDone) { return; }
                                        badgeDueDone = true;
                                        badgeDueCleanup();
                                        var newDate = fromISODate(dateInput.value);
                                        window.DashboardBridge.postMessage({ type: 'editTodoDueDate', id: item.id, dueDate: newDate });
                                        dateInput.replaceWith(dueBadge);
                                    }

                                    function onBadgeDueDocClick(e2) {
                                        if (e2.target !== dateInput) { saveDue(); }
                                    }

                                    dateInput.addEventListener('change', saveDue);
                                    dateInput.addEventListener('blur', function () {
                                        setTimeout(function () {
                                            if (!badgeDueDone) { saveDue(); }
                                        }, 100);
                                    });
                                    dateInput.addEventListener('keydown', function (e2) {
                                        if (e2.key === 'Escape') {
                                            if (badgeDueDone) { return; }
                                            badgeDueDone = true;
                                            badgeDueCleanup();
                                            dateInput.replaceWith(dueBadge);
                                        }
                                    });

                                    document.addEventListener('mousedown', onBadgeDueDocClick, true);
                                    dueBadge.replaceWith(dateInput);
                                    dateInput.focus();
                                });
                                row.appendChild(dueBadge);
                            }
                        }

                        // Radar link badge
                        var radarBadge = null;
                        if (item.radarLink) {
                            radarBadge = document.createElement('span');
                            radarBadge.className = 'todo-radar-badge';
                            radarBadge.textContent = item.radarLink;
                            radarBadge.addEventListener('dblclick', function (e) {
                                e.stopPropagation();
                                var acWrapper = createAutocompleteEdit(item.radarLink || '', swimlaneNames, function (val) {
                                    window.DashboardBridge.postMessage({ type: 'editTodoRadarLink', id: item.id, radarLink: val });
                                    acWrapper.replaceWith(radarBadge);
                                    radarBadge.textContent = val || '';
                                }, function () {
                                    acWrapper.replaceWith(radarBadge);
                                });
                                radarBadge.replaceWith(acWrapper);
                                acWrapper._input.focus();
                                acWrapper._input.select();
                            });
                            row.appendChild(radarBadge);
                        }

                        // Notes indicator
                        if (item.notes && item.notes.trim()) {
                            var indicator = document.createElement('span');
                            indicator.className = 'notes-indicator';
                            indicator.textContent = '\u2637';
                            indicator.title = 'Has notes';
                            row.appendChild(indicator);
                        }

                        // Delete button
                        var itemDelBtn = document.createElement('button');
                        itemDelBtn.className = 'close-btn';
                        itemDelBtn.textContent = '\u00d7';
                        itemDelBtn.addEventListener('click', function () {
                            window.DashboardBridge.postMessage({
                                type: 'deleteTodoItem',
                                id: item.id,
                            });
                        });
                        row.appendChild(itemDelBtn);

                        body.appendChild(row);

                        // Inline notes expansion
                        if (expandedItemId === item.id) {
                            var notesDiv = document.createElement('div');
                            notesDiv.className = 'todo-item-details';

                            // Due date row (double-click to edit with date picker)
                            var dueRow = document.createElement('div');
                            dueRow.className = 'todo-detail-row';
                            if (item.dueDate) {
                                var dueParsed = parseMDYY(item.dueDate);
                                var dueDays = dueParsed ? daysUntil(dueParsed) : null;
                                dueRow.textContent = 'Due: ' + item.dueDate;
                                if (dueDays !== null) {
                                    dueRow.textContent += ' (' + formatDaysBadge(dueDays) + ')';
                                    var cls = getDaysClass(dueDays);
                                    if (cls === 'urgent' || cls === 'past') { dueRow.style.color = 'var(--urgent)'; }
                                    else if (cls === 'warning') { dueRow.style.color = 'var(--warning)'; }
                                }
                            } else {
                                dueRow.textContent = 'No due date';
                                dueRow.classList.add('empty');
                            }
                            dueRow.addEventListener('dblclick', function (e) {
                                e.stopPropagation();
                                var dateInput = document.createElement('input');
                                dateInput.type = 'date';
                                dateInput.className = 'todo-due-input';
                                dateInput.value = toISODate(item.dueDate);
                                var rowDueDone = false;

                                function rowDueCleanup() {
                                    document.removeEventListener('mousedown', onRowDueDocClick, true);
                                }

                                function saveDue() {
                                    if (rowDueDone) { return; }
                                    rowDueDone = true;
                                    rowDueCleanup();
                                    var newDate = fromISODate(dateInput.value);
                                    window.DashboardBridge.postMessage({ type: 'editTodoDueDate', id: item.id, dueDate: newDate });
                                    dateInput.replaceWith(dueRow);
                                }

                                function onRowDueDocClick(e2) {
                                    if (e2.target !== dateInput) { saveDue(); }
                                }

                                dateInput.addEventListener('change', saveDue);
                                dateInput.addEventListener('blur', function () {
                                    setTimeout(function () {
                                        if (!rowDueDone) { saveDue(); }
                                    }, 100);
                                });
                                dateInput.addEventListener('keydown', function (e2) {
                                    if (e2.key === 'Escape') {
                                        if (rowDueDone) { return; }
                                        rowDueDone = true;
                                        rowDueCleanup();
                                        dateInput.replaceWith(dueRow);
                                    }
                                });

                                document.addEventListener('mousedown', onRowDueDocClick, true);
                                dueRow.replaceWith(dateInput);
                                dateInput.focus();
                            });
                            notesDiv.appendChild(dueRow);

                            // Radar link row (double-click to edit)
                            var linkRow = document.createElement('div');
                            linkRow.className = 'todo-detail-row';
                            if (item.radarLink) {
                                linkRow.textContent = 'Lane: ' + item.radarLink;
                            } else {
                                linkRow.textContent = 'No swim lane';
                                linkRow.classList.add('empty');
                            }
                            linkRow.addEventListener('dblclick', function (e) {
                                e.stopPropagation();
                                var acWrapper = createAutocompleteEdit(item.radarLink || '', swimlaneNames, function (val) {
                                    window.DashboardBridge.postMessage({ type: 'editTodoRadarLink', id: item.id, radarLink: val });
                                    acWrapper.replaceWith(linkRow);
                                    if (val) {
                                        linkRow.textContent = 'Lane: ' + val;
                                        linkRow.classList.remove('empty');
                                    } else {
                                        linkRow.textContent = 'No swim lane';
                                        linkRow.classList.add('empty');
                                    }
                                }, function () {
                                    acWrapper.replaceWith(linkRow);
                                });
                                linkRow.replaceWith(acWrapper);
                                acWrapper._input.focus();
                                acWrapper._input.select();
                            });
                            notesDiv.appendChild(linkRow);

                            if (item.notes && item.notes.trim()) {
                                var noteLines = item.notes.split('\n');
                                for (var d = 0; d < noteLines.length; d++) {
                                    var noteLine = noteLines[d];
                                    if (!noteLine.trim()) { continue; }
                                    var lineEl = document.createElement('div');
                                    if (noteLine.match(/^- /)) {
                                        lineEl.className = 'note-bullet';
                                        lineEl.textContent = noteLine.slice(2);
                                    } else {
                                        lineEl.className = 'note-paragraph';
                                        lineEl.textContent = noteLine;
                                    }
                                    notesDiv.appendChild(lineEl);
                                }
                            } else {
                                var emptyEl = document.createElement('div');
                                emptyEl.className = 'notes-empty';
                                emptyEl.textContent = 'Click to add notes...';
                                notesDiv.appendChild(emptyEl);
                            }

                            // Double-click notes area to edit
                            notesDiv.addEventListener('dblclick', function (e) {
                                e.stopPropagation();
                                var textarea = document.createElement('textarea');
                                textarea.className = 'notes-textarea';
                                textarea.value = item.notes || '';
                                textarea.placeholder = 'Add notes...\nUse "- " prefix for bullet points';
                                notesDiv.innerHTML = '';
                                notesDiv.appendChild(textarea);
                                textarea.focus();
                                var notesDone = false;

                                // Auto-resize
                                function autoResize() {
                                    textarea.style.height = 'auto';
                                    textarea.style.height = Math.max(60, textarea.scrollHeight) + 'px';
                                }
                                autoResize();
                                textarea.addEventListener('input', autoResize);

                                function notesCleanup() {
                                    document.removeEventListener('mousedown', onNotesDocClick, true);
                                }

                                function saveNotes() {
                                    if (notesDone) { return; }
                                    notesDone = true;
                                    notesCleanup();
                                    var newNotes = textarea.value;
                                    if (newNotes !== item.notes) {
                                        window.DashboardBridge.postMessage({
                                            type: 'editTodoNotes',
                                            id: item.id,
                                            notes: newNotes,
                                        });
                                    } else {
                                        render();
                                    }
                                }

                                function onNotesDocClick(e2) {
                                    if (e2.target !== textarea) { saveNotes(); }
                                }

                                textarea.addEventListener('blur', saveNotes);
                                textarea.addEventListener('keydown', function (ke) {
                                    if (ke.key === 'Enter' && ke.ctrlKey) {
                                        ke.preventDefault();
                                        saveNotes();
                                    }
                                    if (ke.key === 'Escape') {
                                        ke.preventDefault();
                                        if (notesDone) { return; }
                                        notesDone = true;
                                        notesCleanup();
                                        render();
                                    }
                                });

                                document.addEventListener('mousedown', onNotesDocClick, true);
                            });

                            body.appendChild(notesDiv);
                        }
                    })(section.items[i]);
                }

                widget.appendChild(body);

                // ---- Inline add-todo form (hidden by default) ----
                var addForm = document.createElement('div');
                addForm.className = 'section-add-form hidden';

                var todoInput = document.createElement('input');
                todoInput.type = 'text';
                todoInput.placeholder = 'New todo...';

                var saveBtn = document.createElement('button');
                saveBtn.textContent = 'Add';
                saveBtn.addEventListener('click', function () {
                    var text = todoInput.value.trim();
                    if (text) {
                        window.DashboardBridge.postMessage({
                            type: 'addTodo',
                            sectionId: section.id,
                            text: text,
                        });
                        todoInput.value = '';
                        addForm.classList.add('hidden');
                    }
                });

                var cancelBtn = document.createElement('button');
                cancelBtn.className = 'cancel-btn';
                cancelBtn.textContent = 'Cancel';
                cancelBtn.addEventListener('click', function () {
                    todoInput.value = '';
                    addForm.classList.add('hidden');
                });

                todoInput.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') { saveBtn.click(); }
                    if (e.key === 'Escape') { cancelBtn.click(); }
                });

                addForm.appendChild(todoInput);
                addForm.appendChild(saveBtn);
                addForm.appendChild(cancelBtn);
                widget.appendChild(addForm);

                // ---- Resize handle ----
                var resizeHandle = document.createElement('div');
                resizeHandle.className = 'widget-resize-handle';
                widget.appendChild(resizeHandle);

                if (isNew) {
                    container.appendChild(widget);
                }
            })(todoData.sections[si]);
        }

        // Remove widgets for sections that no longer exist
        for (var eid in existingWidgets) {
            if (!activeSectionIds[eid] && existingWidgets[eid].parentNode === container) {
                container.removeChild(existingWidgets[eid]);
            }
        }

        // After rendering, apply layout ordering via GridManager
        if (window.GridManager) {
            window.GridManager.applyLayout();
        }
    }

    function getDragAfterElement(container, y) {
        var items = container.querySelectorAll('.todo-item:not(.dragging)');
        var closest = null;
        var closestOffset = Number.NEGATIVE_INFINITY;

        for (var i = 0; i < items.length; i++) {
            var box = items[i].getBoundingClientRect();
            var offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closestOffset) {
                closestOffset = offset;
                closest = items[i];
            }
        }
        return closest;
    }

    window.TodoRenderer = { setData: setData, setSwimlanes: setSwimlanes };
})();
