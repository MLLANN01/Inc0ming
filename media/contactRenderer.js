// @ts-nocheck
/* Contact Renderer — grid widgets with search, inline edit, add/delete */
(function () {
    var contactData = null;
    var searchTerm = '';

    function postMessage(msg) {
        if (window.DashboardBridge) { window.DashboardBridge.postMessage(msg); }
    }

    function setData(data) {
        contactData = data;
        render();
    }

    function render() {
        var grid = document.getElementById('contacts-grid');
        if (!grid || !contactData) { return; }
        grid.innerHTML = '';

        var lowerSearch = searchTerm.toLowerCase();

        for (var gi = 0; gi < contactData.groups.length; gi++) {
            (function (group) {
                // Filter items by search term
                var filteredItems = group.items;
                if (lowerSearch) {
                    filteredItems = group.items.filter(function (item) {
                        return item.name.toLowerCase().indexOf(lowerSearch) >= 0 ||
                               item.contactType.toLowerCase().indexOf(lowerSearch) >= 0 ||
                               item.email.toLowerCase().indexOf(lowerSearch) >= 0 ||
                               item.notes.toLowerCase().indexOf(lowerSearch) >= 0;
                    });
                    // Hide groups with no matching items during search
                    if (filteredItems.length === 0) { return; }
                }

                var widget = document.createElement('div');
                widget.className = 'grid-widget';
                widget.dataset.sectionId = group.id;

                // ---- Widget Header ----
                var header = document.createElement('div');
                header.className = 'widget-header';

                var titleEl = document.createElement('span');
                titleEl.className = 'widget-title';
                titleEl.textContent = group.name;

                // Double-click to rename group
                titleEl.addEventListener('dblclick', function (e) {
                    e.stopPropagation();
                    var input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'inline-edit';
                    input.value = group.name;
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
                        if (newName && newName !== group.name) {
                            postMessage({
                                type: 'renameContactGroup',
                                id: group.id,
                                name: newName,
                            });
                        }
                        input.replaceWith(titleEl);
                        titleEl.textContent = newName || group.name;
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

                // Add contact button
                var addBtn = document.createElement('button');
                addBtn.className = 'section-add-btn';
                addBtn.textContent = '+';
                addBtn.title = 'Add contact to this group';
                addBtn.addEventListener('click', function () {
                    var form = widget.querySelector('.contact-add-form');
                    if (form) {
                        form.classList.remove('hidden');
                        form.querySelector('input').focus();
                    }
                });
                header.appendChild(addBtn);

                // Delete group button
                var delBtn = document.createElement('button');
                delBtn.className = 'section-delete-btn';
                delBtn.textContent = '\u00d7';
                delBtn.title = 'Delete group';
                delBtn.addEventListener('click', function () {
                    postMessage({
                        type: 'deleteContactGroup',
                        id: group.id,
                    });
                });
                header.appendChild(delBtn);

                widget.appendChild(header);

                // ---- Widget Body ----
                var body = document.createElement('div');
                body.className = 'widget-body';

                for (var i = 0; i < filteredItems.length; i++) {
                    (function (item) {
                        var row = document.createElement('div');
                        row.className = 'contact-item';
                        row.dataset.itemId = item.id;

                        // Name
                        var nameEl = document.createElement('span');
                        nameEl.className = 'contact-name';
                        nameEl.textContent = item.name;
                        row.appendChild(nameEl);

                        // Type badge
                        if (item.contactType) {
                            var badge = document.createElement('span');
                            badge.className = 'contact-type-badge';
                            badge.textContent = item.contactType;
                            row.appendChild(badge);
                        }

                        // Detail lines
                        var details = document.createElement('div');
                        details.className = 'contact-details';

                        if (item.email) {
                            var emailLine = document.createElement('div');
                            emailLine.className = 'contact-detail-line';
                            emailLine.innerHTML = '<span class="contact-detail-label">Email:</span> ' + escapeHtml(item.email);
                            details.appendChild(emailLine);
                        }
                        if (item.phone) {
                            var phoneLine = document.createElement('div');
                            phoneLine.className = 'contact-detail-line';
                            phoneLine.innerHTML = '<span class="contact-detail-label">Phone:</span> ' + escapeHtml(item.phone);
                            details.appendChild(phoneLine);
                        }
                        if (item.notes) {
                            var notesLine = document.createElement('div');
                            notesLine.className = 'contact-detail-line';
                            notesLine.innerHTML = '<span class="contact-detail-label">Notes:</span> ' + escapeHtml(item.notes);
                            details.appendChild(notesLine);
                        }

                        if (details.children.length > 0) {
                            row.appendChild(details);
                        }

                        // Edit button
                        var editBtn = document.createElement('button');
                        editBtn.className = 'contact-action-btn contact-edit-btn';
                        editBtn.textContent = '\u270E';
                        editBtn.title = 'Edit contact';
                        editBtn.addEventListener('click', function (e) {
                            e.stopPropagation();
                            showEditForm(row, item);
                        });
                        row.appendChild(editBtn);

                        // Delete button
                        var delItemBtn = document.createElement('button');
                        delItemBtn.className = 'contact-action-btn close-btn';
                        delItemBtn.textContent = '\u00d7';
                        delItemBtn.title = 'Delete contact';
                        delItemBtn.addEventListener('click', function (e) {
                            e.stopPropagation();
                            postMessage({
                                type: 'deleteContact',
                                id: item.id,
                            });
                        });
                        row.appendChild(delItemBtn);

                        body.appendChild(row);
                    })(filteredItems[i]);
                }

                widget.appendChild(body);

                // ---- Inline add-contact form (hidden by default) ----
                var addForm = document.createElement('div');
                addForm.className = 'contact-add-form hidden';

                var nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.placeholder = 'Name...';

                var typeInput = document.createElement('input');
                typeInput.type = 'text';
                typeInput.placeholder = 'Type (e.g. colleague)';

                var saveBtnForm = document.createElement('button');
                saveBtnForm.textContent = 'Add';
                saveBtnForm.addEventListener('click', function () {
                    var name = nameInput.value.trim();
                    if (name) {
                        postMessage({
                            type: 'addContact',
                            groupId: group.id,
                            name: name,
                            contactType: typeInput.value.trim(),
                        });
                        nameInput.value = '';
                        typeInput.value = '';
                        addForm.classList.add('hidden');
                    }
                });

                var cancelBtnForm = document.createElement('button');
                cancelBtnForm.className = 'cancel-btn';
                cancelBtnForm.textContent = 'Cancel';
                cancelBtnForm.addEventListener('click', function () {
                    nameInput.value = '';
                    typeInput.value = '';
                    addForm.classList.add('hidden');
                });

                function submitFormOnEnter(e) {
                    if (e.key === 'Enter') { saveBtnForm.click(); }
                    if (e.key === 'Escape') { cancelBtnForm.click(); }
                }

                nameInput.addEventListener('keydown', submitFormOnEnter);
                typeInput.addEventListener('keydown', submitFormOnEnter);

                addForm.appendChild(nameInput);
                addForm.appendChild(typeInput);
                addForm.appendChild(saveBtnForm);
                addForm.appendChild(cancelBtnForm);
                widget.appendChild(addForm);

                // ---- Resize handle ----
                var resizeHandle = document.createElement('div');
                resizeHandle.className = 'widget-resize-handle';
                widget.appendChild(resizeHandle);

                grid.appendChild(widget);
            })(contactData.groups[gi]);
        }
    }

    function showEditForm(row, item) {
        var editForm = document.createElement('div');
        editForm.className = 'contact-inline-edit';

        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'inline-edit';
        nameInput.value = item.name;
        nameInput.placeholder = 'Name';

        var typeInput = document.createElement('input');
        typeInput.type = 'text';
        typeInput.className = 'inline-edit';
        typeInput.value = item.contactType;
        typeInput.placeholder = 'Type';

        var emailInput = document.createElement('input');
        emailInput.type = 'text';
        emailInput.className = 'inline-edit';
        emailInput.value = item.email;
        emailInput.placeholder = 'Email';

        var phoneInput = document.createElement('input');
        phoneInput.type = 'text';
        phoneInput.className = 'inline-edit';
        phoneInput.value = item.phone;
        phoneInput.placeholder = 'Phone';

        var notesInput = document.createElement('input');
        notesInput.type = 'text';
        notesInput.className = 'inline-edit';
        notesInput.value = item.notes;
        notesInput.placeholder = 'Notes';

        var saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-btn';
        cancelBtn.textContent = 'Cancel';

        editForm.appendChild(nameInput);
        editForm.appendChild(typeInput);
        editForm.appendChild(emailInput);
        editForm.appendChild(phoneInput);
        editForm.appendChild(notesInput);
        editForm.appendChild(saveBtn);
        editForm.appendChild(cancelBtn);

        var editDone = false;

        function saveEdit() {
            if (editDone) { return; }
            editDone = true;
            postMessage({
                type: 'editContact',
                id: item.id,
                name: nameInput.value.trim() || item.name,
                contactType: typeInput.value.trim(),
                email: emailInput.value.trim(),
                phone: phoneInput.value.trim(),
                notes: notesInput.value.trim(),
            });
        }

        function cancelEdit() {
            if (editDone) { return; }
            editDone = true;
            editForm.replaceWith(row);
        }

        saveBtn.addEventListener('click', saveEdit);
        cancelBtn.addEventListener('click', cancelEdit);

        var inputs = [nameInput, typeInput, emailInput, phoneInput, notesInput];
        for (var k = 0; k < inputs.length; k++) {
            inputs[k].addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') { saveEdit(); }
                if (ev.key === 'Escape') { cancelEdit(); }
            });
        }

        row.replaceWith(editForm);
        nameInput.focus();
        nameInput.select();
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Wire up search input
    var searchInput = document.getElementById('contacts-search');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            searchTerm = searchInput.value.trim();
            render();
        });
    }

    window.ContactRenderer = { setData: setData };
})();
