"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateModel = generateModel;
const node_path_1 = __importDefault(require("node:path"));
const utility_1 = require("./utility");
const apiEntity_1 = require("./generate/apiEntity");
const def_1 = require("./generate/def");
const sdkEntity_1 = require("./generate/sdkEntity");
function generateModel(apimodel, spec, opts, res) {
    const { fs, log } = res;
    // TODO: remove << 
    const modelPath = node_path_1.default.normalize(spec.config.model);
    const modelapi = { main: { api: apimodel.main.api } };
    let modelSrc = JSON.stringify(modelapi, null, 2);
    modelSrc =
        '# GENERATED FILE - DO NOT EDIT\n\n' +
            modelSrc.substring(1, modelSrc.length - 1).replace(/\n  /g, '\n');
    (0, utility_1.writeChanged)('api-model', modelPath, modelSrc, fs, log);
    // TODO: remove >> 
    (0, apiEntity_1.generateApiEntity)(apimodel, spec, opts, res);
    (0, def_1.generateDef)(apimodel, modelPath, opts, res);
    (0, sdkEntity_1.generateSdkEntity)(apimodel, modelPath, opts, res);
}
//# sourceMappingURL=generate.js.map