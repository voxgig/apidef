"use strict";
/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const code_1 = require("@hapi/code");
const clean_1 = require("../../dist/transform/clean");
(0, node_test_1.describe)('transform-clean', () => {
    (0, node_test_1.test)('basic', async () => {
        (0, code_1.expect)(clean_1.cleanTransform).exist();
        let c, r;
        // c = { apimodel: {} }
        // r = await cleanTransform(c)
        // expect(r.ok).equal(true)
        // expect(c.apimodel).equal({})
        c = { apimodel: { a: { x: 1 }, b$: { x: 2 }, c: {}, d: [] } };
        r = await (0, clean_1.cleanTransform)(c);
        (0, code_1.expect)(r.ok).equal(true);
        (0, code_1.expect)(c.apimodel).equal({});
    });
});
//# sourceMappingURL=clean.test.js.map