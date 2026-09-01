# vercel-axi

`vercel-axi` is an AXI-compliant CLI that wraps the official first-party Vercel CLI. It keeps Vercel responsible for authentication and operations while adding strict arguments, compact deterministic output, useful next steps, secret redaction, and explicit production safety gates.

- AXI specification: `axi/1.0-2026-07`
- Required Vercel CLI: exactly `59.10.0`
- Node.js: 20 or newer

## Install

Install the official CLI and this wrapper:

```sh
npm install --global vercel@59.10.0
npm install --global vercel-axi
```

For repository development, `vercel@59.10.0` is pinned as a development dependency, so `npm install` provides the exact CLI used by tests and validation.

Confirm the versions:

```sh
vercel --version
vercel-axi --version
```

## Authenticate

Authentication is delegated to the official Vercel CLI. The wrapper never stores or logs tokens.

```sh
vercel login
```

For CI or other non-interactive environments, set `VERCEL_TOKEN` using the environment's secret manager:

```sh
export VERCEL_TOKEN="..."
vercel-axi project list
```

Do not pass a token on the command line. If authentication is missing, `vercel-axi` exits with a structured setup message.

## Output and exit codes

Default output is compact TOON on stdout. Commands whose official Vercel counterpart supports JSON expose `--json`; JSON is passed through after any required secret redaction. Successful commands keep stderr silent.

- `0`: success or no-op
- `1`: authentication, Vercel CLI, or operational failure
- `2`: invalid usage or missing confirmation

Every command group and leaf command supports `--help`:

```sh
vercel-axi --help
vercel-axi deployment --help
vercel-axi deployment list --help
```

Use `--scope <team-or-user>` to select a Vercel scope explicitly and `--cwd <directory>` to run against a particular project directory. These flags are available on operational commands unless the underlying operation does not accept them.

## Safety gates

The wrapper refuses operations that affect production or make sensitive infrastructure changes unless `--confirm` is present. A refusal prints the exact intended change and exits `2` without launching Vercel.

Confirmation is required for:

- production deploys through `--prod` or `--target production`
- deployment promotion and rollback
- domain additions and removals
- DNS additions and removals
- environment variable additions and removals

Preview deployments do not require confirmation. A dry run does not make a change and does not require confirmation, even if a production target is supplied.

Environment variable values are recursively redacted from `env list` output by default. `--show-secret-values` is the explicit loud override. The official CLI normally returns metadata rather than decrypted secret values, but the wrapper still redacts any returned `value`, `secret`, or `decryptedValue` fields unless this flag is present.

For environment variable input, prefer a prompt or piped stdin so the value is not placed in shell history:

```sh
printf '%s' "$VALUE" | vercel-axi env add API_TOKEN production --value-stdin --type secret --confirm
```

## Deployments

### List

```sh
vercel-axi deployment list
vercel-axi deployment list my-app --status READY --limit 20
vercel-axi deployment list --all --environment production --json
```

Supports `--all`, `--environment`, `--status`, `--limit`, `--next`, `--json`, `--scope`, and `--cwd`.

### Inspect

```sh
vercel-axi deployment inspect dpl_123
vercel-axi deployment inspect my-app.vercel.app --wait --timeout 90s --json
vercel-axi deployment inspect dpl_123 --logs
```

### Logs

```sh
vercel-axi deployment logs --project my-app --level error --since 1h
vercel-axi deployment logs dpl_123 --status-code 500 --json
vercel-axi deployment logs --environment production --query "status:500 error"
```

Logs are bounded rather than followed indefinitely. Filters include project, environment, level, time range, limit, status code, query, branch, request ID, source, and expanded messages.

### Deploy

```sh
vercel-axi deployment deploy .
vercel-axi deployment deploy . --project my-app --no-wait --json
vercel-axi deployment deploy . --prod --confirm
vercel-axi deployment deploy . --target production --confirm
vercel-axi deployment deploy . --dry --json
```

Preview is the default. Production requires `--confirm`. Additional flags include `--prebuilt`, `--force`, `--logs`, `--skip-domain`, and `--cwd`.

### Promote and rollback

```sh
vercel-axi deployment promote dpl_123 --confirm
vercel-axi deployment rollback dpl_123 --confirm
vercel-axi deployment promote dpl_123 --timeout 5m --scope my-team --confirm
```

Both operations affect production and always require confirmation.

## Projects

### List

```sh
vercel-axi project list
vercel-axi project list --filter api --limit 50 --json
vercel-axi project list --update-required
```

### Create

```sh
vercel-axi project create my-app
vercel-axi project create my-app --scope my-team
```

### Link

Linking requires an explicit existing project. This avoids an interactive path that could accidentally create a project.

```sh
vercel-axi project link --project my-app
vercel-axi project link ./apps/web --project my-app --team my-team
```

## Domains

```sh
vercel-axi domain list
vercel-axi domain list --limit 50 --json
vercel-axi domain inspect example.com
vercel-axi domain add example.com my-app --confirm
vercel-axi domain add example.com my-app --force --confirm
vercel-axi domain remove example.com --confirm
```

Domain additions and removals always require confirmation. `--force` can move a domain from an existing project and should be used deliberately.

## DNS

```sh
vercel-axi dns list
vercel-axi dns list example.com --limit 100
vercel-axi dns inspect rec_123
vercel-axi dns inspect rec_123 --json
vercel-axi dns add example.com api A 198.51.100.100 --confirm
vercel-axi dns add example.com @ MX mail.example.com 10 --confirm
vercel-axi dns remove rec_123 --confirm
```

Record creation accepts the official Vercel CLI's type-specific positional details. Additions and removals require confirmation.

## Environment variables

### List

```sh
vercel-axi env list
vercel-axi env list production --project my-app
vercel-axi env list preview feature-branch --json
vercel-axi env list --json --show-secret-values
```

Values are redacted unless the loud override is supplied.

### Add

```sh
printf '%s' "$API_TOKEN" | vercel-axi env add API_TOKEN production --value-stdin --type secret --confirm
printf '%s' "$API_URL" | vercel-axi env add API_URL preview,development --value-stdin --type config --confirm
printf '%s' "$API_TOKEN" | vercel-axi env add API_TOKEN preview --value-stdin --git-branch feature-x --force --confirm
```

### Remove

```sh
vercel-axi env remove API_TOKEN production --confirm
vercel-axi env rm API_TOKEN preview feature-x --project my-app --confirm
```

`env rm` is an alias for `env remove`.

## Teams and scopes

```sh
vercel-axi team list
vercel-axi team list --json
vercel-axi team switch my-team
vercel-axi project list --scope my-team
```

Prefer per-command `--scope` for deterministic automation. `team switch` changes the official Vercel CLI's default team for later commands.

## Development and validation

```sh
npm install
npm run build
npm test
npm run lint
npm run skill:gen
npm run skill:check
axi-axi validate "node bin/vercel-axi.js" --dir . --strict --timeout 30000
```

Tests replace the official Vercel executable at the subprocess boundary and cover every wrapper command, Vercel failure propagation, authentication guidance, confirmation refusals, JSON behavior, and secret redaction. Tests never call live Vercel services.

A live smoke test is intentionally left as a follow-up because it requires the captain's Vercel login and an authorized account scope.
