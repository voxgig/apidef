/* Copyright (c) 2024-2025 Voxgig, MIT License */

// Package model embeds the shared aontu model schemas (apidef.aontu,
// guide.aontu) so the Go module ships them to downstream Go clients that
// unify apidef output.
//
// The canonical copies live at the repository root (../../model); these
// files are mirrors, because a Go module can only embed files under its own
// root. Keep the three copies in sync with `make sync-model` (verified by
// `make check-model`).
package model

import "embed"

// FS holds the embedded aontu model schemas: apidef.aontu and guide.aontu.
//
//go:embed apidef.aontu guide.aontu
var FS embed.FS

// Read returns the contents of an embedded model file (e.g. "apidef.aontu").
func Read(name string) ([]byte, error) {
	return FS.ReadFile(name)
}
