/* Copyright (c) 2024-2025 Voxgig, MIT License */

package model

import "testing"

// The go:embed directive already fails the build if a model file is missing;
// this test additionally asserts the expected files are present and non-empty,
// so downstream Go clients can rely on model.FS / model.Read.
func TestEmbeddedModelFiles(t *testing.T) {
	for _, name := range []string{"apidef.aontu", "guide.aontu"} {
		data, err := Read(name)
		if err != nil {
			t.Fatalf("Read(%q): %v", name, err)
		}
		if len(data) == 0 {
			t.Fatalf("embedded %q is empty", name)
		}
	}
}
