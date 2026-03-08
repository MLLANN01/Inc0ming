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
const dateUtils_1 = require("../src/utils/dateUtils");
suite('Date Utils', () => {
    test('parseDateMDYY parses valid date', () => {
        const d = (0, dateUtils_1.parseDateMDYY)('3/15/26');
        assert.ok(d);
        assert.strictEqual(d.getFullYear(), 2026);
        assert.strictEqual(d.getMonth(), 2); // March = 2
        assert.strictEqual(d.getDate(), 15);
    });
    test('parseDateMDYY handles single digit month/day', () => {
        const d = (0, dateUtils_1.parseDateMDYY)('1/5/26');
        assert.ok(d);
        assert.strictEqual(d.getMonth(), 0); // January = 0
        assert.strictEqual(d.getDate(), 5);
    });
    test('parseDateMDYY returns null for invalid format', () => {
        assert.strictEqual((0, dateUtils_1.parseDateMDYY)('not-a-date'), null);
        assert.strictEqual((0, dateUtils_1.parseDateMDYY)('2026-03-15'), null);
        assert.strictEqual((0, dateUtils_1.parseDateMDYY)(''), null);
    });
    test('parseDateMDYY returns null for invalid month', () => {
        assert.strictEqual((0, dateUtils_1.parseDateMDYY)('13/1/26'), null);
        assert.strictEqual((0, dateUtils_1.parseDateMDYY)('0/1/26'), null);
    });
    test('formatDateMDYY formats correctly', () => {
        const d = new Date(2026, 2, 15); // March 15, 2026
        assert.strictEqual((0, dateUtils_1.formatDateMDYY)(d), '3/15/26');
    });
    test('formatDateMDYY pads year', () => {
        const d = new Date(2005, 0, 1); // Jan 1, 2005
        assert.strictEqual((0, dateUtils_1.formatDateMDYY)(d), '1/1/05');
    });
    test('daysUntil returns positive for future dates', () => {
        const future = new Date();
        future.setDate(future.getDate() + 10);
        assert.strictEqual((0, dateUtils_1.daysUntil)(future), 10);
    });
    test('daysUntil returns negative for past dates', () => {
        const past = new Date();
        past.setDate(past.getDate() - 5);
        assert.strictEqual((0, dateUtils_1.daysUntil)(past), -5);
    });
    test('daysUntil returns 0 for today', () => {
        assert.strictEqual((0, dateUtils_1.daysUntil)(new Date()), 0);
    });
    test('getUrgencyLevel returns past for negative', () => {
        assert.strictEqual((0, dateUtils_1.getUrgencyLevel)(-1), 'past');
    });
    test('getUrgencyLevel returns urgent for 0-1 days', () => {
        assert.strictEqual((0, dateUtils_1.getUrgencyLevel)(0), 'urgent');
        assert.strictEqual((0, dateUtils_1.getUrgencyLevel)(1), 'urgent');
    });
    test('getUrgencyLevel returns warning for 2-7 days', () => {
        assert.strictEqual((0, dateUtils_1.getUrgencyLevel)(2), 'warning');
        assert.strictEqual((0, dateUtils_1.getUrgencyLevel)(7), 'warning');
    });
    test('getUrgencyLevel returns normal for 8+ days', () => {
        assert.strictEqual((0, dateUtils_1.getUrgencyLevel)(8), 'normal');
        assert.strictEqual((0, dateUtils_1.getUrgencyLevel)(100), 'normal');
    });
    test('getUrgencyLevel respects custom thresholds', () => {
        assert.strictEqual((0, dateUtils_1.getUrgencyLevel)(3, 14, 3), 'urgent');
        assert.strictEqual((0, dateUtils_1.getUrgencyLevel)(10, 14, 3), 'warning');
        assert.strictEqual((0, dateUtils_1.getUrgencyLevel)(15, 14, 3), 'normal');
    });
});
//# sourceMappingURL=dateUtils.test.js.map