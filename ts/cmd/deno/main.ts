/* Copyright (c) 2024-2025 Voxgig, MIT License */

// Deno standalone executable for voxgig-apidef.
// Build with: deno compile --allow-read --allow-write --allow-env --allow-net --output voxgig-apidef main.ts
// Or use: deno task compile

import * as path from "@std/path";
import { parseArgs } from "@std/cli/parse-args";

import { Shape, Fault, One } from "npm:shape@^10.0.0";

// Import the apidef library via npm specifier.
import { ApiDef } from "npm:@voxgig/apidef@^3.3.1";

const VERSION = "3.3.1";

run();

async function run() {
  try {
    let options = resolveOptions();

    if (options.version) {
      version();
    }

    if (options.help) {
      help();
    }

    if (options.version || options.help) {
      Deno.exit(0);
    }

    options = validateOptions(options);

    await generate(options);
  } catch (err) {
    handleError(err);
  }
}

function exit(err?: Error) {
  let code = 0;
  if (err) {
    code = 1;
  }
  Deno.exit(code);
}

async function generate(options: {
  folder: string;
  def: string;
  watch: boolean;
  debug: string;
  name: string;
}) {
  const apidef = new (ApiDef as any)({
    debug: options.debug,
  });

  const spec = {
    def: options.def,
    kind: "openapi-3",
    model: path.join(options.folder, "model/api.jsonic"),
    meta: { name: options.name },
  };

  if (options.watch) {
    await apidef.watch(spec);
  } else {
    await apidef.generate(spec);
  }
}

function resolveOptions() {
  const args = parseArgs(Deno.args, {
    string: ["folder", "def", "debug"],
    boolean: ["watch", "help", "version"],
    alias: {
      f: "folder",
      d: "def",
      w: "watch",
      g: "debug",
      h: "help",
      v: "version",
    },
    default: {
      folder: "",
      def: "",
      debug: "info",
    },
  });

  const options = {
    name: args._[0] as string,
    folder: "" === args.folder ? (args._[0] as string) : args.folder,
    def: args.def,
    watch: !!args.watch,
    debug: args.debug,
    help: !!args.help,
    version: !!args.version,
  };

  return options;
}

function validateOptions(rawOptions: Record<string, unknown>) {
  const optShape = Shape({
    name: Fault("The first argument should be the project name.", String),
    folder: String,
    def: "",
    watch: Boolean,
    debug: One(String, Boolean),
    help: Boolean,
    version: Boolean,
  });

  const err: any[] = [];
  const options = optShape(rawOptions, { err });

  if (err[0]) {
    throw new Error(err[0].text);
  }

  if ("" !== options.def) {
    options.def = path.resolve(options.def);
    try {
      Deno.statSync(options.def);
    } catch {
      throw new Error("Definition file not found: " + options.def);
    }
  }

  return options;
}

function handleError(err: unknown) {
  console.log("Voxgig API Definition Error:");
  console.log(err);
  exit(err instanceof Error ? err : new Error(String(err)));
}

function version() {
  console.log(VERSION);
}

function help() {
  console.log(`voxgig-apidef ${VERSION}

Usage: voxgig-apidef [options] <project-name>

Options:
  -f, --folder <path>   Project folder path (default: project-name)
  -d, --def <path>      Definition file path
  -w, --watch           Watch mode for file changes
  -g, --debug <level>   Debug logging level (default: info)
  -h, --help            Show this help message
  -v, --version         Show version number`);
}
