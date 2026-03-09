// @ts-nocheck
/* Dashboard main entry — message handling, swimlane cards, grid layout */
(function () {
    var vscode = acquireVsCodeApi();
    var currentRadarData = null;
    var currentLayout = {};
    var sweepEnabled = true;

    // Bridge for child renderers
    window.DashboardBridge = {
        postMessage: function (msg) {
            vscode.postMessage(msg);
        },
    };

    // Listen for messages from extension
    window.addEventListener('message', function (event) {
        var msg = event.data;
        switch (msg.type) {
            case 'radarUpdate':
                currentRadarData = msg.data;
                window.RadarRenderer.setData(msg.data);
                renderSwimlaneCards(msg.data);
                break;
            case 'todoUpdate':
                window.TodoRenderer.setData(msg.data, currentLayout);
                break;
            case 'quotesUpdate':
                window.QuoteRenderer.setData(msg.data);
                break;
            case 'remindersUpdate':
                window.ReminderRenderer.setData(msg.data);
                break;
            case 'layoutUpdate':
                currentLayout = msg.layout || {};
                if (window.GridManager) {
                    window.GridManager.init(currentLayout);
                }
                break;
            case 'radarVisibleUpdate':
                sweepEnabled = msg.visible;
                applySweepState();
                break;
        }
    });

    function applySweepState() {
        var toggleBtn = document.getElementById('toggle-radar-btn');
        window.RadarRenderer.setSweepEnabled(sweepEnabled);
        if (toggleBtn) {
            if (sweepEnabled) {
                toggleBtn.classList.add('active');
            } else {
                toggleBtn.classList.remove('active');
            }
        }
    }

    // Scanner toggle button
    var toggleRadarBtn = document.getElementById('toggle-radar-btn');
    if (toggleRadarBtn) {
        toggleRadarBtn.addEventListener('click', function () {
            sweepEnabled = !sweepEnabled;
            applySweepState();
            vscode.postMessage({ type: 'saveRadarVisible', visible: sweepEnabled });
        });
    }

    // Initialize radar canvas
    window.RadarRenderer.init();

    // ====== SWIMLANE DETAIL CARDS ======
    function daysBetween(a, b) {
        var msDay = 86400000;
        var d1 = new Date(a); d1.setHours(0,0,0,0);
        var d2 = new Date(b); d2.setHours(0,0,0,0);
        return Math.round((d2 - d1) / msDay);
    }

    function formatDate(dateStr) {
        var d = new Date(dateStr);
        return (d.getMonth() + 1) + '/' + d.getDate() + '/' + String(d.getFullYear() % 100).padStart(2, '0');
    }

    // Convert YYYY-MM-DD (from <input type="date">) to M/D/YY
    function dateInputToMDYY(isoStr) {
        var parts = isoStr.split('-');
        if (parts.length !== 3) { return isoStr; }
        var m = parseInt(parts[1], 10);
        var d = parseInt(parts[2], 10);
        var yy = String(parseInt(parts[0], 10) % 100).padStart(2, '0');
        return m + '/' + d + '/' + yy;
    }

    // Convert ISO date string (or M/D/YY) to YYYY-MM-DD for <input type="date">
    function toDateInputValue(dateStr) {
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) { return ''; }
        var yyyy = d.getFullYear();
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        var dd = String(d.getDate()).padStart(2, '0');
        return yyyy + '-' + mm + '-' + dd;
    }

    // Reusable radar date form (label + date picker + save/cancel)
    function createRadarDateForm(opts) {
        var form = document.createElement('div');
        form.className = 'add-date-form' + (opts.visible ? '' : ' hidden');

        var labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.placeholder = 'Label';
        if (opts.label) { labelInput.value = opts.label; }

        var dateInput = document.createElement('input');
        dateInput.type = 'date';
        if (opts.dateValue) { dateInput.value = opts.dateValue; }

        var btns = document.createElement('div');
        btns.className = 'form-buttons';

        var saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', function () {
            var label = labelInput.value.trim();
            var dateVal = dateInput.value;
            if (label && dateVal) {
                opts.onSave(label, dateInputToMDYY(dateVal));
            }
        });

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', function () {
            if (opts.onCancel) { opts.onCancel(); }
        });

        function handleKeys(e) {
            if (e.key === 'Enter') { saveBtn.click(); }
            if (e.key === 'Escape') { cancelBtn.click(); }
        }
        labelInput.addEventListener('keydown', handleKeys);
        dateInput.addEventListener('keydown', handleKeys);

        btns.appendChild(saveBtn);
        btns.appendChild(cancelBtn);
        form.appendChild(labelInput);
        form.appendChild(dateInput);
        form.appendChild(btns);

        return {
            el: form,
            labelInput: labelInput,
            dateInput: dateInput,
            show: function () { form.classList.remove('hidden'); },
            hide: function () { form.classList.add('hidden'); },
            reset: function () { labelInput.value = ''; dateInput.value = ''; },
        };
    }

    function getDaysClass(days) {
        if (days < 0) { return 'past'; }
        if (days <= 30) { return 'urgent'; }
        if (days <= 90) { return 'warning'; }
        return 'normal';
    }

    function createItemRow(item) {
        var days = daysBetween(new Date(), new Date(item.date));
        var row = document.createElement('div');
        row.className = 'swimlane-card-item';

        var labelSpan = document.createElement('span');
        labelSpan.className = 'item-label';
        labelSpan.textContent = formatDate(item.date) + ' \u2013 ' + item.label;

        // Double-click label to inline edit
        labelSpan.addEventListener('dblclick', function () {
            var editForm = createRadarDateForm({
                visible: true,
                label: item.label,
                dateValue: toDateInputValue(item.date),
                onSave: function (label, mdyy) {
                    vscode.postMessage({ type: 'editRadarItem', id: item.id, label: label, dateStr: mdyy });
                    editForm.el.replaceWith(row);
                },
                onCancel: function () {
                    editForm.el.replaceWith(row);
                },
            });
            row.replaceWith(editForm.el);
            editForm.labelInput.focus();
            editForm.labelInput.select();
        });

        var daysSpan = document.createElement('span');
        daysSpan.className = 'days-away ' + getDaysClass(days);
        if (days < 0) {
            daysSpan.textContent = Math.abs(days) + 'd ago';
        } else if (days === 0) {
            daysSpan.textContent = 'today';
        } else {
            daysSpan.textContent = days + 'd away';
        }

        // Delete button
        var delBtn = document.createElement('button');
        delBtn.className = 'item-delete-btn';
        delBtn.textContent = '\u00d7';
        delBtn.title = 'Delete item';
        delBtn.addEventListener('click', function () {
            vscode.postMessage({
                type: 'deleteRadarItem',
                id: item.id,
            });
        });

        row.appendChild(labelSpan);
        row.appendChild(daysSpan);
        row.appendChild(delBtn);
        return row;
    }

    function renderSwimlaneCards(data) {
        var container = document.getElementById('swimlane-cards');
        if (!container || !data) { return; }

        container.innerHTML = '';

        for (var si = 0; si < data.swimlanes.length; si++) {
            (function (swimlane) {
                var card = document.createElement('div');
                card.className = 'swimlane-card';

                // Header
                var header = document.createElement('div');
                header.className = 'swimlane-card-header';

                var titleEl = document.createElement('div');
                titleEl.className = 'swimlane-card-title';
                var chevron = document.createElement('span');
                chevron.className = 'chevron open';
                chevron.textContent = '\u25bc';
                var nameSpan = document.createElement('span');
                nameSpan.textContent = swimlane.name;

                // Double-click name to rename swimlane
                nameSpan.addEventListener('dblclick', function (e) {
                    e.stopPropagation();
                    var input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'inline-edit';
                    input.value = swimlane.name;
                    nameSpan.replaceWith(input);
                    input.focus();
                    input.select();

                    function save() {
                        var newName = input.value.trim();
                        if (newName && newName !== swimlane.name) {
                            vscode.postMessage({
                                type: 'renameSwimlane',
                                id: swimlane.id,
                                name: newName,
                            });
                        }
                        input.replaceWith(nameSpan);
                        nameSpan.textContent = newName || swimlane.name;
                    }

                    input.addEventListener('blur', save);
                    input.addEventListener('keydown', function (e) {
                        if (e.key === 'Enter') { save(); }
                        if (e.key === 'Escape') { input.replaceWith(nameSpan); }
                    });
                });

                titleEl.appendChild(nameSpan);
                titleEl.appendChild(chevron);

                var closeBtn = document.createElement('button');
                closeBtn.className = 'close-btn';
                closeBtn.textContent = '\u00d7';
                closeBtn.addEventListener('click', function () {
                    vscode.postMessage({
                        type: 'deleteSwimlane',
                        id: swimlane.id,
                    });
                });

                header.appendChild(titleEl);
                header.appendChild(closeBtn);
                card.appendChild(header);

                // ---- Drag-to-reorder swimlane cards ----
                header.draggable = true;
                header.style.cursor = 'grab';

                header.addEventListener('dragstart', function (e) {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', swimlane.id);
                    e.dataTransfer.setDragImage(card, 20, 20);
                    setTimeout(function () { card.classList.add('dragging'); }, 0);
                    container._draggedId = swimlane.id;
                });

                header.addEventListener('dragend', function () {
                    card.classList.remove('dragging');
                    var allCards = container.querySelectorAll('.swimlane-card');
                    for (var ci = 0; ci < allCards.length; ci++) {
                        allCards[ci].classList.remove('drag-over-left', 'drag-over-right');
                    }
                    container._draggedId = null;
                });

                card.addEventListener('dragover', function (e) {
                    if (!container._draggedId || container._draggedId === swimlane.id) { return; }
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    var allCards = container.querySelectorAll('.swimlane-card');
                    for (var ci = 0; ci < allCards.length; ci++) {
                        allCards[ci].classList.remove('drag-over-left', 'drag-over-right');
                    }
                    var cardRect = card.getBoundingClientRect();
                    var midX = cardRect.left + cardRect.width / 2;
                    if (e.clientX < midX) {
                        card.classList.add('drag-over-left');
                    } else {
                        card.classList.add('drag-over-right');
                    }
                });

                card.addEventListener('dragleave', function () {
                    card.classList.remove('drag-over-left', 'drag-over-right');
                });

                card.addEventListener('drop', function (e) {
                    e.preventDefault();
                    var draggedId = container._draggedId;
                    if (!draggedId || draggedId === swimlane.id) { return; }
                    var ids = currentRadarData.swimlanes.map(function (s) { return s.id; });
                    var fromIndex = ids.indexOf(draggedId);
                    if (fromIndex < 0) { return; }
                    ids.splice(fromIndex, 1);
                    var targetIndex = ids.indexOf(swimlane.id);
                    var cardRect = card.getBoundingClientRect();
                    var midX = cardRect.left + cardRect.width / 2;
                    if (e.clientX >= midX) { targetIndex++; }
                    ids.splice(targetIndex, 0, draggedId);
                    vscode.postMessage({ type: 'reorderSwimlanes', orderedIds: ids });
                    var allCards = container.querySelectorAll('.swimlane-card');
                    for (var ci = 0; ci < allCards.length; ci++) {
                        allCards[ci].classList.remove('drag-over-left', 'drag-over-right', 'dragging');
                    }
                    container._draggedId = null;
                });

                // Items container
                var itemsContainer = document.createElement('div');
                itemsContainer.className = 'swimlane-card-items';

                // Direct items (sorted by date)
                var sortedItems = swimlane.items.slice().sort(function (a, b) {
                    return new Date(a.date) - new Date(b.date);
                });
                for (var ii = 0; ii < sortedItems.length; ii++) {
                    itemsContainer.appendChild(createItemRow(sortedItems[ii]));
                }

                // Sub-groups
                for (var sgi = 0; sgi < swimlane.subGroups.length; sgi++) {
                    (function (sg) {
                        // Sub-group header with rename + delete
                        var sgLabel = document.createElement('div');
                        sgLabel.className = 'swimlane-card-item subgroup-header';

                        var sgSpan = document.createElement('span');
                        sgSpan.className = 'item-subgroup';
                        sgSpan.textContent = sg.name;

                        // Double-click to rename sub-group
                        sgSpan.addEventListener('dblclick', function () {
                            var input = document.createElement('input');
                            input.type = 'text';
                            input.className = 'inline-edit';
                            input.value = sg.name;
                            sgSpan.replaceWith(input);
                            input.focus();
                            input.select();

                            function save() {
                                var newName = input.value.trim();
                                if (newName && newName !== sg.name) {
                                    vscode.postMessage({
                                        type: 'renameSubGroup',
                                        id: sg.id,
                                        name: newName,
                                    });
                                }
                                input.replaceWith(sgSpan);
                                sgSpan.textContent = newName || sg.name;
                            }

                            input.addEventListener('blur', save);
                            input.addEventListener('keydown', function (e) {
                                if (e.key === 'Enter') { save(); }
                                if (e.key === 'Escape') { input.replaceWith(sgSpan); }
                            });
                        });

                        // Delete sub-group button
                        var sgDelBtn = document.createElement('button');
                        sgDelBtn.className = 'item-delete-btn';
                        sgDelBtn.textContent = '\u00d7';
                        sgDelBtn.title = 'Delete section';
                        sgDelBtn.addEventListener('click', function () {
                            vscode.postMessage({
                                type: 'deleteSubGroup',
                                id: sg.id,
                            });
                        });

                        sgLabel.appendChild(sgSpan);
                        sgLabel.appendChild(sgDelBtn);
                        itemsContainer.appendChild(sgLabel);

                        // Sub-group items (sorted by date)
                        var sortedSgItems = sg.items.slice().sort(function (a, b) {
                            return new Date(a.date) - new Date(b.date);
                        });
                        for (var sgii = 0; sgii < sortedSgItems.length; sgii++) {
                            itemsContainer.appendChild(createItemRow(sortedSgItems[sgii]));
                        }

                        // Add-date form for this sub-group
                        var sgAddBtn; // forward ref
                        var sgForm = createRadarDateForm({
                            onSave: function (label, mdyy) {
                                vscode.postMessage({ type: 'addRadarItem', parentId: sg.id, label: label, dateStr: mdyy });
                                sgForm.reset(); sgForm.hide(); sgAddBtn.style.display = '';
                            },
                            onCancel: function () {
                                sgForm.reset(); sgForm.hide(); sgAddBtn.style.display = '';
                            },
                        });
                        itemsContainer.appendChild(sgForm.el);

                        // "Add date..." button for this sub-group
                        sgAddBtn = document.createElement('button');
                        sgAddBtn.className = 'add-date-btn sg-add-date-btn';
                        sgAddBtn.textContent = 'Add date...';
                        sgAddBtn.addEventListener('click', function () {
                            sgForm.show();
                            sgAddBtn.style.display = 'none';
                            sgForm.labelInput.focus();
                        });
                        itemsContainer.appendChild(sgAddBtn);
                    })(swimlane.subGroups[sgi]);
                }

                card.appendChild(itemsContainer);

                // Inline add-date form for the swimlane (hidden by default)
                var addBtn; // forward ref
                var addForm = createRadarDateForm({
                    onSave: function (label, mdyy) {
                        vscode.postMessage({ type: 'addRadarItem', parentId: swimlane.id, label: label, dateStr: mdyy });
                        addForm.reset(); addForm.hide(); addBtn.style.display = '';
                    },
                    onCancel: function () {
                        addForm.reset(); addForm.hide(); addBtn.style.display = '';
                    },
                });
                card.appendChild(addForm.el);

                // "Add date..." button toggles the form
                addBtn = document.createElement('button');
                addBtn.className = 'add-date-btn';
                addBtn.textContent = 'Add date...';
                addBtn.addEventListener('click', function () {
                    addForm.show();
                    addBtn.style.display = 'none';
                    addForm.labelInput.focus();
                });
                card.appendChild(addBtn);

                // "Add section..." button to create sub-groups
                var addSgForm = document.createElement('div');
                addSgForm.className = 'add-date-form hidden';

                var sgNameInput = document.createElement('input');
                sgNameInput.type = 'text';
                sgNameInput.placeholder = 'Section name';

                var sgFormBtns = document.createElement('div');
                sgFormBtns.className = 'form-buttons';

                var sgSaveBtn = document.createElement('button');
                sgSaveBtn.textContent = 'Save';
                sgSaveBtn.addEventListener('click', function () {
                    var name = sgNameInput.value.trim();
                    if (name) {
                        vscode.postMessage({
                            type: 'addSubGroup',
                            swimlaneId: swimlane.id,
                            name: name,
                        });
                        sgNameInput.value = '';
                        addSgForm.classList.add('hidden');
                        addSgBtn.style.display = '';
                    }
                });

                var sgCancelBtn = document.createElement('button');
                sgCancelBtn.className = 'cancel-btn';
                sgCancelBtn.textContent = 'Cancel';
                sgCancelBtn.addEventListener('click', function () {
                    sgNameInput.value = '';
                    addSgForm.classList.add('hidden');
                    addSgBtn.style.display = '';
                });

                sgNameInput.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') { sgSaveBtn.click(); }
                    if (e.key === 'Escape') { sgCancelBtn.click(); }
                });

                sgFormBtns.appendChild(sgSaveBtn);
                sgFormBtns.appendChild(sgCancelBtn);
                addSgForm.appendChild(sgNameInput);
                addSgForm.appendChild(sgFormBtns);

                card.appendChild(addSgForm);

                var addSgBtn = document.createElement('button');
                addSgBtn.className = 'add-date-btn';
                addSgBtn.textContent = 'Add section...';
                addSgBtn.addEventListener('click', function () {
                    addSgForm.classList.remove('hidden');
                    addSgBtn.style.display = 'none';
                    sgNameInput.focus();
                });
                card.appendChild(addSgBtn);

                // Scroll indicator dot
                var scrollDot = document.createElement('div');
                scrollDot.className = 'card-scroll-indicator';
                var dot = document.createElement('div');
                dot.className = 'card-scroll-dot';
                scrollDot.appendChild(dot);
                card.appendChild(scrollDot);

                container.appendChild(card);
            })(data.swimlanes[si]);
        }
    }

    // ====== NEW SWIMLANE INPUT + BUTTON ======
    var newSwimInput = document.getElementById('new-swimlane-input');
    var addSwimBtn = document.getElementById('add-swimlane-btn');

    function submitSwimlane() {
        if (!newSwimInput) { return; }
        var name = newSwimInput.value.trim();
        if (name) {
            vscode.postMessage({ type: 'addSwimlane', name: name });
            newSwimInput.value = '';
        }
    }

    if (newSwimInput) {
        newSwimInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { submitSwimlane(); }
        });
    }
    if (addSwimBtn) {
        addSwimBtn.addEventListener('click', submitSwimlane);
    }

    // ====== ADD TODO SECTION ======
    var newSectionInput = document.getElementById('new-section-input');
    var addSectionBtn = document.getElementById('add-section-btn');

    function submitSection() {
        if (!newSectionInput) { return; }
        var name = newSectionInput.value.trim();
        if (name) {
            vscode.postMessage({ type: 'addTodoSection', name: name });
            newSectionInput.value = '';
        }
    }

    if (newSectionInput) {
        newSectionInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { submitSection(); }
        });
    }
    if (addSectionBtn) {
        addSectionBtn.addEventListener('click', submitSection);
    }

    // ====== QUOTES MANAGEMENT ======
    var quotesHeader = document.getElementById('quotes-header');
    var quotesBody = document.getElementById('quotes-body');
    if (quotesHeader && quotesBody) {
        quotesHeader.addEventListener('click', function () {
            var chevron = quotesHeader.querySelector('.collapse-chevron');
            var collapsed = quotesBody.classList.toggle('collapsed');
            if (chevron) {
                chevron.classList.toggle('open', !collapsed);
                chevron.classList.toggle('closed', collapsed);
            }
        });
    }

    var newQuoteText = document.getElementById('new-quote-text');
    var newQuoteAttr = document.getElementById('new-quote-attr');
    var addQuoteBtn = document.getElementById('add-quote-btn');

    function submitQuote() {
        if (!newQuoteText) { return; }
        var text = newQuoteText.value.trim();
        if (text) {
            var attr = newQuoteAttr ? newQuoteAttr.value.trim() : '';
            vscode.postMessage({
                type: 'addQuote',
                text: text,
                attribution: attr || undefined,
            });
            newQuoteText.value = '';
            if (newQuoteAttr) { newQuoteAttr.value = ''; }
        }
    }

    if (newQuoteText) {
        newQuoteText.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { submitQuote(); }
        });
    }
    if (newQuoteAttr) {
        newQuoteAttr.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { submitQuote(); }
        });
    }
    if (addQuoteBtn) {
        addQuoteBtn.addEventListener('click', submitQuote);
    }

    // ====== REMINDERS COLLAPSE + ADD MEETING ======
    var remindersHeader = document.getElementById('reminders-header');
    var remindersBody = document.getElementById('reminders-body');
    if (remindersHeader && remindersBody) {
        remindersHeader.addEventListener('click', function () {
            var chevron = remindersHeader.querySelector('.collapse-chevron');
            var collapsed = remindersBody.classList.toggle('collapsed');
            if (chevron) {
                chevron.classList.toggle('open', !collapsed);
                chevron.classList.toggle('closed', collapsed);
            }
        });
    }

    var newMeetingName = document.getElementById('new-meeting-name');
    var newMeetingDays = document.getElementById('new-meeting-days');
    var addMeetingBtn = document.getElementById('add-meeting-btn');

    function submitMeeting() {
        if (!newMeetingName) { return; }
        var name = newMeetingName.value.trim();
        if (name) {
            var days = newMeetingDays ? newMeetingDays.value.trim() : '';
            vscode.postMessage({
                type: 'addMeeting',
                name: name,
                days: days,
            });
            newMeetingName.value = '';
            if (newMeetingDays) { newMeetingDays.value = ''; }
        }
    }

    if (newMeetingName) {
        newMeetingName.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { submitMeeting(); }
        });
    }
    if (newMeetingDays) {
        newMeetingDays.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { submitMeeting(); }
        });
    }
    if (addMeetingBtn) {
        addMeetingBtn.addEventListener('click', submitMeeting);
    }

    // ====== SWIM LANE DETAILS COLLAPSE ======
    var slHeader = document.getElementById('swimlane-details-header');
    var slBody = document.getElementById('swimlane-details-body');
    if (slHeader && slBody) {
        slHeader.addEventListener('click', function () {
            var chevron = slHeader.querySelector('.collapse-chevron');
            var collapsed = slBody.classList.toggle('collapsed');
            if (chevron) {
                chevron.classList.toggle('open', !collapsed);
                chevron.classList.toggle('closed', collapsed);
            }
        });
    }

    // ====== TODO COLLAPSE ======
    var todoHeader = document.getElementById('todo-header');
    var todoBody = document.getElementById('todo-body');
    if (todoHeader && todoBody) {
        todoHeader.addEventListener('click', function () {
            var chevron = todoHeader.querySelector('.collapse-chevron');
            var collapsed = todoBody.classList.toggle('collapsed');
            if (chevron) {
                chevron.classList.toggle('open', !collapsed);
                chevron.classList.toggle('closed', collapsed);
            }
        });
    }

    // ====== RADAR EDIT POPOVER ======
    var editSave = document.getElementById('edit-save');
    var editCancel = document.getElementById('edit-cancel');
    var popover = document.getElementById('radar-edit-popover');
    var editLabel = document.getElementById('edit-label');
    var editDate = document.getElementById('edit-date');

    if (editSave && editCancel && popover && editLabel && editDate) {
        editSave.addEventListener('click', function () {
            vscode.postMessage({
                type: 'editRadarItem',
                id: popover._itemId,
                label: editLabel.value,
                dateStr: dateInputToMDYY(editDate.value),
            });
            popover.classList.add('hidden');
        });

        editCancel.addEventListener('click', function () {
            popover.classList.add('hidden');
        });
    }
})();
