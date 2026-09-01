import { homedir } from "node:os";
import { emitList } from "../output/toon.js";
import { helpBlock } from "../output/suggest.js";

export const DESCRIPTION = "AXI-compliant, agent-ergonomic wrapper for the official Vercel CLI";
export const SPEC_VERSION = "axi/1.0-2026-07";

const COMMANDS = [
  ["deployment list|inspect|logs|deploy|promote|rollback", "deployment operations"],
  ["project list|create|link", "project operations"],
  ["domain list|inspect|add|remove", "domain operations"],
  ["dns list|inspect|add|remove", "DNS record operations"],
  ["env list|add|remove", "environment variables; values redacted by default"],
  ["team list|switch", "team and scope operations"],
] as const;

export function collapseHome(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? "~" + path.slice(home.length) : path;
}

export function homeBody(tool: string, auth = process.env.VERCEL_TOKEN
  ? "VERCEL_TOKEN present (value hidden)"
  : "delegated to official Vercel CLI login"): string {
  const groups = emitList(
    "command-groups",
    COMMANDS.map(([group, summary]) => ({ group, summary })),
    ["group", "summary"],
  );
  return [
    `auth: ${auth}`,
    groups,
    helpBlock([
      `${tool} deployment list`,
      `${tool} project list --scope <team>`,
      `${tool} --help`,
    ]),
  ].join("\n");
}

export function renderHome(binPath: string): string {
  const header = `vercel-axi: ${collapseHome(binPath)} - ${DESCRIPTION}`;
  return [header, homeBody("vercel-axi")].join("\n");
}

export function rootHelpText(): string {
  const commands = emitList(
    "commands",
    COMMANDS.map(([command, summary]) => ({ command, summary })),
    ["command", "summary"],
  );
  const flags = emitList(
    "flags",
    [
      { flag: "--help", default: "", description: "show help for any command or command group" },
      { flag: "--version", default: "", description: "print wrapper, Vercel CLI, and AXI versions" },
    ],
    ["flag", "default", "description"],
  );
  return [
    `vercel-axi: ${DESCRIPTION}`,
    `spec: ${SPEC_VERSION}`,
    "vercel-cli: 59.10.0",
    commands,
    flags,
    "examples[3]:",
    "  vercel-axi deployment list --json",
    "  vercel-axi env list production --scope my-team",
    "  vercel-axi deployment deploy . --prod --confirm",
  ].join("\n");
}

export function renderSkill(): string {
  const frontmatter = [
    "---",
    "name: vercel-axi",
    `description: "${DESCRIPTION}"`,
    "---",
  ].join("\n");
  const body = [
    "# vercel-axi",
    "",
    `${DESCRIPTION}. Built against ${SPEC_VERSION} and Vercel CLI 59.10.0.`,
    "",
    "```",
    homeBody("vercel-axi", "delegated to official Vercel CLI login or VERCEL_TOKEN"),
    "```",
    "",
    "Run `vercel-axi <group> --help` and `vercel-axi <group> <command> --help` for complete command help.",
    "Production and destructive operations require `--confirm`. Environment variable values are redacted unless `--show-secret-values` is explicitly supplied.",
    "Exit codes: 0 success or no-op, 1 operational error, 2 usage or confirmation error. Structured output is written to stdout.",
  ].join("\n");
  return [frontmatter, "", body, ""].join("\n");
}
