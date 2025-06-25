"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDef = resolveDef;
const jostraca_1 = require("jostraca");
function resolveDef(apimodel, opts) {
    // const { fs, log } = res
    // const folder = opts.folder as string
    // const defFilePath = Path.join(folder,
    //   (null == opts.outprefix ? '' : opts.outprefix) + 'def-generated.jsonic')
    const defFile = (null == opts.outprefix ? '' : opts.outprefix) + 'def-generated.jsonic';
    const modelDef = { main: { def: apimodel.main.def } };
    let modelDefSrc = JSON.stringify(modelDef, null, 2);
    modelDefSrc =
        '# GENERATED FILE - DO NOT EDIT\n\n' +
            modelDefSrc.substring(1, modelDefSrc.length - 1).replace(/\n  /g, '\n');
    // writeChanged('def-model', defFilePath, modelDefSrc, fs, log)
    return function defBuilder() {
        (0, jostraca_1.File)({ name: defFile }, () => (0, jostraca_1.Content)(modelDefSrc));
    };
}
//# sourceMappingURL=def.js.map