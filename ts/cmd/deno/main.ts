/* Copyright (c) 2024-2026 Voxgig, MIT License */

// Deno entry point for standalone executable packaging: the same CLI as
// bin/voxgig-apidef, loaded through createRequire because dist/cli.js is
// CommonJS.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

require("../../dist/cli.js").main();
