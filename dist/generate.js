"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateModel = generateModel;
const node_path_1 = __importDefault(require("node:path"));
const jostraca_1 = require("jostraca");
const utility_1 = require("./utility");
async function generateModel(apimodel, spec, opts, res) {
    const { fs, log } = res;
    const modelPath = node_path_1.default.normalize(spec.config.model);
    const modelapi = { main: { api: apimodel.main.api } };
    let modelSrc = JSON.stringify(modelapi, null, 2);
    modelSrc =
        '# GENERATED FILE - DO NOT EDIT\n\n' +
            modelSrc.substring(1, modelSrc.length - 1).replace(/\n  /g, '\n');
    (0, utility_1.writeChanged)('api-model', modelPath, modelSrc, fs, log);
    const apiFolder = node_path_1.default.join(opts.folder, 'api');
    fs.mkdirSync(apiFolder, { recursive: true });
    (0, jostraca_1.each)(apimodel.main.api.entity, ((entity, entityName) => {
        const entityFile = node_path_1.default.join(apiFolder, (null == opts.outprefix ? '' : opts.outprefix) + entityName + '.jsonic');
        const entityJSON = JSON.stringify(entity, null, 2);
        const entitySrc = '# GENERATED FILE - DO NOT EDIT\n\n' +
            '# Entity API\n\n' +
            `main.api.entity.${entity.name}:\n` +
            entityJSON.substring(1, modelSrc.length - 1).replace(/\n  /g, '\n');
        (0, utility_1.writeChanged)('api-entity-model:' + entityName, entityFile, entitySrc, fs, log);
    }));
    return modelPath;
}
//# sourceMappingURL=generate.js.map