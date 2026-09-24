"use strict";
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const pino_1 = __importDefault(require("pino"));
const jostraca_1 = require("jostraca");
const flow_1 = require("../dist/builder/flow");
const utility_1 = require("../dist/utility");
(0, node_test_1.describe)('flow-file-case', () => {
    (0, node_test_1.test)('leaves names that do not collide alone', () => {
        const base = (0, flow_1.flowFileBases)(['BasicAccountFlow', 'BasicCheckFlow']);
        node_assert_1.default.deepEqual(base, {
            BasicAccountFlow: 'BasicAccountFlow',
            BasicCheckFlow: 'BasicCheckFlow',
        });
    });
    (0, node_test_1.test)('suffixes every member of a case-colliding group', () => {
        const base = (0, flow_1.flowFileBases)(['BasicStaticIpFlow', 'BasicStaticIPFlow']);
        // Neither keeps the bare name: a bare name is what gets overwritten.
        node_assert_1.default.equal(base.BasicStaticIPFlow, 'BasicStaticIPFlow__1');
        node_assert_1.default.equal(base.BasicStaticIpFlow, 'BasicStaticIpFlow__2');
        const files = Object.values(base).map(f => f.toLowerCase());
        node_assert_1.default.equal(new Set(files).size, files.length);
    });
    (0, node_test_1.test)('is stable whatever order the flows arrive in', () => {
        const one = (0, flow_1.flowFileBases)(['BasicStaticIpFlow', 'BasicStaticIPFlow']);
        const two = (0, flow_1.flowFileBases)(['BasicStaticIPFlow', 'BasicStaticIpFlow']);
        node_assert_1.default.deepEqual(one, two);
    });
    (0, node_test_1.test)('handles a group of more than two', () => {
        const base = (0, flow_1.flowFileBases)(['BasicABFlow', 'BasicAbFlow', 'BasicaBFlow']);
        const files = Object.values(base).map(f => f.toLowerCase());
        node_assert_1.default.equal(new Set(files).size, 3);
        node_assert_1.default.equal(Object.values(base).filter(f => !f.includes('__')).length, 0);
    });
    (0, node_test_1.test)('the builder writes each member of a colliding group to its own file', async () => {
        const folder = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-flow-case-'));
        try {
            const log = (0, pino_1.default)({ level: 'silent' });
            const warn = (0, utility_1.makeWarner)({ point: 'warning', log });
            const flow = { BasicStaticIpFlow: { name: 'BasicStaticIpFlow' },
                BasicStaticIPFlow: { name: 'BasicStaticIPFlow' } };
            const builder = await (0, flow_1.makeFlowBuilder)({
                apimodel: { main: { kit: { flow } } },
                opts: { folder, outprefix: 'x-' },
                warn,
            });
            await (0, jostraca_1.Jostraca)({ now: () => 1, fs: () => Fs, log }).generate({
                folder, model: {}, existing: { txt: { write: true, merge: false } },
            }, () => (0, jostraca_1.Project)({ folder: '.' }, () => builder()));
            const flowdir = Path.join(folder, 'flow');
            node_assert_1.default.deepEqual(Fs.readdirSync(flowdir).sort(), [
                'x-BasicStaticIPFlow__1.aontu', 'x-BasicStaticIpFlow__2.aontu', 'x-flow-index.aontu',
            ]);
            node_assert_1.default.equal(Fs.readFileSync(Path.join(flowdir, 'x-flow-index.aontu'), 'utf8'), [
                '# Flows\n',
                '@"./x-BasicStaticIPFlow__1.aontu"',
                '@"./x-BasicStaticIpFlow__2.aontu"',
            ].join('\n'));
            node_assert_1.default.ok(Fs.readFileSync(Path.join(flowdir, 'x-BasicStaticIpFlow__2.aontu'), 'utf8')
                .includes('main: kit: flow: BasicStaticIpFlow:'));
            node_assert_1.default.deepEqual(warn.history.map((w) => w.note), [
                'flow name BasicStaticIPFlow collides with another when case is ignored:' +
                    ' file written as BasicStaticIPFlow__1.aontu',
                'flow name BasicStaticIpFlow collides with another when case is ignored:' +
                    ' file written as BasicStaticIpFlow__2.aontu',
            ]);
        }
        finally {
            Fs.rmSync(folder, { recursive: true, force: true });
        }
    });
});
//# sourceMappingURL=flow-file-case.test.js.map