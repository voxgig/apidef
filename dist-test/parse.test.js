"use strict";
/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const code_1 = require("@hapi/code");
const __1 = require("..");
(0, node_test_1.describe)('parse', () => {
    (0, node_test_1.test)('happy', async () => {
        (0, code_1.expect)(__1.parse).exist();
        await (0, code_1.expect)((0, __1.parse)('not-a-kind', '')).reject(/unknown/);
        await (0, code_1.expect)((0, __1.parse)('OpenAPI', 'bad')).reject(/JSON/);
        await (0, code_1.expect)((0, __1.parse)('OpenAPI', undefined)).reject(/JSON/);
        await (0, code_1.expect)((0, __1.parse)('OpenAPI', '{}')).reject(/Unsupported/);
        const p0 = await (0, __1.parse)('OpenAPI', '{"openapi":"3.0.0", "info": {"title": "T0","version": "1.0.0"},"paths":{}}');
        (0, code_1.expect)(p0).equal({
            openapi: '3.0.0',
            info: { title: 'T0', version: '1.0.0' },
            paths: {},
            components: {}
        });
        const p1 = await (0, __1.parse)('OpenAPI', `
openapi: 3.0.0
info:
  title: T1
  version: 1.0.0
paths: {}
`);
        (0, code_1.expect)(p1).equal({
            openapi: '3.0.0',
            info: { title: 'T1', version: '1.0.0' },
            paths: {},
            components: {}
        });
    });
});
//# sourceMappingURL=parse.test.js.map