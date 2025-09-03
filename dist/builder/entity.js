"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeEntityBuilder = makeEntityBuilder;
const entity_1 = require("./entity/entity");
const def_1 = require("./entity/def");
async function makeEntityBuilder(ctx) {
    const { apimodel, opts } = ctx;
    const entityBuilder = (0, entity_1.resolveEntity)(apimodel, opts);
    const defBuilder = (0, def_1.resolveDef)(apimodel, opts);
    return function fullEntityBuilder() {
        entityBuilder();
        defBuilder();
    };
}
//# sourceMappingURL=entity.js.map