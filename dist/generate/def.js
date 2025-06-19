"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDef = generateDef;
const node_path_1 = __importDefault(require("node:path"));
const utility_1 = require("../utility");
function generateDef(apimodel, modelPath, opts, res) {
    const { fs, log } = res;
    const modelBasePath = node_path_1.default.dirname(modelPath);
    const defFilePath = node_path_1.default.join(modelBasePath, (null == opts.outprefix ? '' : opts.outprefix) + 'def-generated.jsonic');
    const modelDef = { main: { def: apimodel.main.def } };
    let modelDefSrc = JSON.stringify(modelDef, null, 2);
    modelDefSrc =
        '# GENERATED FILE - DO NOT EDIT\n\n' +
            modelDefSrc.substring(1, modelDefSrc.length - 1).replace(/\n  /g, '\n');
    (0, utility_1.writeChanged)('def-model', defFilePath, modelDefSrc, fs, log);
}
//# sourceMappingURL=def.js.map