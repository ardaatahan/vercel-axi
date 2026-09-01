import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const bin = fileURLToPath(new URL("../bin/vercel-axi.js", import.meta.url));
const mock = fileURLToPath(new URL("./fixtures/vercel-mock.mjs", import.meta.url));
const temporaryDirectories: string[] = [];

interface RunOptions {
  error?: "auth" | "generic" | "secret";
  token?: string;
  input?: string;
}

function run(args: string[] = [], options: RunOptions = {}) {
  const directory = mkdtempSync(join(tmpdir(), "vercel-axi-test-"));
  temporaryDirectories.push(directory);
  const callFile = join(directory, "call.json");
  const stdinFile = join(directory, "stdin.txt");
  const result = spawnSync("node", [bin, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERCEL_AXI_VERCEL_BIN: mock,
      MOCK_VERCEL_CALL_FILE: callFile,
      MOCK_VERCEL_ERROR: options.error,
      MOCK_VERCEL_STDIN_FILE: stdinFile,
      VERCEL_TOKEN: options.token,
    },
    input: options.input,
  });
  let call: string[] | undefined;
  try {
    call = JSON.parse(readFileSync(callFile, "utf8")) as string[];
  } catch {
    call = undefined;
  }
  let stdin: string | undefined;
  try {
    stdin = readFileSync(stdinFile, "utf8");
  } catch {
    stdin = undefined;
  }
  return { ...result, call, stdin };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const successCases: Array<{ name: string; args: string[]; underlying: string[] }> = [
  { name: "deployment list", args: ["deployment", "list", "my-app", "--status", "READY"], underlying: ["list", "my-app", "--status", "READY", "--json"] },
  { name: "deployment inspect", args: ["deployment", "inspect", "dpl_123", "--wait"], underlying: ["inspect", "dpl_123", "--wait", "--json"] },
  { name: "deployment logs", args: ["deployment", "logs", "dpl_123", "--level", "error"], underlying: ["logs", "dpl_123", "--level", "error", "--json"] },
  { name: "deployment deploy preview", args: ["deployment", "deploy", ".", "--project", "my-app"], underlying: ["deploy", ".", "--project", "my-app"] },
  { name: "deployment promote", args: ["deployment", "promote", "dpl_123", "--confirm"], underlying: ["promote", "dpl_123", "--yes"] },
  { name: "deployment rollback", args: ["deployment", "rollback", "dpl_123", "--confirm"], underlying: ["rollback", "dpl_123", "--yes"] },
  { name: "project list", args: ["project", "list", "--filter", "api"], underlying: ["project", "list", "--filter", "api", "--json"] },
  { name: "project create", args: ["project", "create", "my-app"], underlying: ["project", "add", "my-app"] },
  { name: "project link", args: ["project", "link", ".", "--project", "my-app", "--team", "acme"], underlying: ["link", ".", "--project", "my-app", "--yes", "--team", "acme"] },
  { name: "domain list", args: ["domain", "list"], underlying: ["domains", "list", "--json"] },
  { name: "domain inspect", args: ["domain", "inspect", "example.com"], underlying: ["domains", "inspect", "example.com"] },
  { name: "domain add", args: ["domain", "add", "example.com", "my-app", "--confirm"], underlying: ["domains", "add", "example.com", "my-app"] },
  { name: "domain remove", args: ["domain", "remove", "example.com", "--confirm"], underlying: ["domains", "remove", "example.com", "--yes"] },
  { name: "dns list", args: ["dns", "list", "example.com"], underlying: ["dns", "list", "example.com"] },
  { name: "dns inspect", args: ["dns", "inspect", "rec_123"], underlying: ["dns", "inspect", "rec_123"] },
  { name: "dns add", args: ["dns", "add", "example.com", "api", "A", "198.51.100.1", "--confirm"], underlying: ["dns", "add", "example.com", "api", "A", "198.51.100.1"] },
  { name: "dns remove", args: ["dns", "remove", "rec_123", "--confirm"], underlying: ["dns", "remove", "rec_123", "--yes"] },
  { name: "env list", args: ["env", "list", "production", "--project", "my-app"], underlying: ["env", "list", "production", "--project", "my-app", "--json"] },
  { name: "env add", args: ["env", "add", "API_TOKEN", "production", "--value-stdin", "--type", "secret", "--confirm"], underlying: ["env", "add", "API_TOKEN", "production", "--yes", "--type", "secret"] },
  { name: "env remove", args: ["env", "remove", "API_TOKEN", "production", "--confirm"], underlying: ["env", "remove", "API_TOKEN", "production", "--yes"] },
  { name: "team list", args: ["team", "list"], underlying: ["teams", "list", "--json"] },
  { name: "team switch", args: ["team", "switch", "acme"], underlying: ["teams", "switch", "acme"] },
];

describe("official Vercel CLI subprocess boundary", () => {
  for (const testCase of successCases) {
    it(`wraps ${testCase.name}`, () => {
      const result = run(testCase.args, testCase.name === "env add" ? { input: "boundary-secret" } : {});
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toMatch(/^(result|output)/);
      expect(result.call).toEqual([...testCase.underlying, "--no-color", "--non-interactive"]);
    });

    it(`propagates ${testCase.name} failures as structured errors`, () => {
      const result = run(testCase.args, { error: "generic", input: testCase.name === "env add" ? "boundary-secret" : undefined });
      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("error: Error: simulated Vercel failure");
      expect(result.stdout).toContain("suggestion:");
    });
  }

  it("passes scope and cwd through as official global options", () => {
    const result = run(["deployment", "list", "--scope", "acme", "--cwd", "/tmp/app"]);
    expect(result.call).toContain("--scope");
    expect(result.call).toContain("acme");
    expect(result.call).toContain("--cwd");
    expect(result.call).toContain("/tmp/app");
  });

  it("does not put VERCEL_TOKEN into subprocess arguments or output", () => {
    const result = run(["team", "list"], { token: "token-that-must-stay-secret" });
    expect(JSON.stringify(result.call)).not.toContain("token-that-must-stay-secret");
    expect(result.stdout).not.toContain("token-that-must-stay-secret");
  });
});

describe("confirmation gates", () => {
  const gated = [
    ["deployment", "deploy", ".", "--prod"],
    ["deployment", "deploy", ".", "--target", "production"],
    ["deployment", "promote", "dpl_123"],
    ["deployment", "rollback", "dpl_123"],
    ["domain", "add", "example.com"],
    ["domain", "remove", "example.com"],
    ["dns", "add", "example.com", "api", "A", "198.51.100.1"],
    ["dns", "remove", "rec_123"],
    ["env", "add", "API_TOKEN", "production", "--value-stdin"],
    ["env", "remove", "API_TOKEN", "production"],
  ];

  for (const args of gated) {
    it(`refuses ${args.slice(0, 2).join(" ")} without --confirm and describes the change`, () => {
      const result = run(args);
      expect(result.status).toBe(2);
      expect(result.call).toBeUndefined();
      expect(result.stdout).toContain("error: confirmation required");
      expect(result.stdout).toContain("change:");
      expect(result.stdout).toContain("--confirm");
    });
  }

  it("does not require confirmation for preview deployments", () => {
    const result = run(["deployment", "deploy", "."]);
    expect(result.status).toBe(0);
  });

  it("requires explicit non-empty stdin for environment values", () => {
    const missingFlag = run(["env", "add", "API_TOKEN", "production", "--confirm"]);
    expect(missingFlag.status).toBe(2);
    expect(missingFlag.stdout).toContain("--value-stdin");

    const emptyInput = run(["env", "add", "API_TOKEN", "production", "--value-stdin", "--confirm"], { input: "" });
    expect(emptyInput.status).toBe(2);
    expect(emptyInput.stdout).toContain("stdin is empty");
  });

  it("sends environment values over stdin, never subprocess arguments or output", () => {
    const result = run(["env", "add", "API_TOKEN", "production", "--value-stdin", "--confirm"], { input: "boundary-secret" });
    expect(result.status).toBe(0);
    expect(result.stdin).toBe("boundary-secret");
    expect(JSON.stringify(result.call)).not.toContain("boundary-secret");
    expect(result.stdout).not.toContain("boundary-secret");
  });

  it("redacts an environment value even if Vercel echoes it in an error", () => {
    const result = run(["env", "add", "API_TOKEN", "production", "--value-stdin", "--confirm"], { error: "secret", input: "boundary-secret" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[REDACTED]");
    expect(result.stdout).not.toContain("boundary-secret");
  });
});

describe("secrets and JSON", () => {
  it("redacts environment values by default", () => {
    const result = run(["env", "list", "--json"]);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("secret-value");
    expect(result.stdout).not.toContain("top-secret");
    expect(result.stdout).toContain("[REDACTED]");
  });

  it("only allows returned values with the loud flag", () => {
    const result = run(["env", "list", "--json", "--show-secret-values"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("secret-value");
    expect(result.stdout).toContain("top-secret");
  });

  it("passes supported JSON output through", () => {
    const result = run(["project", "list", "--json"]);
    expect(JSON.parse(result.stdout)).toEqual({ items: [{ name: "example", value: "secret-value" }], value: "top-secret" });
  });
});

describe("AXI behavior", () => {
  it("shows a useful no-args home view", () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.call).toBeUndefined();
    expect(result.stdout).toContain("command-groups[");
    expect(result.stdout).toContain("auth:");
  });

  it("provides comprehensive root and group help without subprocess calls", () => {
    for (const args of [["--help"], ...["deployment", "project", "domain", "dns", "env", "team"].map((group) => [group, "--help"])]) {
      const result = run(args);
      expect(result.status).toBe(0);
      expect(result.call).toBeUndefined();
      expect(result.stdout).toContain("commands[");
    }
  });

  it("provides scoped help for every leaf command without subprocess calls", () => {
    const commands = new Set(successCases.map((testCase) => testCase.args.slice(0, 2).join(" ")));
    for (const name of commands) {
      const result = run([...name.split(" "), "--help"]);
      expect(result.status).toBe(0);
      expect(result.call).toBeUndefined();
      expect(result.stdout).toContain(`command: vercel-axi ${name}`);
      expect(result.stdout).toContain("flags[");
      expect(result.stdout).toContain("examples[");
    }
  });

  it("rejects unknown flags with valid alternatives", () => {
    const result = run(["project", "list", "--bogus"]);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("error: unknown flag --bogus");
    expect(result.stdout).toContain("valid flags");
  });

  it("rejects missing arguments", () => {
    const result = run(["deployment", "inspect"]);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("missing required argument");
  });

  it("requires an explicit existing project when linking", () => {
    const result = run(["project", "link"]);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("--project");
  });

  it("provides clear authentication setup", () => {
    const result = run(["project", "list"], { error: "auth" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Vercel authentication required");
    expect(result.stdout).toContain("vercel login");
    expect(result.stdout).toContain("VERCEL_TOKEN");
  });
});
