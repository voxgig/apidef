"use strict";
/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const clean_1 = require("../../dist/transform/clean");
(0, node_test_1.describe)('transform-clean', () => {
    (0, node_test_1.test)('basic', async () => {
        node_assert_1.default.ok(clean_1.cleanTransform);
        let c = { apimodel: { a: { x: 1 }, b$: { x: 2 }, c: {}, d: [] } };
        let r = await (0, clean_1.cleanTransform)(c);
        node_assert_1.default.deepStrictEqual(r.ok, true);
        node_assert_1.default.deepStrictEqual(c.apimodel, { a: { x: 1 } });
    });
});
//# sourceMappingURL=clean.test.js.map