"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeEntityBuilder = makeEntityBuilder;
const entity_1 = require("./entity/entity");
const info_1 = require("./entity/info");
async function makeEntityBuilder(ctx) {
    const { apimodel, opts } = ctx;
    const entityBuilder = (0, entity_1.resolveEntity)(apimodel, opts);
    const infoBuilder = (0, info_1.resolveInfo)(apimodel, opts);
    return function fullEntityBuilder() {
        entityBuilder();
        infoBuilder();
    };
}
//# sourceMappingURL=entity.js.map