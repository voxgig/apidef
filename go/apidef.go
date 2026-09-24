/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	jostraca "github.com/jostraca/jostraca/go"
)

const VERSION = "0.11.0"

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
			for _, k := range sortedKeys(stepCtrl) {
				ctrlStep[k] = stepCtrl[k]
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

	SetCustomPlurals(modelCustomPlurals(model))
	defer ClearCustomPlurals()

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

	fail := func(err error) (*ApiDefResult, error) {
		warn.Warn(map[string]any{
			"err":  err.Error(),
			"note": "!! BUILD FAILED !! " + err.Error(),
		})
		WriteFileWarn(warn, "./apidef-warnings.txt", warningsFileText(warn.History()))
		return makeErrorResult(start, steps, ctrl, ctx, err), err
	}

	// Load and parse definition
	defsrc, err := LoadFile(defpath)
	if err != nil {
		return fail(err)
	}

	def, err := Parse("OpenAPI", defsrc, map[string]string{"file": defpath})
	if err != nil {
		return fail(err)
	}

	// Write debug file if debug mode
	if a.opts.Debug != nil {
		fullJSON, _ := json.MarshalIndent(def, "", "  ")
		os.WriteFile(defpath+".full.json", fullJSON, 0644)
	}

	ctx.Def = def
	buildctx, _ := spec["buildctx"].(map[string]any)
	config, _ := spec["config"].(map[string]any)
	kind, _ := config["kind"].(string)
	if kind == "" {
		kind = "openapi3"
	}
	ctx.Resolved = PublishResolved(buildctx, kind, def, func() map[string]any { return ctx.Guide })
	steps = append(steps, "parse")

	// Step: guide
	if guideBool, ok := ctrlStep["guide"].(bool); !ok || !guideBool {
		return &ApiDefResult{OK: false, Steps: steps, Start: start, End: time.Now().UnixMilli(), Ctrl: ctrl, Ctx: ctx}, nil
	}

	guideModel, err := BuildGuide(ctx)
	if err != nil {
		return fail(err)
	}
	if guideModel == nil {
		return fail(fmt.Errorf("unable to build guide"))
	}

	ctx.Guide, _ = guideModel["guide"].(map[string]any)
	steps = append(steps, "guide")

	// Step: transformers
	if transBool, ok := ctrlStep["transformers"].(bool); !ok || !transBool {
		return &ApiDefResult{
			OK: true, Steps: steps, Start: start, End: time.Now().UnixMilli(),
			Ctrl: ctrl, Guide: ctx.Guide, ApiModel: ctx.ApiModel, Ctx: ctx,
		}, nil
	}

	transforms := []Transform{
		TopTransform,
		EntityTransform,
		OperationTransform,
		ContractTransform,
		ArgsTransform,
		SelectTransform,
		FieldTransform,
		FlowTransform,
		FlowstepTransform,
		CleanTransform,
	}

	for _, t := range transforms {
		if _, err := t(ctx); err != nil {
			return fail(err)
		}
	}
	steps = append(steps, "transformers")

	// Step: builders
	if builderBool, ok := ctrlStep["builders"].(bool); !ok || !builderBool {
		return &ApiDefResult{
			OK: true, Steps: steps, Start: start, End: time.Now().UnixMilli(),
			Ctrl: ctrl, Guide: ctx.Guide, ApiModel: ctx.ApiModel, Ctx: ctx,
		}, nil
	}

	entityBuilder, err := MakeEntityBuilder(ctx)
	if err != nil {
		return fail(err)
	}
	flowBuilder, err := MakeFlowBuilder(ctx)
	if err != nil {
		return fail(err)
	}
	steps = append(steps, "builders")

	// Step: generate
	if genBool, ok := ctrlStep["generate"].(bool); !ok || !genBool {
		return &ApiDefResult{
			OK: true, Steps: steps, Start: start, End: time.Now().UnixMilli(),
			Ctrl: ctrl, Guide: ctx.Guide, ApiModel: ctx.ApiModel, Ctx: ctx,
		}, nil
	}

	builders := []Builder{entityBuilder, flowBuilder}

	jopts := []jostraca.Option{jostraca.WithLog(jostracaLog{ctx.Log})}
	if now, ok := spec["now"].(func() int64); ok {
		jopts = append(jopts, jostraca.WithNow(now))
	}
	write, merge := true, false

	jres, err := jostraca.New(jopts...).Generate(jostraca.Options{
		Folder: a.opts.Folder,
		Model:  map[string]any{},
		Existing: jostraca.Existing{
			Txt: jostraca.ExistingTxt{Write: &write, Merge: &merge},
		},
	}, func(j *jostraca.J) {
		j.Project(jostraca.ProjectProps{Folder: "."}, func(j *jostraca.J) {
			for _, builder := range builders {
				builder(j)
			}
		})
	})
	if err != nil {
		return fail(err)
	}

	steps = append(steps, "generate")

	kitEntity, _ := getKit(ctx)["entity"].(map[string]any)
	GcEntityFiles(ctx.Log, a.opts.Folder, a.opts.OutPrefix, sortedKeys(kitEntity))

	if warnings := warn.History(); len(warnings) > 0 {
		WriteFileWarn(warn, "./apidef-warnings.txt", warningsFileText(warnings))
	}

	return &ApiDefResult{
		OK:       true,
		Reload:   len(jres.Files.Written) > 0 || len(jres.Files.Merged) > 0,
		Start:    start,
		End:      time.Now().UnixMilli(),
		Steps:    steps,
		Ctrl:     ctrl,
		Guide:    ctx.Guide,
		ApiModel: ctx.ApiModel,
		Ctx:      ctx,
		Jres:     &jres,
	}, nil
}

func warningsFileText(history []map[string]any) string {
	texts := make([]string, 0, len(history))
	for _, w := range history {
		texts = append(texts, FormatJSONIC(w))
	}
	return strings.Join(texts, "\n\n")
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
			"model":    model,
			"build":    build,
			"buildctx": build,
			"ctrl":     ctrl,
		})
	}
}

func modelCustomPlurals(model map[string]any) any {
	main, _ := model["main"].(map[string]any)
	custom, _ := main["custom"].(map[string]any)
	if custom == nil {
		return nil
	}
	return custom["plurals"]
}

func makeErrorResult(start int64, steps []string, ctrl map[string]any, ctx *ApiDefContext, err error) *ApiDefResult {
	return &ApiDefResult{
		OK:       false,
		Err:      err,
		Start:    start,
		End:      time.Now().UnixMilli(),
		Steps:    steps,
		Ctrl:     ctrl,
		Guide:    ctx.Guide,
		ApiModel: ctx.ApiModel,
		Ctx:      ctx,
	}
}

// jostracaLog hands jostraca's replayed warnings to apidef's logger, as the
// TS port passes its own. Without one they are dropped: jostraca's default
// would print them to stdout.
type jostracaLog struct{ log Logger }

func (l jostracaLog) Trace(args ...any) { l.forward(Logger.Debug, args) }
func (l jostracaLog) Debug(args ...any) { l.forward(Logger.Debug, args) }
func (l jostracaLog) Info(args ...any)  { l.forward(Logger.Info, args) }
func (l jostracaLog) Warn(args ...any)  { l.forward(Logger.Warn, args) }
func (l jostracaLog) Error(args ...any) { l.forward(Logger.Error, args) }
func (l jostracaLog) Fatal(args ...any) { l.forward(Logger.Error, args) }

func (l jostracaLog) forward(level func(Logger, ...any), args []any) {
	if l.log != nil {
		level(l.log, args...)
	}
}
