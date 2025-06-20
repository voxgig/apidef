"use strict";
/* Copyright (c) 2024 Voxgig Ltd, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const code_1 = require("@hapi/code");
const aontu_1 = require("aontu");
// import { cmp, each, Project, Folder, File, Code } from 'jostraca'
const __1 = require("../");
(0, node_test_1.describe)('apidef', () => {
    (0, node_test_1.test)('happy', async () => {
        (0, code_1.expect)(__1.ApiDef).exist();
    });
    (0, node_test_1.test)('api-statuspage', async () => {
        try {
            let outprefix = 'statuspage-1.0.0-20241218-';
            const build = await __1.ApiDef.makeBuild({
                folder: __dirname + '/../test/api',
                debug: 'debug',
                outprefix,
            });
            const modelSrc = `
@"@voxgig/apidef/model/apidef.jsonic"

def: '${outprefix}def.json'
`;
            console.log('MODELSRC', modelSrc);
            const model = (0, aontu_1.Aontu)(modelSrc).gen();
            // console.dir(model, { depth: null })
            const buildspec = {
                spec: {
                    base: __dirname + '/../test/api'
                }
            };
            await build(model, buildspec, {});
        }
        catch (err) {
            console.log(err);
            throw err;
        }
    });
});
//# sourceMappingURL=apidef.test.js.map