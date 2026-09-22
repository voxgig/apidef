/* Copyright (c) 2024-2025 Voxgig, MIT License */

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
