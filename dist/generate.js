"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateModel = generateModel;
const apiEntity_1 = require("./generate/apiEntity");
const def_1 = require("./generate/def");
const sdkEntity_1 = require("./generate/sdkEntity");
function generateModel(apimodel, spec, opts, res) {
    (0, apiEntity_1.generateApiEntity)(apimodel, spec, opts, res);
    (0, def_1.generateDef)(apimodel, opts, res);
    (0, sdkEntity_1.generateSdkEntity)(apimodel, opts, res);
}
//# sourceMappingURL=generate.js.map