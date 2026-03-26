// @ts-nocheck
/* Reminder Renderer — recurring radar items as a compact list with modal editing */
(function () {
    var currentData = null;

    function postMessage(msg) {
        if (window.DashboardBridge) { window.DashboardBridge.postMessage(msg); }
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
            for (var ri = 0; ri < recurringItems.length; ri++) {
                var row = createRow(recurringItems[ri], todayName);
                grid.appendChild(row);
            }
        }

        // Apply stored order
        if (cardOrder && cardOrder.length) {
            var byId = {};
            var rows = grid.querySelectorAll('.meeting-row');
            for (var i = 0; i < rows.length; i++) {
                byId[rows[i].getAttribute('data-item-id')] = rows[i];
            }
            for (var j = 0; j < cardOrder.length; j++) {
                if (byId[cardOrder[j]]) { grid.appendChild(byId[cardOrder[j]]); }
            }
        }

        initDrag(grid);
    }

    function collectRecurringItems(swimlane) {
        var items = [];
        for (var i = 0; i < swimlane.items.length; i++) {
            if (swimlane.items[i].recurrence) { items.push(swimlane.items[i]); }
        }
        for (var s = 0; s < swimlane.subGroups.length; s++) {
            var sg = swimlane.subGroups[s];
            for (var j = 0; j < sg.items.length; j++) {
                if (sg.items[j].recurrence) { items.push(sg.items[j]); }
            }
        }
        return items;
    }

    function createRow(item, todayName) {
        var row = document.createElement('div');
        row.className = 'meeting-row';
        row.setAttribute('data-item-id', item.id);

        var eff = window.DateUtils.effectiveDate(item);
        if (eff && window.DateUtils.isToday(eff)) {
            row.classList.add('meeting-row-today');
        }

        var grip = document.createElement('span');
        grip.className = 'meeting-row-grip';
        grip.textContent = '\u2847';
        row.appendChild(grip);

        var label = document.createElement('span');
        label.className = 'meeting-row-label';
        label.textContent = item.label;
        row.appendChild(label);

        // Schedule info
        if (item.recurrence && item.recurrence.type === 'weekly') {
            var badges = document.createElement('span');
            badges.className = 'meeting-day-badges';
            for (var d = 0; d < item.recurrence.days.length; d++) {
                var badge = document.createElement('span');
                badge.className = 'day-badge';
                if (item.recurrence.days[d] === todayName) { badge.classList.add('day-today'); }
                badge.textContent = item.recurrence.days[d];
                badges.appendChild(badge);
            }
            row.appendChild(badges);
        } else if (item.recurrence && item.recurrence.type === 'yearly') {
            var yBadge = document.createElement('span');
            yBadge.className = 'meeting-yearly-badge';
            yBadge.textContent = item.recurrence.month + '/' + item.recurrence.day;
            row.appendChild(yBadge);
        }

        // Sub-item count
        var count = (item.subItems || []).length;
        if (count > 0) {
            var countBadge = document.createElement('span');
            countBadge.className = 'meeting-row-count';
            countBadge.textContent = count;
            countBadge.title = count + ' agenda item' + (count !== 1 ? 's' : '');
            row.appendChild(countBadge);
        }

        // Delete button
        var delBtn = document.createElement('button');
        delBtn.className = 'meeting-row-delete';
        delBtn.textContent = '\u00d7';
        delBtn.title = 'Delete';
        delBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            postMessage({ type: 'deleteRadarItem', id: item.id });
        });
        row.appendChild(delBtn);

        // Click to open modal
        row.addEventListener('click', function () {
            openModal(item);
        });

        return row;
    }

    // ====== MODAL ======
    var activeModalItem = null;

    function openModal(item) {
        activeModalItem = item;
        var overlay = document.getElementById('meeting-modal-overlay');
        if (!overlay) { return; }
        overlay.classList.remove('hidden');
        renderModal(item);
        var addInput = document.getElementById('meeting-modal-add-input');
        if (addInput) { addInput.focus(); }
    }

    function closeModal() {
        activeModalItem = null;
        var overlay = document.getElementById('meeting-modal-overlay');
        if (overlay) { overlay.classList.add('hidden'); }
    }

    function renderModal(item) {
        var titleEl = document.getElementById('meeting-modal-title');
        if (titleEl) {
            titleEl.textContent = item.label;
            titleEl.title = 'Double-click to rename';
            titleEl.ondblclick = function () {
                var input = window.EditUtils.createInlineEdit(item.label, function (newLabel) {
                    if (newLabel) {
                        postMessage({ type: 'editRadarItem', id: item.id, label: newLabel, dateStr: '' });
                    }
                    input.replaceWith(titleEl);
                }, function () {
                    input.replaceWith(titleEl);
                });
                titleEl.replaceWith(input);
                input.focus();
                input.select();
            };
        }

        var badgesEl = document.getElementById('meeting-modal-badges');
        if (badgesEl) {
            badgesEl.innerHTML = '';
            var todayName = window.DateUtils.getTodayDayName();
            if (item.recurrence && item.recurrence.type === 'weekly') {
                for (var d = 0; d < item.recurrence.days.length; d++) {
                    var badge = document.createElement('span');
                    badge.className = 'day-badge';
                    if (item.recurrence.days[d] === todayName) { badge.classList.add('day-today'); }
                    badge.textContent = item.recurrence.days[d];
                    badgesEl.appendChild(badge);
                }
            } else if (item.recurrence && item.recurrence.type === 'yearly') {
                var yBadge = document.createElement('span');
                yBadge.className = 'meeting-yearly-badge';
                yBadge.textContent = item.recurrence.month + '/' + item.recurrence.day;
                badgesEl.appendChild(yBadge);
            }
        }

        var itemsEl = document.getElementById('meeting-modal-items');
        if (!itemsEl) { return; }
        itemsEl.innerHTML = '';

        var subItems = item.subItems || [];
        for (var si = 0; si < subItems.length; si++) {
            (function (sub) {
                var row = document.createElement('div');
                row.className = 'modal-sub-item';

                var bullet = document.createElement('span');
                bullet.className = 'sub-item-bullet';
                bullet.textContent = '\u2022';

                var textSpan = document.createElement('span');
                textSpan.className = 'modal-sub-item-text';
                textSpan.textContent = sub.text;
                textSpan.title = 'Click to edit';
                textSpan.addEventListener('click', function () {
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

                var delBtn = document.createElement('button');
                delBtn.className = 'modal-sub-item-delete';
                delBtn.textContent = '\u00d7';
                delBtn.title = 'Delete';
                delBtn.addEventListener('click', function () {
                    postMessage({ type: 'deleteSubItem', id: sub.id });
                });

                row.appendChild(bullet);
                row.appendChild(textSpan);
                row.appendChild(delBtn);
                itemsEl.appendChild(row);
            })(subItems[si]);
        }

        if (subItems.length === 0) {
            var empty = document.createElement('div');
            empty.style.cssText = 'color: var(--text-dim); font-size: 12px; padding: 8px;';
            empty.textContent = 'No agenda items yet.';
            itemsEl.appendChild(empty);
        }
    }

    function findItemById(id) {
        if (!currentData || !currentData.swimlanes) { return null; }
        for (var si = 0; si < currentData.swimlanes.length; si++) {
            var sw = currentData.swimlanes[si];
            for (var i = 0; i < sw.items.length; i++) {
                if (sw.items[i].id === id) { return sw.items[i]; }
            }
            for (var s = 0; s < sw.subGroups.length; s++) {
                for (var j = 0; j < sw.subGroups[s].items.length; j++) {
                    if (sw.subGroups[s].items[j].id === id) { return sw.subGroups[s].items[j]; }
                }
            }
        }
        return null;
    }

    // Wire up modal close / overlay / escape
    document.addEventListener('click', function (e) {
        if (e.target.id === 'meeting-modal-close') { closeModal(); }
        if (e.target.id === 'meeting-modal-overlay') { closeModal(); }
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && activeModalItem) { closeModal(); }
    });

    // Wire up modal add input
    document.addEventListener('keydown', function (e) {
        var addInput = document.getElementById('meeting-modal-add-input');
        if (e.target !== addInput || e.key !== 'Enter') { return; }
        if (!activeModalItem) { return; }
        var text = addInput.value.trim();
        if (text) {
            postMessage({ type: 'addSubItem', radarItemId: activeModalItem.id, text: text });
            addInput.value = '';
        }
    });

    // ====== DRAG-TO-REORDER ======
    var dragState = null;
    var DRAG_THRESHOLD = 4;

    function initDrag(grid) {
        grid.addEventListener('mousedown', function (e) {
            var grip = e.target.closest('.meeting-row-grip');
            if (!grip) { return; }
            var row = grip.closest('.meeting-row');
            if (!row) { return; }

            e.preventDefault();
            dragState = { row: row, grid: grid, startY: e.clientY, active: false, ghost: null, placeholder: null };
            document.addEventListener('mousemove', onDragMove);
            document.addEventListener('mouseup', onDragEnd);
        });
    }

    function onDragMove(e) {
        if (!dragState) { return; }
        if (!dragState.active) {
            if (Math.abs(e.clientY - dragState.startY) < DRAG_THRESHOLD) { return; }
            dragState.active = true;
            var rect = dragState.row.getBoundingClientRect();
            var ghost = dragState.row.cloneNode(true);
            ghost.style.position = 'fixed';
            ghost.style.left = rect.left + 'px';
            ghost.style.top = rect.top + 'px';
            ghost.style.width = rect.width + 'px';
            ghost.style.zIndex = '1000';
            ghost.style.opacity = '0.85';
            ghost.style.pointerEvents = 'none';
            document.body.appendChild(ghost);
            dragState.ghost = ghost;
            dragState.offsetY = e.clientY - rect.top;

            var placeholder = document.createElement('div');
            placeholder.className = 'meeting-row-drop-placeholder';
            placeholder.style.height = rect.height + 'px';
            dragState.row.parentNode.insertBefore(placeholder, dragState.row);
            dragState.placeholder = placeholder;
            dragState.row.style.display = 'none';
        }

        dragState.ghost.style.top = (e.clientY - dragState.offsetY) + 'px';

        var rows = dragState.grid.querySelectorAll('.meeting-row:not([style*="display: none"])');
        var closest = null;
        var closestDist = Infinity;
        var before = true;
        for (var i = 0; i < rows.length; i++) {
            var rr = rows[i].getBoundingClientRect();
            var centerY = rr.top + rr.height / 2;
            var dist = Math.abs(e.clientY - centerY);
            if (dist < closestDist) {
                closestDist = dist;
                closest = rows[i];
                before = e.clientY < centerY;
            }
        }
        if (closest && dragState.placeholder) {
            if (before) {
                dragState.grid.insertBefore(dragState.placeholder, closest);
            } else {
                dragState.grid.insertBefore(dragState.placeholder, closest.nextSibling);
            }
        }
    }

    function onDragEnd() {
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        if (!dragState) { return; }
        if (dragState.active) {
            if (dragState.placeholder && dragState.placeholder.parentNode) {
                dragState.placeholder.parentNode.insertBefore(dragState.row, dragState.placeholder);
                dragState.placeholder.parentNode.removeChild(dragState.placeholder);
            }
            dragState.row.style.display = '';
            if (dragState.ghost && dragState.ghost.parentNode) {
                dragState.ghost.parentNode.removeChild(dragState.ghost);
            }
            // Save new order
            var rows = dragState.grid.querySelectorAll('.meeting-row');
            var order = [];
            for (var i = 0; i < rows.length; i++) {
                order.push(rows[i].getAttribute('data-item-id'));
            }
            cardOrder = order;
            postMessage({ type: 'saveMeetingCardOrder', order: order });
        }
        dragState = null;
    }

    // Stored order
    var cardOrder = null;

    function setCardOrder(order) {
        cardOrder = order;
    }

    function setData(radarData) {
        currentData = radarData;
        render(radarData);

        // Refresh modal if open
        if (activeModalItem) {
            var updated = findItemById(activeModalItem.id);
            if (updated) {
                activeModalItem = updated;
                renderModal(updated);
            } else {
                closeModal();
            }
        }
    }

    window.ReminderRenderer = { setData: setData, setCardOrder: setCardOrder };
})();
