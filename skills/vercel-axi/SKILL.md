---
name: vercel-axi
description: "AXI-compliant, agent-ergonomic wrapper for the official Vercel CLI"
---

# vercel-axi

AXI-compliant, agent-ergonomic wrapper for the official Vercel CLI. Built against axi/1.0-2026-07 and Vercel CLI 59.10.0.

```
auth: delegated to official Vercel CLI login or VERCEL_TOKEN
command-groups[6]{group,summary}:
  deployment list|inspect|logs|deploy|promote|rollback,deployment operations
  project list|create|link,project operations
  domain list|inspect|add|remove,domain operations
  dns list|inspect|add|remove,DNS record operations
  env list|add|remove,environment variables; values redacted by default
  team list|switch,team and scope operations
help[3]:
  vercel-axi deployment list
  vercel-axi project list --scope <team>
  vercel-axi --help
```

Run `vercel-axi <group> --help` and `vercel-axi <group> <command> --help` for complete command help.
Production and destructive operations require `--confirm`. Environment variable values are redacted unless `--show-secret-values` is explicitly supplied.
Exit codes: 0 success or no-op, 1 operational error, 2 usage or confirmation error. Structured output is written to stdout.
