import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { AxiError } from "../output/errors.js";

const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const AUTH_ERROR = /(not authenticated|not logged in|vercel login|token is not valid|invalid token|unauthorized)/i;

export interface VercelResult {
  stdout: string;
  stderr: string;
}

function localVercel(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidate = resolve(here, "../../node_modules/.bin/vercel");
  return existsSync(candidate) ? candidate : undefined;
}

function executable(): string {
  return process.env.VERCEL_AXI_VERCEL_BIN || localVercel() || "vercel";
}

export function stripAnsi(value: string): string {
  return value.replace(ANSI, "").replace(/\r/g, "").trim();
}

function hideSecrets(value: string, secrets: string[]): string {
  let result = value;
  for (const secret of secrets) {
    if (secret) result = result.split(secret).join("[REDACTED]");
  }
  return result;
}

export function runVercel(args: string[], input?: string, secrets: string[] = []): VercelResult {
  const result = spawnSync(executable(), [...args, "--no-color", "--non-interactive"], {
    encoding: "utf8",
    env: process.env,
    input,
    stdio: [input === undefined ? "inherit" : "pipe", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) {
    const missing = (result.error as NodeJS.ErrnoException).code === "ENOENT";
    throw new AxiError(
      missing ? "official Vercel CLI not found" : `could not run official Vercel CLI: ${result.error.message}`,
      "install Vercel CLI 59.10.0 with 'npm install --global vercel@59.10.0'",
    );
  }

  const stdout = hideSecrets(stripAnsi(result.stdout || ""), secrets);
  const stderr = hideSecrets(stripAnsi(result.stderr || ""), secrets);
  if (result.status !== 0) {
    const combined = [stderr, stdout].filter(Boolean).join(" ");
    if (AUTH_ERROR.test(combined)) {
      throw new AxiError(
        "Vercel authentication required",
        "run 'vercel login' or set VERCEL_TOKEN, then retry; tokens are never stored or logged by vercel-axi",
      );
    }
    throw new AxiError(
      combined || `Vercel CLI exited with status ${result.status ?? "unknown"}`,
      "run the same command with --help to verify its arguments",
    );
  }
  return { stdout, stderr };
}
