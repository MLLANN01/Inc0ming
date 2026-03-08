// @ts-nocheck
/* Quote Renderer — random display + management list */
(function () {
    var currentData = null;
    var displayedIdx = -1;

    function postMessage(msg) {
        if (window.DashboardBridge) { window.DashboardBridge.postMessage(msg); }
    }

    function setData(data) {
        currentData = data;
        renderDisplay(data);
        renderList(data);
    }

    // Random quote in the banner area
    function renderDisplay(data) {
        var container = document.getElementById('quote-display');
        if (!container) { return; }

        container.innerHTML = '';

        if (!data || !data.items || data.items.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = '';

        // Keep the same quote if it still exists, otherwise pick new random
        if (displayedIdx < 0 || displayedIdx >= data.items.length) {
            displayedIdx = Math.floor(Math.random() * data.items.length);
        }
        var quote = data.items[displayedIdx];

        var textEl = document.createElement('div');
        textEl.className = 'quote-text';
        textEl.textContent = '\u201c' + quote.text + '\u201d';
        container.appendChild(textEl);

        if (quote.attribution) {
            var attrEl = document.createElement('div');
            attrEl.className = 'quote-attribution';
            attrEl.textContent = '\u2014 ' + quote.attribution;
            container.appendChild(attrEl);
        }
    }

    // Full editable list in the management section
    function renderList(data) {
        var list = document.getElementById('quotes-list');
        if (!list) { return; }

        list.innerHTML = '';

        if (!data || !data.items || data.items.length === 0) { return; }

        for (var i = 0; i < data.items.length; i++) {
            (function (quote) {
                var row = document.createElement('div');
                row.className = 'quote-row';

                var textSpan = document.createElement('span');
                textSpan.className = 'quote-row-text';
                textSpan.textContent = quote.text;
                if (quote.attribution) {
                    textSpan.textContent += '  \u2014 ' + quote.attribution;
                }

                // Double-click to edit
                textSpan.addEventListener('dblclick', function () {
                    var editForm = document.createElement('div');
                    editForm.className = 'quote-edit-form';

                    var textInput = document.createElement('input');
                    textInput.type = 'text';
                    textInput.value = quote.text;
                    textInput.placeholder = 'Quote text...';

                    var attrInput = document.createElement('input');
                    attrInput.type = 'text';
                    attrInput.value = quote.attribution || '';
                    attrInput.placeholder = 'Attribution (optional)';

                    var btns = document.createElement('div');
                    btns.className = 'form-buttons';

                    var saveBtn = document.createElement('button');
                    saveBtn.textContent = 'Save';
                    saveBtn.addEventListener('click', function () {
                        var newText = textInput.value.trim();
                        if (newText) {
                            postMessage({
                                type: 'editQuote',
                                id: quote.id,
                                text: newText,
                                attribution: attrInput.value.trim() || undefined,
                            });
                        }
                        editForm.replaceWith(row);
                    });

                    var cancelBtn = document.createElement('button');
                    cancelBtn.className = 'cancel-btn';
                    cancelBtn.textContent = 'Cancel';
                    cancelBtn.addEventListener('click', function () {
                        editForm.replaceWith(row);
                    });

                    function handleKeys(e) {
                        if (e.key === 'Enter') { saveBtn.click(); }
                        if (e.key === 'Escape') { cancelBtn.click(); }
                    }
                    textInput.addEventListener('keydown', handleKeys);
                    attrInput.addEventListener('keydown', handleKeys);

                    btns.appendChild(saveBtn);
                    btns.appendChild(cancelBtn);
                    editForm.appendChild(textInput);
                    editForm.appendChild(attrInput);
                    editForm.appendChild(btns);

                    row.replaceWith(editForm);
                    textInput.focus();
                    textInput.select();
                });

                var delBtn = document.createElement('button');
                delBtn.className = 'quote-delete-btn';
                delBtn.textContent = '\u00d7';
                delBtn.title = 'Delete quote';
                delBtn.addEventListener('click', function () {
                    postMessage({ type: 'deleteQuote', id: quote.id });
                });

                row.appendChild(textSpan);
                row.appendChild(delBtn);
                list.appendChild(row);
            })(data.items[i]);
        }
    }

    window.QuoteRenderer = { setData: setData };
})();
