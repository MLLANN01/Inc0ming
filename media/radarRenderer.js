// @ts-nocheck
/* Radar Canvas Renderer — navy blue theme with blip labels */
(function () {
    const GRID_DAYS = [0, 30, 60, 90, 120, 150, 180];
    const MAX_DAYS = 180;
    const SWEEP_DURATION = 8000;

    // Theme colors — read from CSS custom properties at runtime
    var theme = {};

    function readThemeColors() {
        var s = getComputedStyle(document.documentElement);
        theme.bg = s.getPropertyValue('--bg').trim() || '#050d16';
        theme.border = s.getPropertyValue('--border').trim() || '#0f2235';
        theme.textDim = s.getPropertyValue('--text-dim').trim() || '#345570';
        theme.textBright = s.getPropertyValue('--text-bright').trim() || '#b8d4e8';
        theme.cyan = s.getPropertyValue('--cyan').trim() || '#00a8cc';
        theme.urgent = s.getPropertyValue('--urgent').trim() || '#cc3344';
        theme.warning = s.getPropertyValue('--warning').trim() || '#cc6e33';
    }

    function hexToRgba(hex, alpha) {
        // Handle rgb()/rgba() strings returned by getComputedStyle
        if (hex.startsWith('rgb')) { return hex.replace(')', ', ' + alpha + ')').replace('rgb(', 'rgba('); }
        hex = hex.replace('#', '');
        if (hex.length === 3) { hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2]; }
        var r = parseInt(hex.substring(0, 2), 16);
        var g = parseInt(hex.substring(2, 4), 16);
        var b = parseInt(hex.substring(4, 6), 16);
        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
    }

    let canvas, ctx;
    let radarData = null;
    let blips = [];
    let sweepX = -999;
    let sweepStartTime = 0;
    let sweepEnabled = true;
    let hoveredBlip = null;
    let draggedBlip = null;
    let isDragging = false;
    let justFinishedDrag = false;
    let isDraggingLane = false;
    let draggedLaneIndex = null;
    let laneDropIndex = null;
    let hoveredLaneIndex = -1;

    const LEFT_MARGIN = 110;
    const RIGHT_MARGIN = 60;
    const TOP_MARGIN = 20;
    const BOTTOM_MARGIN = 30;
    const ROW_HEIGHT = 44;
    const BLIP_RADIUS = 5;

    function init() {
        canvas = document.getElementById('radar-canvas');
        if (!canvas) { return; }
        ctx = canvas.getContext('2d');
        readThemeColors();
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('click', onClick);
        canvas.addEventListener('mouseleave', onMouseLeave);
        sweepStartTime = performance.now();
        animate();
    }

    function computeCanvasHeight() {
        var numRows = radarData ? radarData.swimlanes.length : 0;
        var minRows = 3;
        var rows = Math.max(numRows, minRows);
        return TOP_MARGIN + rows * ROW_HEIGHT + BOTTOM_MARGIN;
    }

    function resizeCanvas() {
        var rect = canvas.parentElement.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        var h = computeCanvasHeight();
        canvas.width = rect.width * dpr;
        canvas.height = h * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        computeBlips();
    }

    function setData(data) {
        radarData = data;
        readThemeColors();
        resizeCanvas();
    }

    function getBlipColor(days) {
        if (days <= 30) { return theme.urgent; }
        if (days <= 90) { return theme.warning; }
        return theme.cyan;
    }

    function computeBlips() {
        blips = [];
        if (!radarData || !canvas) { return; }

        var w = canvas.clientWidth;
        var drawWidth = w - LEFT_MARGIN - RIGHT_MARGIN;
        var rowIndex = 0;

        for (var si = 0; si < radarData.swimlanes.length; si++) {
            var swimlane = radarData.swimlanes[si];

            // Direct items
            for (var ii = 0; ii < swimlane.items.length; ii++) {
                var item = swimlane.items[ii];
                var days = daysBetween(new Date(), new Date(item.date));
                if (days < 0 || days > MAX_DAYS) { continue; }
                var x = LEFT_MARGIN + (days / MAX_DAYS) * drawWidth;
                var y = TOP_MARGIN + rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
                blips.push({
                    x: x, y: y, item: item, days: days,
                    color: getBlipColor(days),
                    swimlane: swimlane.name, subGroup: null,
                });
            }

            // Sub-groups
            for (var sgi = 0; sgi < swimlane.subGroups.length; sgi++) {
                var sg = swimlane.subGroups[sgi];
                for (var sii = 0; sii < sg.items.length; sii++) {
                    var sgItem = sg.items[sii];
                    var sgDays = daysBetween(new Date(), new Date(sgItem.date));
                    if (sgDays < 0 || sgDays > MAX_DAYS) { continue; }
                    var sgX = LEFT_MARGIN + (sgDays / MAX_DAYS) * drawWidth;
                    var sgY = TOP_MARGIN + rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
                    blips.push({
                        x: sgX, y: sgY, item: sgItem, days: sgDays,
                        color: getBlipColor(sgDays),
                        swimlane: swimlane.name, subGroup: sg.name,
                    });
                }
            }

            rowIndex++;
        }
    }

    function daysBetween(a, b) {
        var msDay = 86400000;
        var d1 = new Date(a); d1.setHours(0,0,0,0);
        var d2 = new Date(b); d2.setHours(0,0,0,0);
        return Math.round((d2 - d1) / msDay);
    }

    function animate(timestamp) {
        if (!ctx || !canvas) { return; }
        if (sweepEnabled) {
            var elapsed = (timestamp || 0) - sweepStartTime;
            var progress = (elapsed % SWEEP_DURATION) / SWEEP_DURATION;
            sweepX = LEFT_MARGIN + progress * (canvas.clientWidth - LEFT_MARGIN - RIGHT_MARGIN);
        } else {
            sweepX = -999;
        }
        draw();
        requestAnimationFrame(animate);
    }

    function setSweepEnabled(enabled) {
        sweepEnabled = enabled;
        if (enabled) {
            sweepStartTime = performance.now();
        }
    }

    function truncateLabel(text, maxWidth) {
        var measured = ctx.measureText(text).width;
        if (measured <= maxWidth) { return text; }
        while (text.length > 0 && ctx.measureText(text + '...').width > maxWidth) {
            text = text.slice(0, -1);
        }
        return text + '...';
    }

    function draw() {
        var w = canvas.clientWidth;
        var h = canvas.clientHeight;
        var drawWidth = w - LEFT_MARGIN - RIGHT_MARGIN;

        // Background
        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, w, h);

        if (!radarData) { return; }

        var numRows = radarData.swimlanes.length;
        var gridHeight = numRows * ROW_HEIGHT;

        // Gradient overlay (brighter near left/Today)
        var grad = ctx.createLinearGradient(LEFT_MARGIN, 0, w - RIGHT_MARGIN, 0);
        grad.addColorStop(0, hexToRgba(theme.cyan, 0.05));
        grad.addColorStop(1, hexToRgba(theme.cyan, 0.005));
        ctx.fillStyle = grad;
        ctx.fillRect(LEFT_MARGIN, TOP_MARGIN, drawWidth, gridHeight);

        // Grid lines (vertical)
        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 1;

        for (var gi = 0; gi < GRID_DAYS.length; gi++) {
            var day = GRID_DAYS[gi];
            var gx = LEFT_MARGIN + (day / MAX_DAYS) * drawWidth;
            ctx.beginPath();
            ctx.moveTo(gx, TOP_MARGIN);
            ctx.lineTo(gx, TOP_MARGIN + gridHeight);
            ctx.stroke();
        }

        // Row separators & swimlane labels
        ctx.font = '11px sans-serif';
        for (var ri = 0; ri < numRows; ri++) {
            var ry = TOP_MARGIN + ri * ROW_HEIGHT;

            if (ri > 0) {
                ctx.strokeStyle = theme.border;
                ctx.beginPath();
                ctx.moveTo(LEFT_MARGIN, ry);
                ctx.lineTo(w - RIGHT_MARGIN, ry);
                ctx.stroke();
            }

            // Swimlane label (bright on hover to hint draggability)
            ctx.fillStyle = (ri === hoveredLaneIndex && !isDraggingLane) ? theme.textBright : theme.textDim;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            var labelText = truncateLabel(radarData.swimlanes[ri].name, LEFT_MARGIN - 16);
            ctx.fillText(labelText, LEFT_MARGIN - 10, ry + ROW_HEIGHT / 2);
        }

        // Bottom axis labels
        ctx.fillStyle = theme.textDim;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = '10px sans-serif';
        var bottomY = TOP_MARGIN + gridHeight + 8;

        // "Today" label
        ctx.fillStyle = theme.cyan;
        ctx.fillText('Today', LEFT_MARGIN, bottomY);

        // Day markers
        ctx.fillStyle = theme.textDim;
        for (var di = 1; di < GRID_DAYS.length; di++) {
            var dayVal = GRID_DAYS[di];
            var dx = LEFT_MARGIN + (dayVal / MAX_DAYS) * drawWidth;
            ctx.fillText(dayVal + 'd', dx, bottomY);
        }

        // Blips (dots only, hover for details)
        for (var bi = 0; bi < blips.length; bi++) {
            var blip = blips[bi];
            var distToSweep = Math.abs(blip.x - sweepX);
            var glowing = distToSweep < 25;

            ctx.beginPath();
            ctx.arc(blip.x, blip.y, BLIP_RADIUS, 0, Math.PI * 2);

            if (glowing) {
                ctx.shadowColor = blip.color;
                ctx.shadowBlur = 18;
                ctx.fillStyle = blip.color;
            } else {
                ctx.shadowBlur = 0;
                ctx.fillStyle = blip.color + 'bb';
            }
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Sweep line
        ctx.strokeStyle = hexToRgba(theme.cyan, 0.4);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sweepX, TOP_MARGIN);
        ctx.lineTo(sweepX, TOP_MARGIN + gridHeight);
        ctx.stroke();

        // Sweep glow trail
        var sweepGrad = ctx.createLinearGradient(sweepX - 50, 0, sweepX, 0);
        sweepGrad.addColorStop(0, hexToRgba(theme.cyan, 0));
        sweepGrad.addColorStop(1, hexToRgba(theme.cyan, 0.06));
        ctx.fillStyle = sweepGrad;
        ctx.fillRect(sweepX - 50, TOP_MARGIN, 50, gridHeight);

        // Lane drag indicator overlay
        if (isDraggingLane && draggedLaneIndex !== null && laneDropIndex !== null && radarData) {
            // Dim the source row label
            var srcY = TOP_MARGIN + draggedLaneIndex * ROW_HEIGHT;
            ctx.fillStyle = hexToRgba(theme.bg, 0.6);
            ctx.fillRect(0, srcY, LEFT_MARGIN - 2, ROW_HEIGHT);

            if (draggedLaneIndex !== laneDropIndex) {
                // Highlight target row
                var tgtY = TOP_MARGIN + laneDropIndex * ROW_HEIGHT;
                ctx.fillStyle = hexToRgba(theme.cyan, 0.08);
                ctx.fillRect(0, tgtY, w, ROW_HEIGHT);

                // Draw insertion line at target boundary
                ctx.strokeStyle = theme.cyan;
                ctx.lineWidth = 2;
                ctx.beginPath();
                var lineY = tgtY + (laneDropIndex > draggedLaneIndex ? ROW_HEIGHT : 0);
                ctx.moveTo(0, lineY);
                ctx.lineTo(LEFT_MARGIN - 2, lineY);
                ctx.stroke();
            }
        }
    }

    function onMouseMove(e) {
        var rect = canvas.getBoundingClientRect();
        var mx = e.clientX - rect.left;
        var my = e.clientY - rect.top;

        // Handle lane dragging (highest priority)
        if (isDraggingLane && draggedLaneIndex !== null && radarData) {
            var relY = my - TOP_MARGIN;
            var targetRow = Math.floor(relY / ROW_HEIGHT);
            laneDropIndex = Math.max(0, Math.min(targetRow, radarData.swimlanes.length - 1));
            canvas.style.cursor = 'grabbing';
            var tooltip = document.getElementById('radar-tooltip');
            if (tooltip) { tooltip.classList.add('hidden'); }
            return;
        }

        // Handle blip dragging
        if (isDragging && draggedBlip) {
            var w = canvas.clientWidth;
            var drawWidth = w - LEFT_MARGIN - RIGHT_MARGIN;
            var clampedX = Math.max(LEFT_MARGIN, Math.min(mx, w - RIGHT_MARGIN));
            draggedBlip.x = clampedX;
            canvas.style.cursor = 'grabbing';

            // Show projected date tooltip while dragging
            var dragDays = Math.round(Math.max(0, Math.min(((clampedX - LEFT_MARGIN) / drawWidth) * MAX_DAYS, MAX_DAYS)));
            var dragDate = new Date();
            dragDate.setDate(dragDate.getDate() + dragDays);
            var dragDateStr = (dragDate.getMonth() + 1) + '/' + dragDate.getDate() + '/' + String(dragDate.getFullYear() % 100).padStart(2, '0');
            var tooltip = document.getElementById('radar-tooltip');
            if (tooltip) {
                tooltip.textContent = dragDateStr + ' (' + dragDays + 'd)';
                tooltip.style.left = (e.clientX + 12) + 'px';
                tooltip.style.top = (e.clientY - 30) + 'px';
                tooltip.classList.remove('hidden');
            }
            return;
        }

        // Check for label hover (left margin area)
        hoveredLaneIndex = -1;
        if (mx < LEFT_MARGIN && radarData && my >= TOP_MARGIN) {
            var rowIndex = Math.floor((my - TOP_MARGIN) / ROW_HEIGHT);
            if (rowIndex >= 0 && rowIndex < radarData.swimlanes.length) {
                hoveredLaneIndex = rowIndex;
                canvas.style.cursor = 'grab';
                hoveredBlip = null;
                var tooltip = document.getElementById('radar-tooltip');
                if (tooltip) { tooltip.classList.add('hidden'); }
                return;
            }
        }

        hoveredBlip = null;
        for (var i = 0; i < blips.length; i++) {
            var blip = blips[i];
            var dx = blip.x - mx;
            var dy = blip.y - my;
            if (dx * dx + dy * dy < (BLIP_RADIUS + 6) * (BLIP_RADIUS + 6)) {
                hoveredBlip = blip;
                break;
            }
        }

        // Update cursor based on hover state
        canvas.style.cursor = hoveredBlip ? 'grab' : 'crosshair';

        var tooltip = document.getElementById('radar-tooltip');
        if (hoveredBlip && tooltip) {
            var hd = new Date(hoveredBlip.item.date);
            var hDateStr = (hd.getMonth() + 1) + '/' + hd.getDate() + '/' + (hd.getFullYear() % 100);
            var text = hoveredBlip.item.label + ' \u2014 ' + hDateStr + ' (' + hoveredBlip.days + 'd away)';
            if (hoveredBlip.subGroup) {
                text += ' [' + hoveredBlip.subGroup + ']';
            }
            tooltip.textContent = text;
            tooltip.style.left = (e.clientX + 12) + 'px';
            tooltip.style.top = (e.clientY - 30) + 'px';
            tooltip.classList.remove('hidden');
        } else if (tooltip) {
            tooltip.classList.add('hidden');
        }
    }

    function onMouseDown(e) {
        // Check for lane label drag first
        if (hoveredLaneIndex >= 0) {
            isDraggingLane = true;
            draggedLaneIndex = hoveredLaneIndex;
            laneDropIndex = hoveredLaneIndex;
            canvas.style.cursor = 'grabbing';
            return;
        }

        if (!hoveredBlip) { return; }
        draggedBlip = hoveredBlip;
        isDragging = false; // Will become true on first mousemove that changes position
        canvas.style.cursor = 'grabbing';

        // Track the starting position to distinguish click from drag
        var rect = canvas.getBoundingClientRect();
        draggedBlip._startX = e.clientX - rect.left;

        // Use a threshold to detect real drag vs click
        var moveHandler = function (me) {
            var mrect = canvas.getBoundingClientRect();
            var mmx = me.clientX - mrect.left;
            if (Math.abs(mmx - draggedBlip._startX) > 3) {
                isDragging = true;
            }
        };
        canvas.addEventListener('mousemove', moveHandler);

        // Clean up on mouseup
        var cleanup = function () {
            canvas.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', cleanup);
        };
        document.addEventListener('mouseup', cleanup);
    }

    function onMouseUp(e) {
        // Handle lane drop
        if (isDraggingLane && draggedLaneIndex !== null && radarData) {
            if (draggedLaneIndex !== laneDropIndex) {
                var ids = radarData.swimlanes.map(function (s) { return s.id; });
                var removed = ids.splice(draggedLaneIndex, 1)[0];
                ids.splice(laneDropIndex, 0, removed);
                window.DashboardBridge.postMessage({
                    type: 'reorderSwimlanes',
                    orderedIds: ids,
                });
            }
            isDraggingLane = false;
            draggedLaneIndex = null;
            laneDropIndex = null;
            hoveredLaneIndex = -1;
            canvas.style.cursor = 'crosshair';
            return;
        }

        if (draggedBlip && isDragging) {
            // Compute new date from x-position
            var w = canvas.clientWidth;
            var drawWidth = w - LEFT_MARGIN - RIGHT_MARGIN;
            var days = Math.round(Math.max(0, Math.min(((draggedBlip.x - LEFT_MARGIN) / drawWidth) * MAX_DAYS, MAX_DAYS)));
            var newDate = new Date();
            newDate.setDate(newDate.getDate() + days);
            var dateStr = (newDate.getMonth() + 1) + '/' + newDate.getDate() + '/' + String(newDate.getFullYear() % 100).padStart(2, '0');

            // Post editRadarItem message with updated date
            window.DashboardBridge.postMessage({
                type: 'editRadarItem',
                id: draggedBlip.item.id,
                label: draggedBlip.item.label,
                dateStr: dateStr,
            });
        }

        // Hide drag tooltip
        var tooltip = document.getElementById('radar-tooltip');
        if (tooltip) { tooltip.classList.add('hidden'); }

        // Reset drag state — track that a drag just finished so onClick can skip the popover
        justFinishedDrag = isDragging;
        draggedBlip = null;
        isDragging = false;
        canvas.style.cursor = hoveredBlip ? 'grab' : 'crosshair';
    }

    function onClick(e) {
        // Suppress click-to-edit if we just finished dragging
        if (justFinishedDrag) { justFinishedDrag = false; return; }
        if (!hoveredBlip) { return; }
        var popover = document.getElementById('radar-edit-popover');
        var labelInput = document.getElementById('edit-label');
        var dateInput = document.getElementById('edit-date');
        if (!popover || !labelInput || !dateInput) { return; }

        labelInput.value = hoveredBlip.item.label;
        var cd = new Date(hoveredBlip.item.date);
        var yyyy = cd.getFullYear();
        var mm = String(cd.getMonth() + 1).padStart(2, '0');
        var dd = String(cd.getDate()).padStart(2, '0');
        dateInput.value = yyyy + '-' + mm + '-' + dd;

        var rect = canvas.getBoundingClientRect();
        popover.style.left = (e.clientX - rect.left + 12) + 'px';
        popover.style.top = (e.clientY - rect.top - 40) + 'px';
        popover.classList.remove('hidden');
        popover._itemId = hoveredBlip.item.id;
        labelInput.focus();
    }

    function onMouseLeave() {
        // Cancel lane drag on mouse leave
        if (isDraggingLane) {
            isDraggingLane = false;
            draggedLaneIndex = null;
            laneDropIndex = null;
            hoveredLaneIndex = -1;
        }

        if (isDragging && draggedBlip) {
            // Cancel drag on mouse leave
            draggedBlip = null;
            isDragging = false;
            computeBlips(); // Reset blip positions
        }
        canvas.style.cursor = 'crosshair';
        var tooltip = document.getElementById('radar-tooltip');
        if (tooltip) { tooltip.classList.add('hidden'); }
    }

    window.RadarRenderer = { init: init, setData: setData, setSweepEnabled: setSweepEnabled };
})();
