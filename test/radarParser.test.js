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
const radarParser_1 = require("../src/parsers/radarParser");
suite('Radar Parser', () => {
    const sampleRadar = `# Radar

## Birthdays
- 3/31/26 - Alex
- 4/15/26 - Steven

## Windows 10 LTSC
- 6/1/26 - EOSL

## jFrog Blocking
### Critical Vulnerabilities
- 4/1/26 - DEV
- 4/20/26 - PROD
### High Vulnerabilities
- 5/1/26 - DEV
- 5/20/25 - PROD`;
    test('parses swimlanes', () => {
        const data = (0, radarParser_1.parseRadar)(sampleRadar);
        assert.strictEqual(data.swimlanes.length, 3);
        assert.strictEqual(data.swimlanes[0].name, 'Birthdays');
        assert.strictEqual(data.swimlanes[1].name, 'Windows 10 LTSC');
        assert.strictEqual(data.swimlanes[2].name, 'jFrog Blocking');
    });
    test('parses direct items', () => {
        const data = (0, radarParser_1.parseRadar)(sampleRadar);
        assert.strictEqual(data.swimlanes[0].items.length, 2);
        assert.strictEqual(data.swimlanes[0].items[0].label, 'Alex');
        assert.strictEqual(data.swimlanes[0].items[0].date.getMonth(), 2); // March = 2
        assert.strictEqual(data.swimlanes[0].items[0].date.getDate(), 31);
    });
    test('parses sub-groups', () => {
        const data = (0, radarParser_1.parseRadar)(sampleRadar);
        const jfrog = data.swimlanes[2];
        assert.strictEqual(jfrog.subGroups.length, 2);
        assert.strictEqual(jfrog.subGroups[0].name, 'Critical Vulnerabilities');
        assert.strictEqual(jfrog.subGroups[0].items.length, 2);
        assert.strictEqual(jfrog.subGroups[1].name, 'High Vulnerabilities');
    });
    test('sub-group items have correct data', () => {
        const data = (0, radarParser_1.parseRadar)(sampleRadar);
        const critical = data.swimlanes[2].subGroups[0];
        assert.strictEqual(critical.items[0].label, 'DEV');
        assert.strictEqual(critical.items[0].date.getMonth(), 3); // April = 3
        assert.strictEqual(critical.items[0].date.getDate(), 1);
    });
    test('tracks line numbers', () => {
        const data = (0, radarParser_1.parseRadar)(sampleRadar);
        assert.strictEqual(data.swimlanes[0].items[0].lineNumber, 4);
        assert.strictEqual(data.swimlanes[0].items[1].lineNumber, 5);
    });
    test('handles empty content', () => {
        const data = (0, radarParser_1.parseRadar)('');
        assert.strictEqual(data.swimlanes.length, 0);
    });
    test('ignores items before any swimlane', () => {
        const data = (0, radarParser_1.parseRadar)('- 1/1/26 - orphan\n## Test\n- 2/1/26 - Valid');
        assert.strictEqual(data.swimlanes.length, 1);
        assert.strictEqual(data.swimlanes[0].items.length, 1);
        assert.strictEqual(data.swimlanes[0].items[0].label, 'Valid');
    });
});
//# sourceMappingURL=radarParser.test.js.map