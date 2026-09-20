package apidef

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

func TestAncestorSource(t *testing.T) {
	data, err := os.ReadFile("../ts/test/ancestor-relations.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Entity, Model map[string]any
		Relations     string
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	for _, row := range cases {
		before, _ := json.Marshal(row.Entity)
		model, source := entityAncestorSource(row.Entity)
		if !reflect.DeepEqual(model, row.Model) || source != row.Relations {
			t.Fatalf("ancestor source: model=%#v source=%q", model, source)
		}
		after, _ := json.Marshal(row.Entity)
		if string(before) != string(after) {
			t.Fatal("builder mutated model")
		}
	}
}
