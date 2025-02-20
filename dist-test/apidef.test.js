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
        const build = await __1.ApiDef.makeBuild({
            folder: __dirname + '/../test/api',
            debug: 'debug',
            outprefix: 'statuspage-1.0.0-20241218-'
        });
        const model = (0, aontu_1.Aontu)(`
@"@voxgig/apidef/model/apidef.jsonic"

def: 'statuspage-1.0.0-20241218-def.json'

main: api: guide: {

entity: page: {
  path: {
    '/pages/{page_id}': op: {
      load: { method: get, place: foo }
      update: method: put
    }
  }
}

entity: incident: {
  path: {
    '/pages/{page_id}/incidents': op: {
      create: method: post
      list: method: get    
    }
    '/pages/{page_id}/incidents/{incident_id}': op: {
      remove: method: delete
      update: method: put
      load: method: get
    }
  }
}


}

`).gen();
        // console.dir(model, { depth: null })
        const buildspec = {
            spec: {
                base: __dirname + '/../test/api'
            }
        };
        await build(model, buildspec, {});
    });
});
//# sourceMappingURL=apidef.test.js.map