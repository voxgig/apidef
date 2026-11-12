/* Copyright (c) 2026 Voxgig, MIT License */

package nn

import (
	"encoding/binary"
	"encoding/json"
	"testing"
)

// The embedded file is a safetensors container whose metadata carries the
// guide weights format tag, so the mirror cannot drift into some other file.
func TestGuideWeights(t *testing.T) {
	if len(Guide) < 8 {
		t.Fatalf("guide.safetensors holds %d bytes", len(Guide))
	}
	n := binary.LittleEndian.Uint64(Guide[:8])
	if 8+n > uint64(len(Guide)) {
		t.Fatalf("header length %d exceeds the %d-byte file", n, len(Guide))
	}
	var header map[string]any
	if err := json.Unmarshal(Guide[8:8+n], &header); err != nil {
		t.Fatalf("header: %v", err)
	}
	meta, _ := header["__metadata__"].(map[string]any)
	if meta["format"] != "apidef-guide-nn/1" {
		t.Fatalf("metadata format is %v", meta["format"])
	}
	if _, ok := header["name.hidden.weight"]; !ok {
		t.Fatalf("no name.hidden.weight tensor")
	}
}
