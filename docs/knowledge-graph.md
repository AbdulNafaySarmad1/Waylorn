# Repository knowledge graph

Graphifyy 0.9.64 generated the checked-in [interactive graph](../graphify-out/graph.html), [architecture report](../graphify-out/GRAPH_REPORT.md), and [queryable graph](../graphify-out/graph.json) from the Waylorn source tree. The current graph has 2,225 nodes, 4,878 edges, and 107 communities. The checked-in `manifest.json` supports incremental updates on another checkout.

The scan used `--code-only` and Graphifyy's local AST parser, including its optional SQL parser. It indexed 234 code and project files. Documentation, images, and styles were outside this local-only scan; no LLM extraction or external upload was used. `.graphifyignore` excludes unrelated local assets and secret-bearing development files. Graphifyy also respects `.gitignore`.

Regenerate from the repository root in PowerShell:

```powershell
docker build -t waylorn-graphify:0.9.64 tools/graphify
$repoPath = (Get-Location).Path
docker run --rm --network none --mount "type=bind,source=$repoPath,target=/repo" -w /repo waylorn-graphify:0.9.64 extract . --code-only
docker run --rm --network none --mount "type=bind,source=$repoPath,target=/repo" -w /repo waylorn-graphify:0.9.64 cluster-only . --no-label
```

`graphify-out/` is ignored by default so caches and host-specific state stay local. Commit only `graph.json`, `GRAPH_REPORT.md`, `graph.html`, and `manifest.json` when refreshing the shared graph. Community names remain numbered because no LLM labeling was used. The graph is an aid for navigating dependencies and call relationships; inspect source before treating an inferred edge as an implementation fact.
