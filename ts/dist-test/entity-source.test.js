"use strict";
/* Copyright (c) 2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const entity_1 = require("../dist/builder/entity/entity");
// Read as tsv.test.ts reads its rows: a header, then tab-separated cells.
function rows(name) {
    const lines = (0, node_fs_1.readFileSync)(node_path_1.default.join(__dirname, '..', 'test', name + '.tsv'), 'utf8')
        .split(/\r?\n/).filter((line) => '' !== line.trim());
    const head = lines[0].split('\t');
    return lines.slice(1).map((line) => {
        const cells = line.split('\t');
        return Object.fromEntries(head.map((h, i) => [h, cells[i] ?? '']));
    });
}
(0, node_test_1.describe)('entity-source', () => {
    const all = rows('entity-source');
    (0, node_test_1.test)('has rows', () => node_assert_1.default.ok(0 < all.length));
    for (const row of all) {
        (0, node_test_1.test)(row.entity.slice(0, 60), () => {
            node_assert_1.default.strictEqual((0, entity_1.entitySource)(JSON.parse(row.entity)), JSON.parse(row.expected));
        });
    }
});
//# sourceMappingURL=entity-source.test.js.map