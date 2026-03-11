// @ts-nocheck
/* Bookmark Renderer — grid widgets with search, open, copy, edit, delete */
(function () {
    var bookmarkData = null;
    var searchTerm = '';
    var draggedItemId = null;

    function postMessage(msg) {
        if (window.DashboardBridge) { window.DashboardBridge.postMessage(msg); }
    }

    function setData(data) {
        bookmarkData = data;
        render();
    }

    function render() {
        var grid = document.getElementById('bookmarks-grid');
        if (!grid || !bookmarkData) { return; }
        grid.innerHTML = '';

        var lowerSearch = searchTerm.toLowerCase();

        for (var si = 0; si < bookmarkData.sections.length; si++) {
            (function (section) {
                // Filter items by search term
                var filteredItems = section.items;
                if (lowerSearch) {
                    filteredItems = section.items.filter(function (item) {
                        return item.title.toLowerCase().indexOf(lowerSearch) >= 0 ||
                               item.url.toLowerCase().indexOf(lowerSearch) >= 0;
                    });
                    // Hide sections with no matching items during search
                    if (filteredItems.length === 0) { return; }
                }

                var widget = document.createElement('div');
                widget.className = 'grid-widget';
                widget.dataset.sectionId = section.id;

                // ---- Widget Header ----
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
                            postMessage({
                                type: 'renameBookmarkSection',
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

                // Add bookmark button
                var addBtn = document.createElement('button');
                addBtn.className = 'section-add-btn';
                addBtn.textContent = '+';
                addBtn.title = 'Add bookmark to this section';
                addBtn.addEventListener('click', function () {
                    var form = widget.querySelector('.bookmark-add-form');
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
                    postMessage({
                        type: 'deleteBookmarkSection',
                        id: section.id,
                    });
                });
                header.appendChild(delBtn);

                widget.appendChild(header);

                // ---- Widget Body ----
                var body = document.createElement('div');
                body.className = 'widget-body';

                // Drop zone handlers for the widget body
                body.addEventListener('dragover', function (e) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    widget.classList.add('drag-over');

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
                        var allItems = body.querySelectorAll('.bookmark-item');
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

                    postMessage({
                        type: 'moveBookmark',
                        id: itemId,
                        targetSectionId: section.id,
                        newIndex: newIndex,
                    });
                });

                for (var i = 0; i < filteredItems.length; i++) {
                    (function (item) {
                        var row = document.createElement('div');
                        row.className = 'bookmark-item';
                        row.dataset.itemId = item.id;
                        row.title = item.url;
                        row.draggable = true;

                        row.addEventListener('dragstart', function (e) {
                            draggedItemId = item.id;
                            e.dataTransfer.setData('text/plain', item.id);
                            e.dataTransfer.effectAllowed = 'move';
                            setTimeout(function () { row.classList.add('dragging'); }, 0);
                        });

                        row.addEventListener('dragend', function () {
                            row.classList.remove('dragging');
                            draggedItemId = null;
                            var allWidgets = document.querySelectorAll('#bookmarks-grid .grid-widget');
                            for (var wi = 0; wi < allWidgets.length; wi++) {
                                allWidgets[wi].classList.remove('drag-over');
                                var ind = allWidgets[wi].querySelector('.drop-indicator');
                                if (ind) { ind.style.display = 'none'; }
                            }
                        });

                        // Link icon
                        var icon = document.createElement('span');
                        icon.className = 'bookmark-icon';
                        icon.textContent = '\u{1F517}';
                        row.appendChild(icon);

                        // Title (click to open)
                        var titleLink = document.createElement('span');
                        titleLink.className = 'bookmark-title';
                        titleLink.textContent = item.title;
                        titleLink.addEventListener('click', function () {
                            postMessage({ type: 'openBookmark', url: item.url });
                        });
                        row.appendChild(titleLink);

                        // Copy button
                        var copyBtn = document.createElement('button');
                        copyBtn.className = 'bookmark-action-btn bookmark-copy-btn';
                        copyBtn.textContent = '\u{1F4CB}';
                        copyBtn.title = 'Copy URL';
                        copyBtn.addEventListener('click', function (e) {
                            e.stopPropagation();
                            postMessage({ type: 'copyBookmarkUrl', url: item.url });
                        });
                        row.appendChild(copyBtn);

                        // Edit button
                        var editBtn = document.createElement('button');
                        editBtn.className = 'bookmark-action-btn bookmark-edit-btn';
                        editBtn.textContent = '\u270E';
                        editBtn.title = 'Edit bookmark';
                        editBtn.addEventListener('click', function (e) {
                            e.stopPropagation();

                            // Create inline edit form with two fields
                            var editForm = document.createElement('div');
                            editForm.className = 'bookmark-inline-edit';

                            var titleInput = document.createElement('input');
                            titleInput.type = 'text';
                            titleInput.className = 'inline-edit';
                            titleInput.value = item.title;
                            titleInput.placeholder = 'Title';

                            var urlInput = document.createElement('input');
                            urlInput.type = 'text';
                            urlInput.className = 'inline-edit';
                            urlInput.value = item.url;
                            urlInput.placeholder = 'URL';

                            var saveBtn = document.createElement('button');
                            saveBtn.textContent = 'Save';

                            var cancelBtn = document.createElement('button');
                            cancelBtn.className = 'cancel-btn';
                            cancelBtn.textContent = 'Cancel';

                            editForm.appendChild(titleInput);
                            editForm.appendChild(urlInput);
                            editForm.appendChild(saveBtn);
                            editForm.appendChild(cancelBtn);

                            var editDone = false;

                            function saveEdit() {
                                if (editDone) { return; }
                                editDone = true;
                                var newTitle = titleInput.value.trim();
                                var newUrl = urlInput.value.trim();
                                if (newTitle && newUrl && (newTitle !== item.title || newUrl !== item.url)) {
                                    postMessage({
                                        type: 'editBookmark',
                                        id: item.id,
                                        title: newTitle,
                                        url: newUrl,
                                    });
                                } else {
                                    editForm.replaceWith(row);
                                }
                            }

                            function cancelEdit() {
                                if (editDone) { return; }
                                editDone = true;
                                editForm.replaceWith(row);
                            }

                            saveBtn.addEventListener('click', saveEdit);
                            cancelBtn.addEventListener('click', cancelEdit);

                            titleInput.addEventListener('keydown', function (ev) {
                                if (ev.key === 'Enter') { saveEdit(); }
                                if (ev.key === 'Escape') { cancelEdit(); }
                            });
                            urlInput.addEventListener('keydown', function (ev) {
                                if (ev.key === 'Enter') { saveEdit(); }
                                if (ev.key === 'Escape') { cancelEdit(); }
                            });

                            row.replaceWith(editForm);
                            titleInput.focus();
                            titleInput.select();
                        });
                        row.appendChild(editBtn);

                        // Delete button
                        var delItemBtn = document.createElement('button');
                        delItemBtn.className = 'bookmark-action-btn close-btn';
                        delItemBtn.textContent = '\u00d7';
                        delItemBtn.title = 'Delete bookmark';
                        delItemBtn.addEventListener('click', function (e) {
                            e.stopPropagation();
                            postMessage({
                                type: 'deleteBookmark',
                                id: item.id,
                            });
                        });
                        row.appendChild(delItemBtn);

                        body.appendChild(row);
                    })(filteredItems[i]);
                }

                widget.appendChild(body);

                // ---- Inline add-bookmark form (hidden by default) ----
                var addForm = document.createElement('div');
                addForm.className = 'bookmark-add-form hidden';

                var titleInput = document.createElement('input');
                titleInput.type = 'text';
                titleInput.placeholder = 'Title...';

                var urlInput = document.createElement('input');
                urlInput.type = 'text';
                urlInput.placeholder = 'URL (https://...)';

                var saveBtnForm = document.createElement('button');
                saveBtnForm.textContent = 'Add';
                saveBtnForm.addEventListener('click', function () {
                    var title = titleInput.value.trim();
                    var url = urlInput.value.trim();
                    if (title && url) {
                        postMessage({
                            type: 'addBookmark',
                            sectionId: section.id,
                            title: title,
                            url: url,
                        });
                        titleInput.value = '';
                        urlInput.value = '';
                        addForm.classList.add('hidden');
                    }
                });

                var cancelBtnForm = document.createElement('button');
                cancelBtnForm.className = 'cancel-btn';
                cancelBtnForm.textContent = 'Cancel';
                cancelBtnForm.addEventListener('click', function () {
                    titleInput.value = '';
                    urlInput.value = '';
                    addForm.classList.add('hidden');
                });

                function submitFormOnEnter(e) {
                    if (e.key === 'Enter') { saveBtnForm.click(); }
                    if (e.key === 'Escape') { cancelBtnForm.click(); }
                }

                titleInput.addEventListener('keydown', submitFormOnEnter);
                urlInput.addEventListener('keydown', submitFormOnEnter);

                addForm.appendChild(titleInput);
                addForm.appendChild(urlInput);
                addForm.appendChild(saveBtnForm);
                addForm.appendChild(cancelBtnForm);
                widget.appendChild(addForm);

                // ---- Resize handle ----
                var resizeHandle = document.createElement('div');
                resizeHandle.className = 'widget-resize-handle';
                widget.appendChild(resizeHandle);

                grid.appendChild(widget);
            })(bookmarkData.sections[si]);
        }
    }

    function getDragAfterElement(container, y) {
        var items = container.querySelectorAll('.bookmark-item:not(.dragging)');
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

    // Wire up search input
    var searchInput = document.getElementById('bookmarks-search');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            searchTerm = searchInput.value.trim();
            render();
        });
    }

    window.BookmarkRenderer = { setData: setData };
})();
