"use strict";
/* Copyright (c) 2024-2026 Voxgig, MIT License */
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
exports.main = main;
exports.runCli = runCli;
exports.resolveOptions = resolveOptions;
exports.validateOptions = validateOptions;
exports.defName = defName;
exports.resolveProject = resolveProject;
exports.checkProject = checkProject;
exports.usage = usage;
// The command-line tool. `bin/voxgig-apidef` and the standalone executable
// entry points are shims over `main`, so the option handling and the project
// layout live in one place and under test.
const Fs = __importStar(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_util_1 = require("node:util");
const shape_1 = require("shape");
const apidef_1 = require("./apidef");
const guide_1 = require("./guide/guide");
const Pkg = require('../package.json');
const GUIDE_FILE = 'guide.aontu';
const LEGACY_GUIDE_FILE = 'guide.aon';
const WATCH_INTERVAL_MS = 500;
const CONSOLE_IO = {
    log: (...args) => console.log(...args),
    error: (...args) => console.error(...args),
};
function usage() {
    return [
        'Usage: voxgig-apidef <name> [options]',
        '',
        'Build the API model for project <name> from an OpenAPI, Swagger or',
        'GraphQL definition file.',
        '',
        'Options:',
        '  -f, --folder <dir>    project folder (default: <name>)',
        '  -d, --def <file>      the API definition file (required)',
        '  -p, --prefix <text>   prefix for generated file names (default: <name>-)',
        '  -w, --watch           rebuild when the definition file changes',
        '  -g, --debug <level>   log level (debug, info, warn, error); also writes',
        '                        the resolved definition as <def>.full.json',
        '  -h, --help            print this help and exit',
        '  -v, --version         print the package version and exit',
        '',
        'The model is written to <folder>/model, which must already hold the guide',
        'entry file <folder>/model/guide/<prefix>' + GUIDE_FILE + ':',
        '',
        ...(0, guide_1.guideEntrySource)('<prefix>').map((line) => '  ' + line),
    ].join('\n');
}
function resolveOptions(argv) {
    const args = (0, node_util_1.parseArgs)({
        args: argv,
        allowPositionals: true,
        options: {
            folder: { type: 'string', short: 'f', default: '' },
            def: { type: 'string', short: 'd', default: '' },
            prefix: { type: 'string', short: 'p' },
            watch: { type: 'boolean', short: 'w' },
            debug: { type: 'string', short: 'g' },
            help: { type: 'boolean', short: 'h' },
            version: { type: 'boolean', short: 'v' },
        }
    });
    const [name, ...extra] = args.positionals;
    return {
        name,
        folder: '' === args.values.folder ? name : args.values.folder,
        def: args.values.def,
        prefix: args.values.prefix,
        watch: !!args.values.watch,
        debug: args.values.debug,
        help: !!args.values.help,
        version: !!args.values.version,
        extra,
    };
}
function validateOptions(rawOptions) {
    // An absent prefix defaults to <name>- later, an empty one is a valid
    // choice, an absent debug leaves the library its own default, and `extra`
    // is not an option at all; the shape rejects all four, so they are taken
    // out and checked here. A positional after the name is a typo rather than
    // a spare, and was being dropped without a word.
    const { prefix, debug, extra, ...shaped } = rawOptions;
    if (null != extra && 0 < extra.length) {
        throw new Error('Unexpected extra arguments: ' + extra.join(' ') + '\n\n' + usage());
    }
    const optShape = (0, shape_1.Shape)({
        name: (0, shape_1.Fault)('The first argument should be the project name.', String),
        folder: String,
        def: (0, shape_1.Fault)('A definition file is required: --def <file>.', String),
        watch: Boolean,
        help: Boolean,
        version: Boolean,
    });
    if (null != prefix && 'string' !== typeof prefix) {
        throw new Error('The prefix should be a string.');
    }
    if (null != debug && 'string' !== typeof debug) {
        throw new Error('The debug level should be a string.');
    }
    const err = [];
    const options = optShape(shaped, { err });
    if (err[0]) {
        throw new Error(err[0].text);
    }
    options.prefix = prefix;
    options.debug = debug;
    options.def = node_path_1.default.resolve(options.def);
    const stat = Fs.statSync(options.def, { throwIfNoEntry: false });
    if (null == stat) {
        throw new Error('Definition file not found: ' + options.def);
    }
    return options;
}
// A name still absolute after Path.relative is on another drive, which the
// pipeline's <base>/../def join cannot reach.
function defName(deffolder, def, path = node_path_1.default) {
    const name = path.relative(deffolder, def);
    if (path.isAbsolute(name)) {
        throw new Error('Definition file must be on the same drive as the project folder: ' + def);
    }
    return name;
}
// The pipeline reads the definition at <base>/../def/<model.def> and writes
// under the output folder; both are <root>/model here, so a definition kept
// anywhere is named relative to <root>/def.
function resolveProject(options) {
    const root = node_path_1.default.resolve(options.folder);
    const folder = node_path_1.default.join(root, 'model');
    const outprefix = null == options.prefix ? options.name + '-' : options.prefix;
    const def = node_path_1.default.resolve(options.def);
    const guidefolder = node_path_1.default.join(folder, 'guide');
    return {
        root,
        folder,
        outprefix,
        def,
        model: {
            name: options.name,
            def: defName(node_path_1.default.join(folder, '..', 'def'), def),
        },
        guide: node_path_1.default.join(guidefolder, outprefix + GUIDE_FILE),
        legacyguide: node_path_1.default.join(guidefolder, outprefix + LEGACY_GUIDE_FILE),
    };
}
// A legacy `.aon` guide is accepted here because the guide stage migrates
// it to `.aontu` before reading it.
function checkProject(project) {
    if (Fs.existsSync(project.guide) || Fs.existsSync(project.legacyguide)) {
        return;
    }
    throw new Error('Guide entry file not found: ' + project.guide + '\n' +
        'Create it with these lines:\n' +
        (0, guide_1.guideEntrySource)(project.outprefix).map((line) => '  ' + line).join('\n'));
}
// The closure makeBuild returns memoises the ApiDef instance and its logger,
// so a watch that reuses it rebuilds the model without rebuilding those.
async function makeRunBuild(project, options) {
    const build = await apidef_1.ApiDef.makeBuild({
        folder: project.folder,
        outprefix: project.outprefix,
        debug: options.debug,
    });
    return () => build(project.model, { spec: { base: project.folder } }, {});
}
function report(result, project, io) {
    if (result.ok) {
        const entities = Object.keys(result.apimodel?.main?.kit?.entity || {});
        io.log('voxgig-apidef: ok' +
            '  model: ' + project.folder +
            '  entities: ' + (0 < entities.length ? entities.join(' ') : 'none'));
    }
    else {
        const last = result.steps?.[result.steps.length - 1] || 'start';
        io.error('voxgig-apidef: failed after step ' + last + ': ' +
            (result.err?.message || 'unknown error'));
    }
}
function watchDef(project, rebuild, io) {
    return new Promise(() => {
        let running = false;
        let pending = false;
        const run = async () => {
            if (running) {
                pending = true;
                return;
            }
            running = true;
            try {
                await rebuild();
            }
            finally {
                running = false;
                if (pending) {
                    pending = false;
                    await run();
                }
            }
        };
        Fs.watchFile(project.def, { interval: WATCH_INTERVAL_MS }, () => { run(); });
        io.log('voxgig-apidef: watching ' + project.def);
    });
}
async function runCli(argv, io = CONSOLE_IO) {
    try {
        let options = resolveOptions(argv);
        if (options.version) {
            io.log(Pkg.version);
            return 0;
        }
        if (options.help) {
            io.log(usage());
            return 0;
        }
        options = validateOptions(options);
        const project = resolveProject(options);
        checkProject(project);
        const runBuild = await makeRunBuild(project, options);
        const result = await runBuild();
        report(result, project, io);
        if (options.watch) {
            await watchDef(project, async () => {
                report(await runBuild(), project, io);
            }, io);
        }
        return result.ok ? 0 : 1;
    }
    catch (err) {
        io.error('Voxgig API Definition Error:');
        io.error(err?.message || err);
        return 1;
    }
}
function main() {
    runCli(process.argv.slice(2)).then((code) => {
        process.exitCode = code;
    });
}
//# sourceMappingURL=cli.js.map