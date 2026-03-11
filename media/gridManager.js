// @ts-nocheck
/* Grid Manager — widget drag-to-reorder and resize */
(function () {
    var GRID_IDS = ['todo-grid', 'bookmarks-grid'];
    var grids = [];
    var layout = {}; // { sectionId: { w: number, h: number, order: number } }
    var dragState = null;
    var resizeState = null;

    var MIN_COLS = 3;
    var MAX_COLS = 12;
    var MIN_HEIGHT = 150;
    var HEIGHT_SNAP = 50;
    var DRAG_THRESHOLD = 3;

    function init(savedLayout) {
        grids = [];
        for (var i = 0; i < GRID_IDS.length; i++) {
            var el = document.getElementById(GRID_IDS[i]);
            if (el) { grids.push(el); }
        }
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

    function findParentGrid(widget) {
        for (var i = 0; i < grids.length; i++) {
            if (grids[i].contains(widget)) { return grids[i]; }
        }
        return null;
    }

    function applyLayout() {
        for (var g = 0; g < grids.length; g++) {
            var grid = grids[g];
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
    }

    function saveLayout() {
        for (var g = 0; g < grids.length; g++) {
            var grid = grids[g];
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

        var parentGrid = findParentGrid(widget);
        if (!parentGrid) { return; }

        e.preventDefault();
        dragState = {
            widget: widget,
            grid: parentGrid,
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

        // Determine drop target within the same grid
        var widgets = dragState.grid.querySelectorAll('.grid-widget:not([style*="display: none"])');
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
        if (!widget) { return; }

        var parentGrid = findParentGrid(widget);
        if (!parentGrid) { return; }

        e.preventDefault();
        e.stopPropagation();

        var rect = widget.getBoundingClientRect();
        var gridRect = parentGrid.getBoundingClientRect();
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

    // Attach global listeners
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
