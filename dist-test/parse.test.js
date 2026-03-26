"use strict";
/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const parse_1 = require("../dist/parse");
(0, node_test_1.describe)('parse', () => {
    (0, node_test_1.test)('happy', async () => {
        const pm0 = { file: 'f0' };
        node_assert_1.default.ok(parse_1.parse);
        await node_assert_1.default.rejects((0, parse_1.parse)('not-a-kind', '', pm0), /unknown/);
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', 'bad', pm0), /JSON/);
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', undefined, pm0), /string/);
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', '{}', pm0), /Unsupported/);
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', '', pm0), /empty/);
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', `openapi: 3.0.0
a::1`, pm0), /syntax/);
        const p0 = await (0, parse_1.parse)('OpenAPI', '{"openapi":"3.0.0", "info": {"title": "T0","version": "1.0.0"},"paths":{}}', pm0);
        node_assert_1.default.deepStrictEqual(p0, {
            openapi: '3.0.0',
            info: { title: 'T0', version: '1.0.0' },
            paths: {},
            components: {}
        });
        const p1 = await (0, parse_1.parse)('OpenAPI', `
openapi: 3.0.0
info:
  title: T1
  version: 1.0.0
paths: {}
`, pm0);
        node_assert_1.default.deepStrictEqual(p1, {
            openapi: '3.0.0',
            info: { title: 'T1', version: '1.0.0' },
            paths: {},
            components: {}
        });
    });
    (0, node_test_1.test)('validateSource', async () => {
        const pm0 = { file: 'f0' };
        // Empty string should be rejected
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', '', pm0), /source is empty/);
        // Only whitespace should be rejected
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', '   \n\t  \n  ', pm0), /source is empty/);
        // Only YAML comments should be rejected
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', '# Just a comment', pm0), /source is empty/);
        // Comments and whitespace should be rejected
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', `
# Comment 1
  # Comment 2
    # Comment 3
`, pm0), /source is empty/);
        // Mix of comments and whitespace should be rejected
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', `

# Header comment

  # Another comment

`, pm0), /source is empty/);
    });
});
//# sourceMappingURL=parse.test.js.map