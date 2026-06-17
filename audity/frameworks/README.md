# Framework Catalogs

Framework catalogs are YAML-managed. Do not add shipped framework content as hardcoded TypeScript data.

Recommended folder layout:

```text
frameworks/catalog/public/
frameworks/catalog/audity-readiness/
frameworks/catalog/yaml-managed/
```

The API scans `frameworks/` recursively, so new `.yaml` or `.yml` files in these folders are picked up by the automatic framework sync.
