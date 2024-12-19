"use strict";
/* Copyright (c) 2024 Voxgig Ltd, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const code_1 = require("@hapi/code");
// import { cmp, each, Project, Folder, File, Code } from 'jostraca'
const parse_1 = require("../dist/parse");
(0, node_test_1.describe)('parse', () => {
    (0, node_test_1.test)('happy', async () => {
        (0, code_1.expect)(parse_1.parse).exist();
        await (0, code_1.expect)((0, parse_1.parse)('not-a-kind', '')).reject(/unknown/);
        await (0, code_1.expect)((0, parse_1.parse)('OpenAPI', 'bad')).reject(/JSON/);
        await (0, code_1.expect)((0, parse_1.parse)('OpenAPI', undefined)).reject(/JSON/);
        await (0, code_1.expect)((0, parse_1.parse)('OpenAPI', '{}')).reject(/Unsupported/);
    });
});
//# sourceMappingURL=parse.test.js.map