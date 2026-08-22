/* Copyright (c) 2024-2025 Voxgig, MIT License */

// Package model embeds the shared aontu model schemas (apidef.aon,
// guide.aon) so the Go module ships them to downstream Go clients that
// unify apidef output.
//
// The canonical copies live at the repository root (../../model); these
// files are mirrors, because a Go module can only embed files under its own
// root. Keep the three copies in sync with `make sync-model` (verified by
// `make check-model`).
package model

import "embed"

// FS holds the embedded aontu model schemas: apidef.aon and guide.aon.
//
//go:embed apidef.aon guide.aon
var FS embed.FS

// Read returns the contents of an embedded model file (e.g. "apidef.aon").
func Read(name string) ([]byte, error) {
	return FS.ReadFile(name)
}
