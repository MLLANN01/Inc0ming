// @ts-nocheck
/* Shared inline edit and autocomplete utilities for webview renderers */
(function () {
    function createInlineEdit(currentText, onSave, onCancel) {
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-edit';
        input.value = currentText;
        var done = false;

        function cleanup() {
            document.removeEventListener('mousedown', onDocClick, true);
        }

        function save() {
            if (done) { return; }
            done = true;
            cleanup();
            var val = input.value.trim();
            if (val !== currentText) {
                onSave(val);
            } else if (onCancel) {
                onCancel();
            }
        }

        function onDocClick(e) {
            if (e.target !== input) { save(); }
        }

        input.addEventListener('blur', save);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { save(); }
            if (e.key === 'Escape') {
                if (done) { return; }
                done = true;
                cleanup();
                if (onCancel) { onCancel(); }
            }
        });

        document.addEventListener('mousedown', onDocClick, true);

        return input;
    }

    function createAutocompleteEdit(currentText, suggestions, onSave, onCancel) {
        var wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';
        wrapper.style.width = '100%';

        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-edit';
        input.value = currentText;

        var dropdown = document.createElement('div');
        dropdown.className = 'autocomplete-dropdown';
        dropdown.style.display = 'none';

        var done = false;

        function updateDropdown() {
            var val = input.value.trim().toLowerCase();
            dropdown.innerHTML = '';
            if (!val && suggestions.length === 0) { dropdown.style.display = 'none'; return; }
            var filtered = suggestions.filter(function (s) {
                return s.toLowerCase().indexOf(val) >= 0;
            });
            if (filtered.length === 0) { dropdown.style.display = 'none'; return; }
            for (var i = 0; i < filtered.length; i++) {
                (function (name) {
                    var item = document.createElement('div');
                    item.className = 'autocomplete-item';
                    item.textContent = name;
                    item.addEventListener('mousedown', function (e) {
                        e.preventDefault();
                        input.value = name;
                        dropdown.style.display = 'none';
                        save();
                    });
                    dropdown.appendChild(item);
                })(filtered[i]);
            }
            dropdown.style.display = '';
        }

        function cleanup() {
            document.removeEventListener('mousedown', onDocClick, true);
        }

        function save() {
            if (done) { return; }
            done = true;
            cleanup();
            var val = input.value.trim();
            if (val !== currentText) {
                onSave(val);
            } else if (onCancel) {
                onCancel();
            }
        }

        function onDocClick(e) {
            if (!wrapper.contains(e.target)) { save(); }
        }

        input.addEventListener('input', updateDropdown);
        input.addEventListener('focus', updateDropdown);

        input.addEventListener('blur', function () {
            setTimeout(function () {
                if (!done && !wrapper.contains(document.activeElement)) { save(); }
            }, 150);
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { save(); }
            if (e.key === 'Escape') {
                if (done) { return; }
                done = true;
                cleanup();
                if (onCancel) { onCancel(); }
            }
        });

        document.addEventListener('mousedown', onDocClick, true);

        wrapper.appendChild(input);
        wrapper.appendChild(dropdown);
        wrapper._input = input;
        return wrapper;
    }

    window.EditUtils = {
        createInlineEdit: createInlineEdit,
        createAutocompleteEdit: createAutocompleteEdit,
    };
})();
