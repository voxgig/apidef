// Bun-compatible entry point for standalone executable packaging: a plain
// `.js` file Bun's bundler can resolve, over the same CLI as bin/voxgig-apidef.

require('../../dist/cli.js').main()
