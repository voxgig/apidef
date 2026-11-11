/* Copyright (c) 2026 Voxgig, MIT License */

// Package nn embeds the guide networks' weights: the safetensors file the
// TypeScript build reads, so a Go port of the strategy reads the same bytes.
package nn

import _ "embed"

//go:embed guide.safetensors
var Guide []byte
