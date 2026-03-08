// @ts-nocheck
/* Grid Manager — widget drag-to-reorder and resize */
(function () {
    var grid = null;
    var layout = {}; // { sectionId: { w: number, h: number, order: number } }
    var dragState = null;
    var resizeState = null;

    var MIN_COLS = 3;
    var MAX_COLS = 12;
    var MIN_HEIGHT = 150;
    var HEIGHT_SNAP = 50;
    var DRAG_THRESHOLD = 3;

    function init(savedLayout) {
        grid = document.getElementById('todo-grid');
        if (!grid) { return; }
        if (savedLayout && typeof savedLayout === 'object') {
            layout = savedLayout;
        }
        applyLayout();
    }

    function getLayout() {
        return layout;
    }

    function setLayout(newLayout) {
        if (newLayout && typeof newLayout === 'object') {
            layout = newLayout;
        }
        applyLayout();
    }

    function applyLayout() {
        if (!grid) { return; }
        var widgets = grid.querySelectorAll('.grid-widget');
        // Build an array of { element, order }
        var ordered = [];
        for (var i = 0; i < widgets.length; i++) {
            var id = widgets[i].dataset.sectionId;
            var cfg = layout[id] || {};
            var w = cfg.w || 6;
            var h = cfg.h || 300;
            var order = cfg.order !== undefined ? cfg.order : i;

            widgets[i].style.gridColumn = 'span ' + Math.min(Math.max(w, MIN_COLS), MAX_COLS);
            widgets[i].style.height = Math.max(h, MIN_HEIGHT) + 'px';
            ordered.push({ el: widgets[i], order: order });
        }

        // Sort by order and reorder DOM
        ordered.sort(function (a, b) { return a.order - b.order; });
        for (var j = 0; j < ordered.length; j++) {
            grid.appendChild(ordered[j].el);
        }
    }

    function saveLayout() {
        if (!grid) { return; }
        // Rebuild layout from current DOM order
        var widgets = grid.querySelectorAll('.grid-widget');
        for (var i = 0; i < widgets.length; i++) {
            var id = widgets[i].dataset.sectionId;
            if (!layout[id]) { layout[id] = {}; }
            layout[id].order = i;

            // Parse current width/height
            var colSpan = widgets[i].style.gridColumn;
            var match = colSpan && colSpan.match(/span\s+(\d+)/);
            if (match) { layout[id].w = parseInt(match[1], 10); }

            var h = parseInt(widgets[i].style.height, 10);
            if (h && !isNaN(h)) { layout[id].h = h; }
        }

        window.DashboardBridge.postMessage({
            type: 'saveLayout',
            layout: layout,
        });
    }

    // ====== DRAG TO REORDER ======
    function onDragStart(e) {
        // Only start on widget-header (not buttons inside it)
        var header = e.target.closest('.widget-header');
        if (!header) { return; }
        if (e.target.closest('button') || e.target.closest('input')) { return; }

        var widget = header.closest('.grid-widget');
        if (!widget) { return; }

        e.preventDefault();
        dragState = {
            widget: widget,
            startX: e.clientX,
            startY: e.clientY,
            active: false,
            ghost: null,
            placeholder: null,
        };

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    }

    function onDragMove(e) {
        if (!dragState) { return; }

        var dx = e.clientX - dragState.startX;
        var dy = e.clientY - dragState.startY;

        if (!dragState.active) {
            if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) { return; }
            dragState.active = true;

            // Create ghost
            var rect = dragState.widget.getBoundingClientRect();
            var ghost = dragState.widget.cloneNode(true);
            ghost.className += ' widget-drag-ghost';
            ghost.style.position = 'fixed';
            ghost.style.left = rect.left + 'px';
            ghost.style.top = rect.top + 'px';
            ghost.style.width = rect.width + 'px';
            ghost.style.height = rect.height + 'px';
            ghost.style.zIndex = '1000';
            document.body.appendChild(ghost);
            dragState.ghost = ghost;
            dragState.offsetX = e.clientX - rect.left;
            dragState.offsetY = e.clientY - rect.top;

            // Create placeholder
            var placeholder = document.createElement('div');
            placeholder.className = 'grid-drop-placeholder';
            placeholder.style.gridColumn = dragState.widget.style.gridColumn;
            placeholder.style.height = dragState.widget.style.height;
            dragState.widget.parentNode.insertBefore(placeholder, dragState.widget);
            dragState.placeholder = placeholder;

            // Hide original
            dragState.widget.style.display = 'none';
        }

        // Move ghost
        dragState.ghost.style.left = (e.clientX - dragState.offsetX) + 'px';
        dragState.ghost.style.top = (e.clientY - dragState.offsetY) + 'px';

        // Determine drop target
        var widgets = grid.querySelectorAll('.grid-widget:not([style*="display: none"])');
        var closest = null;
        var closestDist = Infinity;
        var insertBefore = true;

        for (var i = 0; i < widgets.length; i++) {
            var wr = widgets[i].getBoundingClientRect();
            var centerY = wr.top + wr.height / 2;
            var centerX = wr.left + wr.width / 2;
            var dist = Math.sqrt(Math.pow(e.clientX - centerX, 2) + Math.pow(e.clientY - centerY, 2));
            if (dist < closestDist) {
                closestDist = dist;
                closest = widgets[i];
                insertBefore = e.clientY < centerY || (Math.abs(e.clientY - centerY) < wr.height * 0.3 && e.clientX < centerX);
            }
        }

        // Move placeholder
        if (closest && dragState.placeholder) {
            if (insertBefore) {
                grid.insertBefore(dragState.placeholder, closest);
            } else {
                grid.insertBefore(dragState.placeholder, closest.nextSibling);
            }
        }
    }

    function onDragEnd() {
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);

        if (!dragState) { return; }

        if (dragState.active) {
            // Insert widget where placeholder is
            if (dragState.placeholder && dragState.placeholder.parentNode) {
                dragState.placeholder.parentNode.insertBefore(dragState.widget, dragState.placeholder);
                dragState.placeholder.parentNode.removeChild(dragState.placeholder);
            }
            dragState.widget.style.display = '';

            // Remove ghost
            if (dragState.ghost && dragState.ghost.parentNode) {
                dragState.ghost.parentNode.removeChild(dragState.ghost);
            }

            saveLayout();
        }

        dragState = null;
    }

    // ====== RESIZE ======
    function onResizeStart(e) {
        var handle = e.target.closest('.widget-resize-handle');
        if (!handle) { return; }

        var widget = handle.closest('.grid-widget');
        if (!widget || !grid) { return; }

        e.preventDefault();
        e.stopPropagation();

        var rect = widget.getBoundingClientRect();
        var gridRect = grid.getBoundingClientRect();
        var colWidth = gridRect.width / 12;

        resizeState = {
            widget: widget,
            startX: e.clientX,
            startY: e.clientY,
            startWidth: rect.width,
            startHeight: rect.height,
            colWidth: colWidth,
            gridLeft: gridRect.left,
        };

        document.addEventListener('mousemove', onResizeMove);
        document.addEventListener('mouseup', onResizeEnd);
    }

    function onResizeMove(e) {
        if (!resizeState) { return; }

        var dx = e.clientX - resizeState.startX;
        var dy = e.clientY - resizeState.startY;

        // Calculate new column span
        var newWidth = resizeState.startWidth + dx;
        var newCols = Math.round(newWidth / resizeState.colWidth);
        newCols = Math.min(Math.max(newCols, MIN_COLS), MAX_COLS);

        // Calculate new height, snapped to HEIGHT_SNAP increments
        var rawHeight = Math.max(resizeState.startHeight + dy, MIN_HEIGHT);
        var newHeight = Math.round(rawHeight / HEIGHT_SNAP) * HEIGHT_SNAP;
        newHeight = Math.max(newHeight, MIN_HEIGHT);

        resizeState.widget.style.gridColumn = 'span ' + newCols;
        resizeState.widget.style.height = newHeight + 'px';
    }

    function onResizeEnd() {
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('mouseup', onResizeEnd);

        if (resizeState) {
            saveLayout();
            resizeState = null;
        }
    }

    // Attach global listeners to #todo-grid
    document.addEventListener('mousedown', function (e) {
        if (e.target.closest('.widget-resize-handle')) {
            onResizeStart(e);
        } else if (e.target.closest('.widget-header')) {
            onDragStart(e);
        }
    });

    window.GridManager = {
        init: init,
        getLayout: getLayout,
        setLayout: setLayout,
        applyLayout: applyLayout,
    };
})();
