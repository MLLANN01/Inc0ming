// @ts-nocheck
/* Dashboard main entry — message handling, section reorder, drag-scroll */
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
        expandSection: function (sectionKey) {
            var bodyId = sectionKey + '-body';
            var headerId = sectionKey + '-header';
            var body = document.getElementById(bodyId);
            var header = document.getElementById(headerId);
            if (body && body.classList.contains('collapsed')) {
                body.classList.remove('collapsed');
                var chevron = header ? header.querySelector('.collapse-chevron') : null;
                if (chevron) {
                    chevron.classList.add('open');
                    chevron.classList.remove('closed');
                }
            }
        },
    };

    // Convert YYYY-MM-DD (from <input type="date">) to M/D/YY
    function dateInputToMDYY(isoStr) {
        var parts = isoStr.split('-');
        if (parts.length !== 3) { return isoStr; }
        var m = parseInt(parts[1], 10);
        var d = parseInt(parts[2], 10);
        var yy = String(parseInt(parts[0], 10) % 100).padStart(2, '0');
        return m + '/' + d + '/' + yy;
    }

    // Distribute allData payload to all renderers in correct order
    function handleAllData(payload) {
        currentRadarData = payload.radar;
        window.RadarRenderer.setData(payload.radar);

        if (payload.swimlaneNames) {
            if (window.GoalsRenderer && window.GoalsRenderer.setSwimlanes) {
                window.GoalsRenderer.setSwimlanes(payload.swimlaneNames);
            }
            if (window.TodoRenderer && window.TodoRenderer.setSwimlanes) {
                window.TodoRenderer.setSwimlanes(payload.swimlaneNames);
            }
        }

        window.QuoteRenderer.setData(payload.quotes);
        window.ReminderRenderer.setData(payload.reminders);
        window.GoalsRenderer.setData(payload.goals);

        // Layout BEFORE todo so GridManager has correct state when render() calls applyLayout()
        currentLayout = payload.layout || {};
        if (window.GridManager) {
            window.GridManager.init(currentLayout);
        }
        window.TodoRenderer.setData(payload.todo, currentLayout);

        if (window.ArchiveRenderer && payload.archive) {
            window.ArchiveRenderer.setData(payload.archive);
        }

        sweepEnabled = payload.radarVisible;
        applySweepState();

        if (payload.sectionOrder) {
            applySectionOrder(payload.sectionOrder);
        }
    }

    // Listen for messages from extension
    window.addEventListener('message', function (event) {
        var msg = event.data;
        switch (msg.type) {
            case 'allData':
                handleAllData(msg.payload);
                break;
            case 'radarUpdate':
                currentRadarData = msg.data;
                window.RadarRenderer.setData(msg.data);
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
            case 'goalsUpdate':
                window.GoalsRenderer.setData(msg.data);
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
            case 'sectionOrderUpdate':
                applySectionOrder(msg.order);
                break;
            case 'swimlaneNames':
                if (window.GoalsRenderer && window.GoalsRenderer.setSwimlanes) {
                    window.GoalsRenderer.setSwimlanes(msg.names);
                }
                if (window.TodoRenderer && window.TodoRenderer.setSwimlanes) {
                    window.TodoRenderer.setSwimlanes(msg.names);
                }
                break;
            case 'navigateTo':
                handleNavigateTo(msg.sectionKey, msg.itemId, msg.sourceType);
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

    function handleNavigateTo(sectionKey, itemId, sourceType) {
        // Expand the section if it's collapsed
        if (sectionKey) {
            window.DashboardBridge.expandSection(sectionKey);
        }
        // Scroll to and highlight the item if an ID is given
        if (itemId) {
            // Small delay to allow section expand animation
            setTimeout(function () {
                // Goals/milestones use their own data attributes — delegate to GoalsRenderer
                if (sectionKey === 'goals' && window.GoalsRenderer && window.GoalsRenderer.highlightItem) {
                    var isMilestone = sourceType === 'milestone';
                    window.GoalsRenderer.highlightItem(itemId, isMilestone);
                    return;
                }
                var targetEl = document.querySelector('[data-item-id="' + itemId + '"]');
                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetEl.classList.add('navigate-highlight');
                    setTimeout(function () {
                        targetEl.classList.remove('navigate-highlight');
                    }, 1500);
                }
            }, 100);
        } else if (sectionKey) {
            // No specific item — scroll to the section header
            var header = document.getElementById(sectionKey + '-header');
            if (header) {
                header.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    // ====== RADAR FILTER BUTTONS ======
    var filterButtons = document.querySelectorAll('.radar-filter');
    var shapeFilters = { circle: true, diamond: true, flag: true, star: true };

    for (var fi = 0; fi < filterButtons.length; fi++) {
        (function (btn) {
            btn.addEventListener('click', function () {
                var shape = btn.getAttribute('data-shape');
                btn.classList.toggle('active');
                shapeFilters[shape] = btn.classList.contains('active');
                window.RadarRenderer.setFilters(shapeFilters);
                if (currentRadarData) {
                    window.RadarRenderer.setData(currentRadarData);
                }
            });
        })(filterButtons[fi]);
    }

    // ====== HELPERS ======
    function setupCollapsible(headerId, bodyId) {
        var header = document.getElementById(headerId);
        var body = document.getElementById(bodyId);
        if (header && body) {
            header.addEventListener('click', function (e) {
                if (e.target.closest('.drag-grip')) { return; }
                var chevron = header.querySelector('.collapse-chevron');
                var collapsed = body.classList.toggle('collapsed');
                if (chevron) {
                    chevron.classList.toggle('open', !collapsed);
                    chevron.classList.toggle('closed', collapsed);
                }
            });
        }
    }

    function setupSubmitInput(inputId, buttonId, messageType, fieldName) {
        var input = document.getElementById(inputId);
        var btn = document.getElementById(buttonId);

        function submit() {
            if (!input) { return; }
            var val = input.value.trim();
            if (val) {
                var msg = { type: messageType };
                msg[fieldName] = val;
                vscode.postMessage(msg);
                input.value = '';
            }
        }

        if (input) {
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { submit(); }
            });
        }
        if (btn) {
            btn.addEventListener('click', submit);
        }
    }

    // ====== COLLAPSIBLE SECTIONS ======
    setupCollapsible('quotes-header', 'quotes-body');
    setupCollapsible('reminders-header', 'reminders-body');
    setupCollapsible('goals-header', 'goals-body');
    setupCollapsible('todo-header', 'todo-body');
    setupCollapsible('archive-header', 'archive-body');

    // ====== SINGLE-INPUT SUBMIT PATTERNS ======
    setupSubmitInput('new-swimlane-input', 'add-swimlane-btn', 'addSwimlane', 'name');
    setupSubmitInput('new-section-input', 'add-section-btn', 'addTodoSection', 'name');
    setupSubmitInput('new-goal-section-input', 'add-goal-section-btn', 'addGoalSection', 'name');

    // ====== QUOTES — multi-input (kept manual) ======
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

    // ====== MEETINGS — multi-input (kept manual) ======
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

    // ====== RADAR EDIT POPOVER ======
    var editSave = document.getElementById('edit-save');
    var editCancel = document.getElementById('edit-cancel');
    var popover = document.getElementById('radar-edit-popover');
    var editLabel = document.getElementById('edit-label');
    var editDate = document.getElementById('edit-date');

    if (editSave && editCancel && popover && editLabel && editDate) {
        editSave.addEventListener('click', function () {
            if (popover._mode === 'add') {
                vscode.postMessage({
                    type: 'addRadarItem',
                    parentId: popover._parentId,
                    label: editLabel.value,
                    dateStr: dateInputToMDYY(editDate.value),
                });
            } else {
                vscode.postMessage({
                    type: 'editRadarItem',
                    id: popover._itemId,
                    label: editLabel.value,
                    dateStr: dateInputToMDYY(editDate.value),
                });
            }
            popover.classList.add('hidden');
        });

        editCancel.addEventListener('click', function () {
            popover.classList.add('hidden');
        });
    }

    // ====== DRAG-SCROLL ON HORIZONTAL CONTAINERS ======
    function initDragScroll(elementId) {
        var el = document.getElementById(elementId);
        if (!el) { return; }
        var isDown = false;
        var startX = 0;
        var scrollStart = 0;
        var moved = false;

        el.addEventListener('mousedown', function (e) {
            if (e.target.closest('button, input, [draggable="true"], .inline-edit')) { return; }
            isDown = true;
            moved = false;
            startX = e.pageX;
            scrollStart = el.scrollLeft;
            el.classList.add('drag-scrolling');
            e.preventDefault();
        });

        window.addEventListener('mousemove', function (e) {
            if (!isDown) { return; }
            var dx = e.pageX - startX;
            if (Math.abs(dx) > 3) { moved = true; }
            el.scrollLeft = scrollStart - dx;
        });

        window.addEventListener('mouseup', function () {
            if (!isDown) { return; }
            isDown = false;
            el.classList.remove('drag-scrolling');
        });

        el.addEventListener('click', function (e) {
            if (moved) { e.stopPropagation(); moved = false; }
        }, true);
    }

    initDragScroll('reminders-grid');
    initDragScroll('goals-grid');

    // ====== SECTION DRAG-TO-REORDER ======
    var sectionsContainer = document.getElementById('sections-container');

    function applySectionOrder(order) {
        if (!sectionsContainer || !order || !order.length) { return; }
        for (var i = 0; i < order.length; i++) {
            var child = sectionsContainer.querySelector('[data-section-key="' + order[i] + '"]');
            if (child) {
                sectionsContainer.appendChild(child);
            }
        }
    }

    function getSectionOrder() {
        if (!sectionsContainer) { return []; }
        var children = sectionsContainer.children;
        var order = [];
        for (var i = 0; i < children.length; i++) {
            var key = children[i].getAttribute('data-section-key');
            if (key) { order.push(key); }
        }
        return order;
    }

    if (sectionsContainer) {
        var dragState = { active: false, el: null, ghost: null, placeholder: null, startY: 0, offsetY: 0 };

        sectionsContainer.addEventListener('mousedown', function (e) {
            var grip = e.target.closest('.drag-grip');
            if (!grip) { return; }
            var sectionEl = grip.closest('[data-section-key]');
            if (!sectionEl) { return; }

            e.preventDefault();
            dragState.active = true;
            dragState.el = sectionEl;
            dragState.startY = e.clientY;
            var rect = sectionEl.getBoundingClientRect();
            dragState.offsetY = e.clientY - rect.top;

            // Create ghost
            var ghost = sectionEl.cloneNode(true);
            ghost.className = 'section-drag-ghost';
            ghost.style.width = rect.width + 'px';
            ghost.style.height = rect.height + 'px';
            ghost.style.left = rect.left + 'px';
            ghost.style.top = (e.clientY - dragState.offsetY) + 'px';
            document.body.appendChild(ghost);
            dragState.ghost = ghost;

            // Create placeholder
            var placeholder = document.createElement('div');
            placeholder.className = 'section-drop-placeholder';
            sectionEl.parentNode.insertBefore(placeholder, sectionEl);
            sectionEl.style.display = 'none';
            dragState.placeholder = placeholder;
        });

        window.addEventListener('mousemove', function (e) {
            if (!dragState.active) { return; }
            dragState.ghost.style.top = (e.clientY - dragState.offsetY) + 'px';

            // Find drop target
            var children = sectionsContainer.children;
            for (var i = 0; i < children.length; i++) {
                var child = children[i];
                if (child === dragState.placeholder || child === dragState.el) { continue; }
                var rect = child.getBoundingClientRect();
                var midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    sectionsContainer.insertBefore(dragState.placeholder, child);
                    return;
                }
            }
            // Past all children — append at end
            sectionsContainer.appendChild(dragState.placeholder);
        });

        window.addEventListener('mouseup', function () {
            if (!dragState.active) { return; }
            // Insert the real element where the placeholder is
            sectionsContainer.insertBefore(dragState.el, dragState.placeholder);
            dragState.el.style.display = '';
            dragState.placeholder.remove();
            dragState.ghost.remove();
            dragState.active = false;

            // Save new order
            vscode.postMessage({ type: 'saveSectionOrder', order: getSectionOrder() });
        });
    }
})();
