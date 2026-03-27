/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ApiDef creates a new API definition generator with the given options.
func NewApiDef(opts ApiDefOptions) *apiDefInstance {
	if opts.Strategy == "" {
		opts.Strategy = "heuristic01"
	}
	return &apiDefInstance{
		opts: opts,
	}
}

type apiDefInstance struct {
	opts ApiDefOptions
}

// Generate processes an API definition spec and produces the output model.
func (a *apiDefInstance) Generate(spec map[string]any) (*ApiDefResult, error) {
	start := time.Now().UnixMilli()
	steps := make([]string, 0)

	// Build control from spec
	ctrl := map[string]any{
		"step": map[string]any{
			"parse":        true,
			"guide":        true,
			"transformers": true,
			"builders":     true,
			"generate":     true,
		},
	}
	if specCtrl, ok := spec["ctrl"].(map[string]any); ok {
		if stepCtrl, ok := specCtrl["step"].(map[string]any); ok {
			ctrlStep := ctrl["step"].(map[string]any)
			for k, v := range stepCtrl {
				ctrlStep[k] = v
			}
		}
	}

	ctrlStep := ctrl["step"].(map[string]any)

	// Initialize API model
	apimodel := map[string]any{
		"main": map[string]any{
			KIT: map[string]any{
				"info":   map[string]any{},
				"entity": map[string]any{},
				"flow":   map[string]any{},
			},
		},
	}

	// Build spec
	buildSpec := map[string]any{}
	if build, ok := spec["build"].(map[string]any); ok {
		if bs, ok := build["spec"].(map[string]any); ok {
			buildSpec = bs
		}
	}

	// Model
	model := map[string]any{}
	if m, ok := spec["model"].(map[string]any); ok {
		model = m
	}

	// Step: parse
	if parseBool, ok := ctrlStep["parse"].(bool); !ok || !parseBool {
		return &ApiDefResult{OK: true, Steps: steps, Start: start, End: time.Now().UnixMilli(), Ctrl: ctrl}, nil
	}

	defName, _ := model["def"].(string)
	base, _ := buildSpec["base"].(string)
	defpath := filepath.Join(base, "..", "def", defName)

	// Create context
	warn := MakeWarner("warning", nil)
	ctx := &ApiDefContext{
		Spec:     spec,
		Opts:     a.opts,
		DefPath:  filepath.Dir(defpath),
		Model:    model,
		ApiModel: apimodel,
		Guide:    map[string]any{},
		Note:     map[string]any{},
		Warn:     warn,
		Metrics: &Metrics{
			Count: MetricsCount{
				OrigCmpRefs: map[string]int{},
			},
			Found: map[string]any{
				"cmp": map[string]any{},
				"tag": map[string]any{},
			},
		},
		Work: map[string]any{},
	}

	// Load and parse definition
	defsrc, err := LoadFile(defpath)
	if err != nil {
		return makeErrorResult(start, steps, ctrl, ctx, err), err
	}

	def, err := Parse("OpenAPI", defsrc, map[string]string{"file": defpath})
	if err != nil {
		return makeErrorResult(start, steps, ctrl, ctx, err), err
	}

	// Write debug file if debug mode
	if a.opts.Debug != nil {
		fullJSON, _ := json.MarshalIndent(def, "", "  ")
		os.WriteFile(defpath+".full.json", fullJSON, 0644)
	}

	ctx.Def = def
	steps = append(steps, "parse")

	// Step: guide
	if guideBool, ok := ctrlStep["guide"].(bool); !ok || !guideBool {
		return &ApiDefResult{OK: false, Steps: steps, Start: start, End: time.Now().UnixMilli(), Ctrl: ctrl}, nil
	}

	guideModel, err := BuildGuide(ctx)
	if err != nil {
		return makeErrorResult(start, steps, ctrl, ctx, err), err
	}
	if guideModel == nil {
		err := fmt.Errorf("unable to build guide")
		return makeErrorResult(start, steps, ctrl, ctx, err), err
	}

	// Extract the "guide" key from the guide model result (matching TS: ctx.guide = guideModel.guide)
	if g, ok := guideModel["guide"].(map[string]any); ok {
		ctx.Guide = g
	} else {
		ctx.Guide = guideModel
	}
	steps = append(steps, "guide")

	// Step: transformers
	if transBool, ok := ctrlStep["transformers"].(bool); !ok || !transBool {
		return &ApiDefResult{
			OK: true, Steps: steps, Start: start, End: time.Now().UnixMilli(),
			Ctrl: ctrl, Guide: ctx.Guide, ApiModel: ctx.ApiModel,
		}, nil
	}

	transforms := []Transform{
		TopTransform,
		EntityTransform,
		OperationTransform,
		ArgsTransform,
		SelectTransform,
		FieldTransform,
		FlowTransform,
		FlowstepTransform,
		CleanTransform,
	}

	for _, t := range transforms {
		if _, err := t(ctx); err != nil {
			return makeErrorResult(start, steps, ctrl, ctx, err), err
		}
	}
	steps = append(steps, "transformers")

	// Step: builders
	if builderBool, ok := ctrlStep["builders"].(bool); !ok || !builderBool {
		return &ApiDefResult{
			OK: true, Steps: steps, Start: start, End: time.Now().UnixMilli(),
			Ctrl: ctrl, Guide: ctx.Guide, ApiModel: ctx.ApiModel,
		}, nil
	}

	entityBuilder, err := MakeEntityBuilder(ctx)
	if err != nil {
		return makeErrorResult(start, steps, ctrl, ctx, err), err
	}
	flowBuilder, err := MakeFlowBuilder(ctx)
	if err != nil {
		return makeErrorResult(start, steps, ctrl, ctx, err), err
	}
	steps = append(steps, "builders")

	// Step: generate
	if genBool, ok := ctrlStep["generate"].(bool); !ok || !genBool {
		return &ApiDefResult{
			OK: true, Steps: steps, Start: start, End: time.Now().UnixMilli(),
			Ctrl: ctrl, Guide: ctx.Guide, ApiModel: ctx.ApiModel,
		}, nil
	}

	// Run builders to generate output files
	if err := entityBuilder(); err != nil {
		return makeErrorResult(start, steps, ctrl, ctx, err), err
	}
	if err := flowBuilder(); err != nil {
		return makeErrorResult(start, steps, ctrl, ctx, err), err
	}

	// Write warnings if any
	warnings := warn.History()
	if len(warnings) > 0 {
		var warningTexts []string
		for _, w := range warnings {
			warningTexts = append(warningTexts, FormatJSONIC(w))
		}
		WriteFileWarn(warn, "./apidef-warnings.txt",
			strings.Join(warningTexts, "\n\n"))
	}

	steps = append(steps, "generate")

	return &ApiDefResult{
		OK:       true,
		Start:    start,
		End:      time.Now().UnixMilli(),
		Steps:    steps,
		Ctrl:     ctrl,
		Guide:    ctx.Guide,
		ApiModel: ctx.ApiModel,
		Ctx:      ctx,
	}, nil
}

// MakeBuild creates a build function from options.
func MakeBuild(opts ApiDefOptions) func(model, build map[string]any) (*ApiDefResult, error) {
	var apidef *apiDefInstance

	return func(model, build map[string]any) (*ApiDefResult, error) {
		if apidef == nil {
			apidef = NewApiDef(opts)
		}

		ctrl := map[string]any{}
		if ba, ok := build["spec"].(map[string]any); ok {
			if ba2, ok := ba["buildargs"].(map[string]any); ok {
				if ad, ok := ba2["apidef"].(map[string]any); ok {
					if c, ok := ad["ctrl"].(map[string]any); ok {
						ctrl = c
					}
				}
			}
		}

		return apidef.Generate(map[string]any{
			"model": model,
			"build": build,
			"ctrl":  ctrl,
		})
	}
}

func makeErrorResult(start int64, steps []string, ctrl map[string]any, ctx *ApiDefContext, err error) *ApiDefResult {
	return &ApiDefResult{
		OK:    false,
		Err:   err,
		Start: start,
		End:   time.Now().UnixMilli(),
		Steps: steps,
		Ctrl:  ctrl,
		Guide: ctx.Guide,
		ApiModel: ctx.ApiModel,
		Ctx:   ctx,
	}
}
