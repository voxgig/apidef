"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDef = resolveDef;
const jostraca_1 = require("jostraca");
function resolveDef(apimodel, opts) {
    const defFile = (null == opts.outprefix ? '' : opts.outprefix) + 'api-def.jsonic';
    const modelDef = { main: { def: apimodel.main.def } };
    let modelDefSrc = JSON.stringify(modelDef, null, 2);
    modelDefSrc =
        '# API Definition\n\n' +
            modelDefSrc.substring(1, modelDefSrc.length - 1).replace(/\n  /g, '\n');
    return function defBuilder() {
        (0, jostraca_1.Folder)({ name: 'api' }, () => {
            (0, jostraca_1.File)({ name: defFile }, () => (0, jostraca_1.Content)(modelDefSrc));
        });
    };
}
//# sourceMappingURL=def.js.map