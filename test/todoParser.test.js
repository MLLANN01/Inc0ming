"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const todoParser_1 = require("../src/parsers/todoParser");
suite('Todo Parser', () => {
    const sampleTodo = `# TODO
* [ ] 3/10 Presentation
    - Title
    - Body
    - Closing
* [ ] 2026 Vacation
* [ ] Execuitive Status Skill
* [x] Completed task`;
    test('parses todo items', () => {
        const data = (0, todoParser_1.parseTodo)(sampleTodo);
        assert.strictEqual(data.items.length, 4);
    });
    test('parses unchecked items', () => {
        const data = (0, todoParser_1.parseTodo)(sampleTodo);
        assert.strictEqual(data.items[0].text, '3/10 Presentation');
        assert.strictEqual(data.items[0].completed, false);
    });
    test('parses checked items', () => {
        const data = (0, todoParser_1.parseTodo)(sampleTodo);
        assert.strictEqual(data.items[3].text, 'Completed task');
        assert.strictEqual(data.items[3].completed, true);
    });
    test('parses detail sub-bullets', () => {
        const data = (0, todoParser_1.parseTodo)(sampleTodo);
        assert.strictEqual(data.items[0].details.length, 3);
        assert.strictEqual(data.items[0].details[0], 'Title');
        assert.strictEqual(data.items[0].details[1], 'Body');
        assert.strictEqual(data.items[0].details[2], 'Closing');
    });
    test('items without details have empty array', () => {
        const data = (0, todoParser_1.parseTodo)(sampleTodo);
        assert.strictEqual(data.items[1].details.length, 0);
    });
    test('tracks line numbers', () => {
        const data = (0, todoParser_1.parseTodo)(sampleTodo);
        assert.strictEqual(data.items[0].lineNumber, 2);
        assert.strictEqual(data.items[1].lineNumber, 6);
    });
    test('handles empty content', () => {
        const data = (0, todoParser_1.parseTodo)('');
        assert.strictEqual(data.items.length, 0);
    });
});
//# sourceMappingURL=todoParser.test.js.map