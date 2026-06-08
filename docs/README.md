# `@voxgig/apidef` documentation

`@voxgig/apidef` reads an OpenAPI (or Swagger 2.0) specification and produces
an **internal API model** — a normalized description of the *entities*,
*operations*, *fields*, and *flows* implied by the spec. Downstream tooling
(notably `sdkgen`) turns that model into client SDKs.

In short: **OpenAPI in → structured API model out**, with sensible naming and
CRUD classification applied automatically.

The documentation is organized into four kinds of material. Start with the
one that matches what you need right now:

### 📘 [Tutorial](./tutorial/getting-started.md) — *learning by doing*
A guided walk-through. Install the package, generate a model from a worked
example, and look at what comes out. Start here if you are new.

- [Getting started](./tutorial/getting-started.md)

### 🔧 How-to guides — *getting a specific job done*
Goal-oriented recipes that assume you already know the basics.

- [Use apidef as a library](./how-to/use-as-a-library.md)
- [Use the command-line tool](./how-to/use-the-cli.md)
- [Customize entity naming (plurals)](./how-to/customize-entity-naming.md)
- [Run only part of the pipeline](./how-to/control-the-pipeline.md)
- [Debug a build](./how-to/debug-a-build.md)
- [Work on the codebase](./how-to/work-on-the-codebase.md)

### 📑 Reference — *the precise details*
Dry, complete descriptions of every interface and data shape.

- [Programmatic API](./reference/api.md)
- [CLI](./reference/cli.md)
- [Configuration & inputs](./reference/configuration.md)
- [The internal API model](./reference/model.md)
- [The guide model](./reference/guide.md)
- [Pipeline stages](./reference/pipeline.md)

### 💡 Explanation — *the ideas behind it*
Background and rationale. Read these to understand *why* apidef works the way
it does.

- [Architecture overview](./explanation/architecture.md)
- [How path classification works](./explanation/classification-heuristics.md)
- [The internal model, and why it exists](./explanation/the-internal-model.md)
- [The canonical TypeScript build and the Go parity port](./explanation/canonical-and-parity.md)

---

For repository conventions and the development workflow, see
[`AGENTS.md`](../AGENTS.md) and [`CLAUDE.md`](../CLAUDE.md) at the repository
root.
