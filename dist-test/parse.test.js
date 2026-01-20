"use strict";
/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const code_1 = require("@hapi/code");
const parse_1 = require("../dist/parse");
(0, node_test_1.describe)('parse', () => {
    (0, node_test_1.test)('happy', async () => {
        const pm0 = { file: 'f0' };
        (0, code_1.expect)(parse_1.parse).exist();
        await (0, code_1.expect)((0, parse_1.parse)('not-a-kind', '', pm0)).reject(/unknown/);
        await (0, code_1.expect)((0, parse_1.parse)('OpenAPI', 'bad', pm0)).reject(/JSON/);
        await (0, code_1.expect)((0, parse_1.parse)('OpenAPI', undefined, pm0)).reject(/string/);
        await (0, code_1.expect)((0, parse_1.parse)('OpenAPI', '{}', pm0)).reject(/Unsupported/);
        await (0, code_1.expect)((0, parse_1.parse)('OpenAPI', '', pm0)).reject(/empty/);
        await (0, code_1.expect)((0, parse_1.parse)('OpenAPI', `openapi: 3.0.0
a::1`, pm0)).reject(/syntax/);
        const p0 = await (0, parse_1.parse)('OpenAPI', '{"openapi":"3.0.0", "info": {"title": "T0","version": "1.0.0"},"paths":{}}', pm0);
        (0, code_1.expect)(p0).equal({
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
        (0, code_1.expect)(p1).equal({
            openapi: '3.0.0',
            info: { title: 'T1', version: '1.0.0' },
            paths: {},
            components: {}
        });
    });
    (0, node_test_1.test)('validateSource', async () => {
        const pm0 = { file: 'f0' };
        // Empty string should be rejected
        await (0, code_1.expect)((0, parse_1.parse)('OpenAPI', '', pm0)).reject(/source is empty/);
        // Only whitespace should be rejected
        await (0, code_1.expect)((0, parse_1.parse)('OpenAPI', '   \n\t  \n  ', pm0)).reject(/source is empty/);
        // Only YAML comments should be rejected
        await (0, code_1.expect)((0, parse_1.parse)('OpenAPI', '# Just a comment', pm0)).reject(/source is empty/);
        // Comments and whitespace should be rejected
        await (0, code_1.expect)((0, parse_1.parse)('OpenAPI', `
# Comment 1
  # Comment 2
    # Comment 3
`, pm0)).reject(/source is empty/);
        // Mix of comments and whitespace should be rejected
        await (0, code_1.expect)((0, parse_1.parse)('OpenAPI', `

# Header comment

  # Another comment

`, pm0)).reject(/source is empty/);
    });
});
//# sourceMappingURL=parse.test.js.map