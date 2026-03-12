// @ts-nocheck
/* Notes Renderer — notebook tabs, page list, TipTap editor integration */
(function () {
    var notesData = null;
    var activeNotebookId = null;
    var activeSlug = null;
    var saveTimeout = null;
    var editorDirty = false;

    function postMessage(msg) {
        if (window.DashboardBridge) { window.DashboardBridge.postMessage(msg); }
    }

    function setData(data) {
        notesData = data;
        if (!notesData || !notesData.notebooks) { notesData = { notebooks: [] }; }

        // Update count badge
        var totalPages = 0;
        for (var i = 0; i < notesData.notebooks.length; i++) {
            totalPages += notesData.notebooks[i].pages.length;
        }
        var badge = document.getElementById('notes-count');
        if (badge) {
            badge.textContent = totalPages;
            badge.style.display = totalPages > 0 ? '' : 'none';
        }

        // If the editor is open, verify the active page still exists in the data.
        // It may have been deleted (e.g. notebook deleted from another path).
        if (activeSlug) {
            var found = false;
            for (var si = 0; si < notesData.notebooks.length && !found; si++) {
                for (var pi = 0; pi < notesData.notebooks[si].pages.length; pi++) {
                    if (notesData.notebooks[si].pages[pi].slug === activeSlug) {
                        found = true;
                        break;
                    }
                }
            }
            if (!found) {
                closeEditor();
            }
        }

        // If the active notebook was deleted, clear it so we auto-select
        if (activeNotebookId) {
            var nbFound = false;
            for (var ni = 0; ni < notesData.notebooks.length; ni++) {
                if (notesData.notebooks[ni].id === activeNotebookId) { nbFound = true; break; }
            }
            if (!nbFound) { activeNotebookId = null; }
        }
        if (!activeNotebookId && notesData.notebooks.length > 0) {
            activeNotebookId = notesData.notebooks[0].id;
        }

        renderTabs();
        // Don't re-render the page list while the editor is open —
        // renderPageList() hides the editor area and shows the list.
        if (!activeSlug) {
            renderPageList();
        }
    }

    function renderTabs() {
        var container = document.getElementById('notes-notebook-tabs');
        if (!container || !notesData) { return; }
        container.innerHTML = '';

        for (var i = 0; i < notesData.notebooks.length; i++) {
            (function (notebook) {
                var tab = document.createElement('div');
                tab.className = 'notebook-tab' + (notebook.id === activeNotebookId ? ' active' : '');

                var nameSpan = document.createElement('span');
                nameSpan.className = 'notebook-tab-name';
                nameSpan.textContent = notebook.name;
                tab.appendChild(nameSpan);

                var delBtn = document.createElement('span');
                delBtn.className = 'notebook-tab-delete';
                delBtn.textContent = '\u00d7';
                delBtn.title = 'Delete notebook';
                delBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    // Close editor if it's open for a page in this notebook
                    if (activeSlug && activeNotebookId === notebook.id) {
                        closeEditor();
                    }
                    postMessage({ type: 'deleteNotebook', id: notebook.id });
                    if (activeNotebookId === notebook.id) { activeNotebookId = null; }
                });
                tab.appendChild(delBtn);

                tab.addEventListener('click', function () {
                    if (activeSlug) { closeEditor(); }
                    activeNotebookId = notebook.id;
                    renderTabs();
                    renderPageList();
                });

                // Double-click to rename
                nameSpan.addEventListener('dblclick', function (e) {
                    e.stopPropagation();
                    var input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'inline-edit';
                    input.value = notebook.name;
                    nameSpan.replaceWith(input);
                    input.focus();
                    input.select();
                    var done = false;
                    function save() {
                        if (done) { return; }
                        done = true;
                        var newName = input.value.trim();
                        if (newName && newName !== notebook.name) {
                            postMessage({ type: 'renameNotebook', id: notebook.id, name: newName });
                        }
                        input.replaceWith(nameSpan);
                        nameSpan.textContent = newName || notebook.name;
                    }
                    input.addEventListener('blur', save);
                    input.addEventListener('keydown', function (ev) {
                        if (ev.key === 'Enter') { save(); }
                        if (ev.key === 'Escape') { done = true; input.replaceWith(nameSpan); }
                    });
                });

                container.appendChild(tab);
            })(notesData.notebooks[i]);
        }
    }

    function renderPageList() {
        var container = document.getElementById('notes-page-list');
        if (!container || !notesData) { return; }
        container.innerHTML = '';

        // Show page list, hide editor
        container.classList.remove('hidden');
        var editorArea = document.getElementById('notes-editor-area');
        if (editorArea) { editorArea.classList.add('hidden'); }

        var notebook = null;
        for (var i = 0; i < notesData.notebooks.length; i++) {
            if (notesData.notebooks[i].id === activeNotebookId) {
                notebook = notesData.notebooks[i];
                break;
            }
        }

        if (!notebook) {
            container.innerHTML = '<div class="notes-empty">No notebook selected. Create one below.</div>';
            return;
        }

        if (notebook.pages.length === 0) {
            container.innerHTML = '<div class="notes-empty">No pages yet.</div>';
        }

        for (var pi = 0; pi < notebook.pages.length; pi++) {
            (function (page) {
                var row = document.createElement('div');
                row.className = 'note-page-row';

                var titleEl = document.createElement('span');
                titleEl.className = 'note-page-title';
                titleEl.textContent = page.title;
                titleEl.addEventListener('click', function () {
                    openEditor(page);
                });
                row.appendChild(titleEl);

                var dateEl = document.createElement('span');
                dateEl.className = 'note-page-date';
                dateEl.textContent = page.updatedAt ? 'Updated ' + page.updatedAt : '';
                row.appendChild(dateEl);

                // Tags
                if (page.tags && page.tags.length > 0) {
                    var tagContainer = document.createElement('span');
                    tagContainer.className = 'note-tags';
                    for (var t = 0; t < page.tags.length; t++) {
                        var chip = document.createElement('span');
                        chip.className = 'note-tag-chip tag-' + page.tags[t].type;
                        chip.textContent = page.tags[t].type + ':' + page.tags[t].target;
                        tagContainer.appendChild(chip);
                    }
                    row.appendChild(tagContainer);
                }

                // Delete button
                var delBtn = document.createElement('button');
                delBtn.className = 'note-page-delete';
                delBtn.textContent = '\u00d7';
                delBtn.title = 'Delete page';
                delBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    postMessage({ type: 'deleteNotePage', id: page.id });
                });
                row.appendChild(delBtn);

                container.appendChild(row);
            })(notebook.pages[pi]);
        }

        // Add new page button
        var addRow = document.createElement('div');
        addRow.className = 'note-add-page-row';
        var addInput = document.createElement('input');
        addInput.type = 'text';
        addInput.placeholder = 'New page title...';
        var addBtn = document.createElement('button');
        addBtn.textContent = '+ Add Page';
        addBtn.addEventListener('click', function () {
            var title = addInput.value.trim();
            if (title) {
                postMessage({ type: 'addNotePage', notebookId: notebook.id, title: title });
                addInput.value = '';
            }
        });
        addInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { addBtn.click(); }
        });
        addRow.appendChild(addInput);
        addRow.appendChild(addBtn);
        container.appendChild(addRow);
    }

    function openEditor(page) {
        activeSlug = page.slug;
        window.NoteEditor._currentSlug = page.slug;

        var pageList = document.getElementById('notes-page-list');
        var editorArea = document.getElementById('notes-editor-area');
        if (pageList) { pageList.classList.add('hidden'); }
        if (editorArea) { editorArea.classList.remove('hidden'); }

        // Initialize editor if not already
        var mount = document.getElementById('notes-editor-mount');
        if (mount && !window.NoteEditor.isActive()) {
            // Read the nonce from the page's script tags
            var scripts = document.querySelectorAll('script[nonce]');
            var nonce = scripts.length > 0 ? scripts[0].nonce || scripts[0].getAttribute('nonce') : '';
            window.NoteEditor.init(mount, nonce);

            // Auto-save on content change (debounced)
            window.NoteEditor.onUpdate(function () {
                editorDirty = true;
                var indicator = document.getElementById('notes-save-indicator');
                if (indicator) { indicator.textContent = 'Unsaved changes'; }
                if (saveTimeout) { clearTimeout(saveTimeout); }
                saveTimeout = setTimeout(function () {
                    saveCurrentNote();
                }, 2000);
            });
        }

        // Request content from extension
        postMessage({ type: 'requestNoteContent', slug: page.slug });
    }

    function closeEditor() {
        // Save before closing
        if (editorDirty && activeSlug) {
            saveCurrentNote();
        }
        if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }

        // Exit fullscreen if active
        var editorArea = document.getElementById('notes-editor-area');
        if (editorArea && editorArea.classList.contains('fullscreen')) {
            editorArea.classList.remove('fullscreen');
        }

        activeSlug = null;
        window.NoteEditor._currentSlug = '';
        editorDirty = false;

        window.NoteEditor.destroy();
        var mount = document.getElementById('notes-editor-mount');
        if (mount) { mount.innerHTML = ''; }

        var indicator = document.getElementById('notes-save-indicator');
        if (indicator) { indicator.textContent = ''; }

        renderPageList();
    }

    function saveCurrentNote() {
        if (!activeSlug) { return; }
        var markdown = window.NoteEditor.getMarkdown();
        postMessage({ type: 'saveNoteContent', slug: activeSlug, content: markdown });
        editorDirty = false;
        var indicator = document.getElementById('notes-save-indicator');
        if (indicator) { indicator.textContent = 'Saved'; }
    }

    function handleNoteContent(slug, content) {
        if (slug !== activeSlug) { return; }
        window.NoteEditor.setContent(content);
        editorDirty = false;
        var indicator = document.getElementById('notes-save-indicator');
        if (indicator) { indicator.textContent = ''; }
    }

    function handleImageUploaded(src) {
        window.NoteEditor.insertImage(src, '');
    }

    // Wire up toolbar
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('#notes-editor-toolbar button');
        if (!btn) { return; }
        var cmd = btn.dataset.cmd;
        switch (cmd) {
            case 'back': closeEditor(); break;
            case 'bold': window.NoteEditor.toggleBold(); break;
            case 'italic': window.NoteEditor.toggleItalic(); break;
            case 'strike': window.NoteEditor.toggleStrike(); break;
            case 'h1': window.NoteEditor.toggleHeading(1); break;
            case 'h2': window.NoteEditor.toggleHeading(2); break;
            case 'h3': window.NoteEditor.toggleHeading(3); break;
            case 'bulletList': window.NoteEditor.toggleBulletList(); break;
            case 'orderedList': window.NoteEditor.toggleOrderedList(); break;
            case 'taskList': window.NoteEditor.toggleTaskList(); break;
            case 'codeBlock': window.NoteEditor.toggleCodeBlock(); break;
            case 'blockquote': window.NoteEditor.toggleBlockquote(); break;
            case 'hr': window.NoteEditor.setHorizontalRule(); break;
            case 'save': saveCurrentNote(); break;
            case 'fullscreen': toggleFullscreen(); break;
            case 'link':
                var href = prompt('Enter URL:');
                if (href !== null) { window.NoteEditor.setLink(href); }
                break;
        }
    });

    function toggleFullscreen() {
        var editorArea = document.getElementById('notes-editor-area');
        if (!editorArea) { return; }
        var isFS = editorArea.classList.toggle('fullscreen');
        var btn = editorArea.querySelector('.toolbar-fullscreen-btn');
        if (btn) {
            btn.textContent = isFS ? '\u2716 Exit' : '\u26F6';
            btn.title = isFS ? 'Exit fullscreen (Escape)' : 'Toggle fullscreen (Escape to exit)';
        }
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            var editorArea = document.getElementById('notes-editor-area');
            if (editorArea && editorArea.classList.contains('fullscreen')) {
                e.preventDefault();
                toggleFullscreen();
                return;
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            if (activeSlug && window.NoteEditor.isActive()) {
                e.preventDefault();
                saveCurrentNote();
            }
        }
    });

    window.NotesRenderer = {
        setData: setData,
        handleNoteContent: handleNoteContent,
        handleImageUploaded: handleImageUploaded,
    };
})();
