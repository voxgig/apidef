/* Copyright (c) 2024-2025 Voxgig, MIT License */

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
