"use strict";
/* Copyright (c) 2026 Voxgig Ltd, MIT License */
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
// Every route of every OpenAPI test definition, as the shared table
// test/def-routes.tsv records it. The Go suite reads the same table.
// Running make def-routes rewrites it from this port.
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const util_1 = require("@voxgig/util");
const apidef_1 = require("../dist/apidef");
const utility_1 = require("../dist/utility");
const DEFDIR = Path.join(__dirname, '..', 'test', 'def');
const TABLE = Path.join(__dirname, '..', '..', 'test', 'def-routes.tsv');
const COLUMNS = ['def', 'route', 'entity', 'active', 'op', 'actions', 'renames', 'transform',
    'nearmiss'];
const UPDATE = '1' === process.env.UPDATE_DEF_ROUTES;
const SILENT = (0, util_1.Pino)({ level: 'silent' });
const staged = [];
const written = {};
function definitions() {
    return Fs.readdirSync(DEFDIR)
        .filter((name) => /\.(json|ya?ml)$/.test(name) && !name.includes('.graphql.'))
        .sort();
}
function readTable() {
    const table = {};
    if (!Fs.existsSync(TABLE)) {
        return table;
    }
    const lines = Fs.readFileSync(TABLE, 'utf8').split('\n').filter((line) => '' !== line);
    for (const line of lines.slice(1)) {
        const cols = line.split('\t');
        table[cols[0]] = table[cols[0]] ?? {};
        table[cols[0]][cols[1]] = cols.slice(2).join('\t');
    }
    return table;
}
function canonical(val) {
    if (Array.isArray(val)) {
        return val.map(canonical);
    }
    if (null == val || 'object' !== typeof val) {
        return val;
    }
    const out = {};
    for (const key of Object.keys(val).sort()) {
        if (null != val[key]) {
            out[key] = canonical(val[key]);
        }
    }
    return out;
}
async function routes(def) {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-def-routes-'));
    staged.push(dir);
    const folder = Path.join(dir, 'model');
    Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true });
    Fs.mkdirSync(Path.join(dir, 'def'));
    Fs.copyFileSync(Path.join(DEFDIR, def), Path.join(dir, 'def', def));
    Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'), '@"@voxgig/apidef/model/guide.aontu"\n@"./base-guide.aontu"\n');
    const build = await apidef_1.ApiDef.makeBuild({ folder, strategy: 'heuristic01' });
    const bres = await build({ name: 'routes', def }, {
        log: SILENT,
        spec: {
            base: folder,
            buildargs: {
                apidef: {
                    ctrl: {
                        step: {
                            parse: true, guide: true, transformers: false, builders: false, generate: false,
                        }
                    }
                }
            }
        }
    }, {});
    node_assert_1.default.strictEqual(bres.ok, true, def + ': ' + String(bres.err?.message));
    const near = {};
    for (const miss of bres.ctx.nearmiss ?? []) {
        near[miss.route] = [String(miss.margin), miss.support.join('+'),
            miss.alternatives.map((alt) => alt.name + '<' + alt.sources.join('+')).join(' ')].join('/');
    }
    const rows = [];
    for (const [ename, ent] of Object.entries(bres.guide.entity ?? {})) {
        for (const [path, gp] of Object.entries(ent.path ?? {})) {
            const actions = Object.keys((0, utility_1.activeActions)(gp.action)).sort().join(',');
            const renames = Object.entries(gp.rename?.param ?? {})
                .map(([from, to]) => from + '->' + (to?.target ?? to))
                .sort().join(',');
            for (const [opname, op] of Object.entries(gp.op ?? {})) {
                const transform = canonical(op.transform ?? {});
                rows.push([def, op.method + ' ' + path, ename, false === ent.active ? 'false' : 'true',
                    opname, actions, renames, 0 === Object.keys(transform).length ? '' : JSON.stringify(transform),
                    near[op.method + ' ' + path] ?? '']);
            }
        }
    }
    return rows.sort((a, b) => a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
}
(0, node_test_1.describe)('def-routes', () => {
    const table = readTable();
    (0, node_test_1.after)(() => {
        for (const dir of staged) {
            Fs.rmSync(dir, { recursive: true, force: true });
        }
        if (UPDATE) {
            const lines = [COLUMNS.join('\t')];
            for (const def of Object.keys(written).sort()) {
                lines.push(...written[def].map((row) => row.join('\t')));
            }
            Fs.writeFileSync(TABLE, lines.join('\n') + '\n');
        }
    });
    (0, node_test_1.test)('the table names only test definitions', { skip: UPDATE }, () => {
        const extra = Object.keys(table).filter((def) => !definitions().includes(def));
        node_assert_1.default.deepStrictEqual(extra, [], 'rows for definitions that are gone: make def-routes');
    });
    for (const def of definitions()) {
        (0, node_test_1.test)(def, async () => {
            const rows = await routes(def);
            if (UPDATE) {
                written[def] = rows;
                return;
            }
            const got = Object.fromEntries(rows.map((row) => [row[1], row.slice(2).join('\t')]));
            node_assert_1.default.deepStrictEqual(got, table[def] ?? {}, def + ' reads differently from test/def-routes.tsv; if the change is meant,' +
                ' run make def-routes and make the Go port read it the same');
        });
    }
});
//# sourceMappingURL=def-routes.test.js.map