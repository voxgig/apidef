"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const code_1 = require("@hapi/code");
// import { cmp, each, Project, Folder, File, Code } from 'jostraca'
const __1 = require("../");
(0, node_test_1.describe)('apidef', () => {
    (0, node_test_1.test)('happy', async () => {
        (0, code_1.expect)(__1.ApiDef).exist();
        // const { fs, vol } = memfs({})
        // expect(vol.toJSON()).equal({})
    });
});
//# sourceMappingURL=apidef.test.js.map