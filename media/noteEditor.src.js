/**
 * TipTap-based WYSIWYG markdown editor for Inc0ming notes.
 * Bundled via esbuild into noteEditor.js.
 */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { defaultMarkdownSerializer, defaultMarkdownParser, MarkdownSerializer, MarkdownParser } from '@tiptap/pm/markdown';

// Build a markdown serializer that supports task lists and images.
// TipTap uses camelCase node names (bulletList, listItem, etc.) while
// prosemirror-markdown uses snake_case (bullet_list, list_item, etc.).
// We add aliases for both so the serializer works regardless of source.
const baseNodes = {
    ...defaultMarkdownSerializer.nodes,
    taskList(state, node) {
        state.renderList(node, '  ', () => '');
    },
    taskItem(state, node) {
        const checked = node.attrs.checked ? '[x]' : '[ ]';
        state.write(`- ${checked} `);
        state.renderContent(node);
    },
    image(state, node) {
        // Don't escape the src URL — state.esc() adds backslashes to underscores etc.
        state.write(`![${state.esc(node.attrs.alt || '')}](${node.attrs.src})`);
    },
};

// Add camelCase aliases so the serializer recognises TipTap node names
const camelAliases = {
    bulletList: 'bullet_list',
    orderedList: 'ordered_list',
    listItem: 'list_item',
    codeBlock: 'code_block',
    hardBreak: 'hard_break',
    horizontalRule: 'horizontal_rule',
};
for (const [camel, snake] of Object.entries(camelAliases)) {
    if (baseNodes[snake] && !baseNodes[camel]) {
        baseNodes[camel] = baseNodes[snake];
    }
}

const serializer = new MarkdownSerializer(baseNodes, defaultMarkdownSerializer.marks);

// ProseMirror default schema uses snake_case node names; TipTap uses camelCase.
// Map PM → TipTap so parsed markdown JSON can be loaded into the TipTap editor.
const pmToTiptap = {
    bullet_list: 'bulletList',
    ordered_list: 'orderedList',
    list_item: 'listItem',
    code_block: 'codeBlock',
    hard_break: 'hardBreak',
    horizontal_rule: 'horizontalRule',
    task_list: 'taskList',
    task_item: 'taskItem',
};

function remapNodeTypes(json, map) {
    if (!json || typeof json !== 'object') { return json; }
    const out = { ...json };
    if (out.type && map[out.type]) { out.type = map[out.type]; }
    if (Array.isArray(out.content)) {
        out.content = out.content.map(c => remapNodeTypes(c, map));
    }
    return out;
}

let editor = null;
let nonce = '';

function init(element, nonceValue) {
    nonce = nonceValue || '';
    editor = new Editor({
        element,
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
            }),
            Image.configure({
                inline: false,
                allowBase64: true,
            }),
            Link.configure({
                openOnClick: false,
            }),
            TaskList,
            TaskItem.configure({
                nested: true,
            }),
        ],
        injectCSS: true,
        injectNonce: nonce,
        content: '',
        editorProps: {
            attributes: {
                class: 'note-editor-content',
            },
            handleDrop(view, event) {
                const files = event.dataTransfer && event.dataTransfer.files;
                if (files && files.length > 0) {
                    for (let i = 0; i < files.length; i++) {
                        if (files[i].type.startsWith('image/')) {
                            event.preventDefault();
                            handleImageFile(files[i]);
                            return true;
                        }
                    }
                }
                return false;
            },
            handlePaste(view, event) {
                const items = event.clipboardData && event.clipboardData.items;
                if (items) {
                    for (let i = 0; i < items.length; i++) {
                        if (items[i].type.startsWith('image/')) {
                            event.preventDefault();
                            const file = items[i].getAsFile();
                            if (file) { handleImageFile(file); }
                            return true;
                        }
                    }
                }
                return false;
            },
        },
    });

    return editor;
}

function handleImageFile(file) {
    const reader = new FileReader();
    reader.onload = function () {
        const base64 = reader.result.split(',')[1];
        if (window.DashboardBridge) {
            window.DashboardBridge.postMessage({
                type: 'uploadNoteImage',
                data: base64,
                mimeType: file.type,
                noteSlug: window.NoteEditor._currentSlug || '',
            });
        }
    };
    reader.readAsDataURL(file);
}

function setContent(markdown) {
    if (!editor) { return; }
    try {
        const doc = defaultMarkdownParser.parse(markdown || '');
        const json = remapNodeTypes(doc.toJSON(), pmToTiptap);
        editor.commands.setContent(json);
    } catch (e) {
        // Fallback: set as paragraph text
        editor.commands.setContent(markdown || '');
    }
}

function getMarkdown() {
    if (!editor) { return ''; }
    try {
        return serializer.serialize(editor.state.doc);
    } catch (e) {
        return editor.getText();
    }
}

function insertImage(src, alt) {
    if (!editor) { return; }
    editor.chain().focus().setImage({ src, alt: alt || '' }).run();
}

function destroy() {
    if (editor) {
        editor.destroy();
        editor = null;
    }
}

function isActive() {
    return editor !== null;
}

// Toolbar commands
function toggleBold() { if (editor) { editor.chain().focus().toggleBold().run(); } }
function toggleItalic() { if (editor) { editor.chain().focus().toggleItalic().run(); } }
function toggleStrike() { if (editor) { editor.chain().focus().toggleStrike().run(); } }
function toggleHeading(level) { if (editor) { editor.chain().focus().toggleHeading({ level }).run(); } }
function toggleBulletList() { if (editor) { editor.chain().focus().toggleBulletList().run(); } }
function toggleOrderedList() { if (editor) { editor.chain().focus().toggleOrderedList().run(); } }
function toggleTaskList() { if (editor) { editor.chain().focus().toggleTaskList().run(); } }
function toggleCodeBlock() { if (editor) { editor.chain().focus().toggleCodeBlock().run(); } }
function toggleBlockquote() { if (editor) { editor.chain().focus().toggleBlockquote().run(); } }
function setHorizontalRule() { if (editor) { editor.chain().focus().setHorizontalRule().run(); } }

function setLink(href) {
    if (!editor) { return; }
    if (href) {
        editor.chain().focus().setLink({ href }).run();
    } else {
        editor.chain().focus().unsetLink().run();
    }
}

function onUpdate(callback) {
    if (editor) {
        editor.on('update', callback);
    }
}

window.NoteEditor = {
    init,
    setContent,
    getMarkdown,
    insertImage,
    destroy,
    isActive,
    toggleBold,
    toggleItalic,
    toggleStrike,
    toggleHeading,
    toggleBulletList,
    toggleOrderedList,
    toggleTaskList,
    toggleCodeBlock,
    toggleBlockquote,
    setHorizontalRule,
    setLink,
    onUpdate,
    _currentSlug: '',
};
