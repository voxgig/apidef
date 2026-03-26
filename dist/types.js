"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenBuildShape = exports.OpenModelShape = exports.OpenControlShape = exports.KIT = void 0;
const shape_1 = require("shape");
const KIT = 'kit';
exports.KIT = KIT;
const ControlShape = (0, shape_1.Shape)({
    step: {
        parse: true,
        guide: true,
        transformers: true,
        builders: true,
        generate: true,
    }
});
const OpenControlShape = (0, shape_1.Shape)((0, shape_1.Open)(ControlShape), { name: 'Control' });
exports.OpenControlShape = OpenControlShape;
const ModelShape = (0, shape_1.Shape)({
    name: String,
    def: String,
    main: {
        [KIT]: {},
        def: {},
        api: {
            guide: {},
            entity: {},
        },
    }
});
const OpenModelShape = (0, shape_1.Shape)((0, shape_1.Open)(ModelShape), { name: 'Model' });
exports.OpenModelShape = OpenModelShape;
const BuildShape = (0, shape_1.Shape)({
    spec: {
        base: '',
        path: '',
        debug: '',
        use: {},
        res: [],
        require: '',
        log: {},
        fs: (0, shape_1.Any)(),
        dryrun: false,
        buildargs: {},
        watch: {
            mod: true,
            add: true,
            rem: true,
        }
    }
});
const OpenBuildShape = (0, shape_1.Shape)((0, shape_1.Open)(BuildShape));
exports.OpenBuildShape = OpenBuildShape;
//# sourceMappingURL=types.js.map