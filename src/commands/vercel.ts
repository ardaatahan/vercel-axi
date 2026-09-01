import type { CommandModule } from "../cli/router.js";
import type { FlagSpec } from "../cli/spec.js";
import type { Parsed } from "../cli/args.js";
import { readFileSync } from "node:fs";
import { UsageError } from "../output/errors.js";
import { emitBlock, emitKV, print } from "../output/toon.js";
import { runVercel } from "../vercel/process.js";

const scopeFlags: FlagSpec[] = [
  { name: "scope", type: "string", description: "Vercel team or user scope" },
  { name: "cwd", type: "string", description: "working directory for the Vercel command" },
];
const jsonFlag: FlagSpec = { name: "json", type: "boolean", description: "emit JSON instead of TOON" };
const confirmFlag: FlagSpec = { name: "confirm", type: "boolean", description: "confirm the described production or destructive change" };

function value(parsed: Parsed, name: string): string | undefined {
  const result = parsed.flags[name];
  return typeof result === "string" ? result : undefined;
}

function enabled(parsed: Parsed, name: string): boolean {
  return parsed.flags[name] === true;
}

function addFlag(args: string[], parsed: Parsed, name: string, target = name): void {
  const current = parsed.flags[name];
  if (current === true) args.push(`--${target}`);
  if (typeof current === "string") args.push(`--${target}`, current);
}

function addScope(args: string[], parsed: Parsed): void {
  addFlag(args, parsed, "scope");
  addFlag(args, parsed, "cwd");
}

function requireConfirm(parsed: Parsed, change: string): void {
  if (!enabled(parsed, "confirm")) {
    throw new UsageError(
      "confirmation required",
      "review the change, then rerun with --confirm",
      [["change", change]],
    );
  }
}

function redact(valueToRedact: unknown): unknown {
  if (Array.isArray(valueToRedact)) return valueToRedact.map(redact);
  if (valueToRedact && typeof valueToRedact === "object") {
    return Object.fromEntries(
      Object.entries(valueToRedact as Record<string, unknown>).map(([key, item]) => [
        key,
        /^(value|secret|decryptedValue)$/i.test(key) ? "[REDACTED]" : redact(item),
      ]),
    );
  }
  return valueToRedact;
}

interface OutputOptions {
  json?: boolean;
  redactSecrets?: boolean;
  next?: string[];
  input?: string;
  secrets?: string[];
}

function emitResult(stdout: string, options: OutputOptions = {}): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = undefined;
  }

  if (parsed !== undefined && options.redactSecrets) parsed = redact(parsed);
  if (options.json) {
    print(parsed === undefined ? stdout : JSON.stringify(parsed));
    return;
  }

  const parts: string[] = [];
  if (parsed !== undefined) {
    parts.push(emitKV([["result", JSON.stringify(parsed)]]));
  } else if (stdout) {
    parts.push(emitBlock("output", stdout.split("\n")));
  } else {
    parts.push("result: success");
  }
  if (options.next?.length) parts.push(emitBlock("next", options.next));
  print(parts.join("\n"));
}

function execute(args: string[], parsed: Parsed, options: OutputOptions = {}): number {
  addScope(args, parsed);
  const result = runVercel(args, options.input, options.secrets);
  emitResult(result.stdout, options);
  return 0;
}

function command(
  spec: CommandModule["spec"],
  run: (parsed: Parsed) => number,
): CommandModule {
  return { spec, run };
}

export const deploymentList = command(
  {
    name: "deployment list",
    summary: "List deployments",
    args: [{ name: "project", required: false, description: "project name" }],
    flags: [jsonFlag, { name: "all", type: "boolean", description: "list deployments across all projects" }, { name: "environment", type: "string", description: "deployment environment" }, { name: "status", type: "string", description: "comma-separated deployment statuses" }, { name: "limit", type: "string", description: "results per page, up to 100" }, { name: "next", type: "string", description: "pagination timestamp in milliseconds" }, ...scopeFlags],
    examples: ["vercel-axi deployment list", "vercel-axi deployment list my-app --status READY --json"],
  },
  (parsed) => {
    const args = ["list", ...parsed.positionals];
    for (const flag of ["all", "environment", "status", "limit", "next"]) addFlag(args, parsed, flag);
    args.push("--json");
    return execute(args, parsed, { json: enabled(parsed, "json"), next: ["vercel-axi deployment inspect <url-or-id>"] });
  },
);

export const deploymentInspect = command(
  {
    name: "deployment inspect",
    summary: "Inspect a deployment",
    args: [{ name: "url-or-id", required: true, description: "deployment URL or ID" }],
    flags: [jsonFlag, { name: "logs", type: "boolean", description: "show build logs" }, { name: "wait", type: "boolean", description: "wait for deployment completion" }, { name: "timeout", type: "string", description: "wait timeout, for example 90s" }, ...scopeFlags],
    examples: ["vercel-axi deployment inspect dpl_123", "vercel-axi deployment inspect example.vercel.app --json"],
  },
  (parsed) => {
    const args = ["inspect", parsed.positionals[0]!];
    for (const flag of ["logs", "wait", "timeout"]) addFlag(args, parsed, flag);
    args.push("--json");
    return execute(args, parsed, { json: enabled(parsed, "json"), next: ["vercel-axi deployment logs " + parsed.positionals[0]!] });
  },
);

export const deploymentLogs = command(
  {
    name: "deployment logs",
    summary: "Read bounded runtime logs",
    args: [{ name: "url-or-id", required: false, description: "deployment URL or ID" }],
    flags: [jsonFlag, { name: "project", type: "string", description: "project name or ID" }, { name: "environment", type: "string", values: ["production", "preview"], description: "deployment environment" }, { name: "level", type: "string", values: ["error", "warning", "info", "fatal"], description: "log level" }, { name: "since", type: "string", description: "start time, for example 1h" }, { name: "until", type: "string", description: "end time" }, { name: "limit", type: "string", description: "maximum results" }, { name: "status-code", type: "string", description: "HTTP status filter" }, { name: "query", type: "string", description: "advanced search query" }, { name: "branch", type: "string", description: "Git branch" }, { name: "request-id", type: "string", description: "request ID" }, { name: "source", type: "string", values: ["serverless", "edge-function", "edge-middleware", "static"], description: "log source" }, { name: "expand", type: "boolean", description: "show full messages" }, ...scopeFlags],
    examples: ["vercel-axi deployment logs --project my-app --level error --since 1h", "vercel-axi deployment logs dpl_123 --json"],
  },
  (parsed) => {
    const args = ["logs", ...parsed.positionals];
    for (const flag of ["project", "environment", "level", "since", "until", "limit", "status-code", "query", "branch", "request-id", "source", "expand"]) addFlag(args, parsed, flag);
    args.push("--json");
    return execute(args, parsed, { json: enabled(parsed, "json") });
  },
);

export const deploymentDeploy = command(
  {
    name: "deployment deploy",
    summary: "Create a preview or confirmed production deployment",
    args: [{ name: "path", required: false, description: "project path" }],
    flags: [{ name: "prod", type: "boolean", description: "deploy to production; requires --confirm" }, { name: "target", type: "string", description: "deployment environment target" }, { name: "project", type: "string", description: "project name or ID" }, { name: "prebuilt", type: "boolean", description: "deploy existing build output" }, { name: "force", type: "boolean", description: "force a new deployment" }, { name: "logs", type: "boolean", description: "print build logs" }, { name: "no-wait", type: "boolean", description: "return before deployment completes" }, { name: "skip-domain", type: "boolean", description: "skip automatic domain promotion" }, { name: "dry", type: "boolean", description: "inspect without deploying" }, jsonFlag, confirmFlag, ...scopeFlags],
    examples: ["vercel-axi deployment deploy .", "vercel-axi deployment deploy . --prod --confirm --json"],
  },
  (parsed) => {
    const production = !enabled(parsed, "dry") && (enabled(parsed, "prod") || value(parsed, "target") === "production");
    if (production) requireConfirm(parsed, `create a production deployment from ${parsed.positionals[0] ?? value(parsed, "cwd") ?? "the current directory"}`);
    const args = ["deploy", ...parsed.positionals];
    for (const flag of ["prod", "target", "project", "prebuilt", "force", "logs", "no-wait", "skip-domain", "dry"]) addFlag(args, parsed, flag);
    if (production) args.push("--yes");
    if (enabled(parsed, "json")) args.push("--json");
    return execute(args, parsed, { json: enabled(parsed, "json"), next: ["vercel-axi deployment inspect <url-or-id>"] });
  },
);

function productionAction(name: "promote" | "rollback", summary: string): CommandModule {
  return command(
    {
      name: `deployment ${name}`,
      summary,
      args: [{ name: "url-or-id", required: true, description: "deployment URL or ID" }],
      flags: [{ name: "timeout", type: "string", description: "completion timeout" }, confirmFlag, ...scopeFlags],
      examples: [`vercel-axi deployment ${name} dpl_123 --confirm`],
    },
    (parsed) => {
      requireConfirm(parsed, `${name} deployment ${parsed.positionals[0]} in the selected production scope`);
      const args = [name, parsed.positionals[0]!, "--yes"];
      addFlag(args, parsed, "timeout");
      return execute(args, parsed, { next: ["vercel-axi deployment inspect " + parsed.positionals[0]!] });
    },
  );
}

export const deploymentPromote = productionAction("promote", "Promote a deployment to production");
export const deploymentRollback = productionAction("rollback", "Roll production back to a deployment");

export const projectList = command(
  {
    name: "project list",
    summary: "List projects",
    flags: [jsonFlag, { name: "filter", type: "string", description: "project name substring" }, { name: "limit", type: "string", description: "results per page, up to 100" }, { name: "next", type: "string", description: "pagination timestamp in milliseconds" }, { name: "update-required", type: "boolean", description: "only projects requiring an update" }, ...scopeFlags],
    examples: ["vercel-axi project list", "vercel-axi project list --filter api --json"],
  },
  (parsed) => {
    const args = ["project", "list"];
    for (const flag of ["filter", "limit", "next", "update-required"]) addFlag(args, parsed, flag);
    args.push("--json");
    return execute(args, parsed, { json: enabled(parsed, "json"), next: ["vercel-axi project link --project <name>"] });
  },
);

export const projectCreate = command(
  {
    name: "project create",
    summary: "Create a project",
    args: [{ name: "name", required: true, description: "project name" }],
    flags: [...scopeFlags],
    examples: ["vercel-axi project create my-app --scope my-team"],
  },
  (parsed) => execute(["project", "add", parsed.positionals[0]!], parsed, { next: [`vercel-axi project link --project ${parsed.positionals[0]}`] }),
);

export const projectLink = command(
  {
    name: "project link",
    summary: "Link a directory to an existing project",
    args: [{ name: "path", required: false, description: "directory to link" }],
    flags: [{ name: "project", type: "string", description: "existing project name or ID (required)" }, { name: "team", type: "string", description: "team ID or slug" }, ...scopeFlags],
    examples: ["vercel-axi project link --project my-app", "vercel-axi project link ./app --project my-app --team my-team"],
  },
  (parsed) => {
    const project = value(parsed, "project");
    if (!project) throw new UsageError("missing required flag --project for 'project link'", "use --project <name-or-id> to avoid creating a project interactively");
    const args = ["link", ...parsed.positionals, "--project", project, "--yes"];
    addFlag(args, parsed, "team");
    return execute(args, parsed);
  },
);

export const domainList = command(
  {
    name: "domain list",
    summary: "List domains",
    flags: [jsonFlag, { name: "limit", type: "string", description: "results per page, up to 100" }, { name: "next", type: "string", description: "pagination timestamp in milliseconds" }, ...scopeFlags],
    examples: ["vercel-axi domain list", "vercel-axi domain list --json"],
  },
  (parsed) => {
    const args = ["domains", "list"];
    for (const flag of ["limit", "next"]) addFlag(args, parsed, flag);
    args.push("--json");
    return execute(args, parsed, { json: enabled(parsed, "json"), next: ["vercel-axi domain inspect <domain>"] });
  },
);

export const domainInspect = command(
  {
    name: "domain inspect",
    summary: "Inspect a domain",
    args: [{ name: "domain", required: true, description: "domain name" }],
    flags: [...scopeFlags],
    examples: ["vercel-axi domain inspect example.com"],
  },
  (parsed) => execute(["domains", "inspect", parsed.positionals[0]!], parsed),
);

function domainMutation(name: "add" | "remove"): CommandModule {
  const add = name === "add";
  return command(
    {
      name: `domain ${name}`,
      summary: `${add ? "Add" : "Remove"} a domain`,
      args: [
        { name: "domain", required: true, description: "domain name" },
        ...(add ? [{ name: "project", required: false, description: "project name" }] : []),
      ],
      flags: [...(add ? [{ name: "force", type: "boolean" as const, description: "move the domain from an existing project" }] : []), confirmFlag, ...scopeFlags],
      examples: [`vercel-axi domain ${name} example.com${add ? " my-app" : ""} --confirm`],
    },
    (parsed) => {
      requireConfirm(parsed, `${name} domain ${parsed.positionals[0]}${parsed.positionals[1] ? ` for project ${parsed.positionals[1]}` : ""}`);
      const args = ["domains", name, ...parsed.positionals];
      if (add) addFlag(args, parsed, "force");
      if (!add) args.push("--yes");
      return execute(args, parsed);
    },
  );
}

export const domainAdd = domainMutation("add");
export const domainRemove = domainMutation("remove");

export const dnsList = command(
  {
    name: "dns list",
    summary: "List DNS records",
    args: [{ name: "domain", required: false, description: "domain name" }],
    flags: [{ name: "limit", type: "string", description: "results per page, up to 100" }, { name: "next", type: "string", description: "pagination timestamp in milliseconds" }, ...scopeFlags],
    examples: ["vercel-axi dns list", "vercel-axi dns list example.com"],
  },
  (parsed) => {
    const args = ["dns", "list", ...parsed.positionals];
    for (const flag of ["limit", "next"]) addFlag(args, parsed, flag);
    return execute(args, parsed, { next: ["vercel-axi dns inspect <record-id>"] });
  },
);

export const dnsInspect = command(
  {
    name: "dns inspect",
    summary: "Inspect a DNS record",
    args: [{ name: "record-id", required: true, description: "DNS record ID" }],
    flags: [jsonFlag, ...scopeFlags],
    examples: ["vercel-axi dns inspect rec_123", "vercel-axi dns inspect rec_123 --json"],
  },
  (parsed) => {
    const args = ["dns", "inspect", parsed.positionals[0]!, "--json"];
    return execute(args, parsed, { json: enabled(parsed, "json") });
  },
);

export const dnsAdd = command(
  {
    name: "dns add",
    summary: "Add a DNS record",
    args: [{ name: "domain", required: true, description: "domain name" }, { name: "details", required: true, variadic: true, description: "record name, type, value, and type-specific fields" }],
    flags: [confirmFlag, ...scopeFlags],
    examples: ["vercel-axi dns add example.com api A 198.51.100.100 --confirm", "vercel-axi dns add example.com @ MX mail.example.com 10 --confirm"],
  },
  (parsed) => {
    requireConfirm(parsed, `add DNS record to ${parsed.positionals[0]}: ${parsed.positionals.slice(1).join(" ")}`);
    return execute(["dns", "add", ...parsed.positionals], parsed);
  },
);

export const dnsRemove = command(
  {
    name: "dns remove",
    summary: "Remove a DNS record",
    args: [{ name: "record-id", required: true, description: "DNS record ID" }],
    flags: [confirmFlag, ...scopeFlags],
    examples: ["vercel-axi dns remove rec_123 --confirm"],
  },
  (parsed) => {
    requireConfirm(parsed, `remove DNS record ${parsed.positionals[0]}`);
    return execute(["dns", "remove", parsed.positionals[0]!, "--yes"], parsed);
  },
);

export const envList = command(
  {
    name: "env list",
    summary: "List environment variables with secret values redacted",
    args: [{ name: "environment", required: false, description: "production, preview, or development" }, { name: "git-branch", required: false, description: "preview Git branch" }],
    flags: [jsonFlag, { name: "show-secret-values", type: "boolean", description: "LOUD: allow values returned by Vercel to be printed" }, { name: "project", type: "string", description: "project name or ID" }, ...scopeFlags],
    examples: ["vercel-axi env list production", "vercel-axi env list --project my-app --json"],
  },
  (parsed) => {
    const args = ["env", "list", ...parsed.positionals];
    addFlag(args, parsed, "project");
    args.push("--json");
    return execute(args, parsed, { json: enabled(parsed, "json"), redactSecrets: !enabled(parsed, "show-secret-values") });
  },
);

export const envAdd = command(
  {
    name: "env add",
    summary: "Add an environment variable using a prompt or piped stdin",
    args: [{ name: "name", required: true, description: "variable name" }, { name: "environment", required: false, description: "one or more comma-separated environments" }],
    flags: [{ name: "value-stdin", type: "boolean", description: "read the value from stdin without exposing it to subprocess arguments" }, { name: "project", type: "string", description: "project name or ID" }, { name: "git-branch", type: "string", description: "preview Git branch" }, { name: "type", type: "string", values: ["config", "secret"], description: "variable storage type" }, { name: "force", type: "boolean", description: "overwrite an existing variable" }, confirmFlag, ...scopeFlags],
    examples: ["printf '%s' \"$VALUE\" | vercel-axi env add API_TOKEN production --value-stdin --type secret --confirm", "printf '%s' \"$URL\" | vercel-axi env add API_URL preview,development --value-stdin --confirm"],
  },
  (parsed) => {
    requireConfirm(parsed, `add environment variable ${parsed.positionals[0]} to ${parsed.positionals[1] ?? "selected environments"}`);
    if (!enabled(parsed, "value-stdin")) {
      throw new UsageError("environment variable value input is required", "pipe the value on stdin and add --value-stdin");
    }
    if (process.stdin.isTTY) {
      throw new UsageError(
        "environment variable value must be piped on stdin",
        "pipe the value, for example: printf '%s' \"$VALUE\" | vercel-axi env add NAME production --value-stdin --confirm",
      );
    }
    const input = readFileSync(0, "utf8");
    if (input.length === 0) {
      throw new UsageError("environment variable value on stdin is empty", "pipe a non-empty value and retry with --value-stdin");
    }
    const args = ["env", "add", ...parsed.positionals, "--yes"];
    for (const flag of ["project", "git-branch", "type", "force"]) addFlag(args, parsed, flag);
    return execute(args, parsed, { input, secrets: [input, input.replace(/[\r\n]+$/, "")] });
  },
);

export const envRemove = command(
  {
    name: "env remove",
    summary: "Remove an environment variable",
    args: [{ name: "name", required: true, description: "variable name" }, { name: "environment", required: false, description: "environment" }, { name: "git-branch", required: false, description: "preview Git branch" }],
    flags: [{ name: "project", type: "string", description: "project name or ID" }, confirmFlag, ...scopeFlags],
    examples: ["vercel-axi env remove API_TOKEN production --confirm"],
  },
  (parsed) => {
    requireConfirm(parsed, `remove environment variable ${parsed.positionals[0]} from ${parsed.positionals[1] ?? "all selected environments"}`);
    const args = ["env", "remove", ...parsed.positionals, "--yes"];
    addFlag(args, parsed, "project");
    return execute(args, parsed);
  },
);

export const teamList = command(
  {
    name: "team list",
    summary: "List teams for the authenticated account",
    flags: [jsonFlag, { name: "limit", type: "string", description: "results per page, up to 100" }, { name: "next", type: "string", description: "pagination timestamp in milliseconds" }, ...scopeFlags],
    examples: ["vercel-axi team list", "vercel-axi team list --json"],
  },
  (parsed) => {
    const args = ["teams", "list"];
    for (const flag of ["limit", "next"]) addFlag(args, parsed, flag);
    args.push("--json");
    return execute(args, parsed, { json: enabled(parsed, "json"), next: ["use --scope <team-slug> on any operation"] });
  },
);

export const teamSwitch = command(
  {
    name: "team switch",
    summary: "Switch the Vercel CLI default team",
    args: [{ name: "team", required: true, description: "team slug" }],
    flags: [{ name: "cwd", type: "string", description: "working directory for the Vercel command" }],
    examples: ["vercel-axi team switch my-team"],
  },
  (parsed) => execute(["teams", "switch", parsed.positionals[0]!], parsed, { next: [`use --scope ${parsed.positionals[0]} on commands for explicit scoping`] }),
);
