#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

if (process.env.MOCK_VERCEL_CALL_FILE) {
  writeFileSync(process.env.MOCK_VERCEL_CALL_FILE, JSON.stringify(process.argv.slice(2)));
}
const stdin = process.env.MOCK_VERCEL_STDIN_FILE ? readFileSync(0, "utf8") : "";
if (process.env.MOCK_VERCEL_STDIN_FILE) writeFileSync(process.env.MOCK_VERCEL_STDIN_FILE, stdin);

if (process.env.MOCK_VERCEL_ERROR === "auth") {
  process.stderr.write("Error: Not authenticated. Please log in.\n");
  process.exit(1);
}
if (process.env.MOCK_VERCEL_ERROR === "generic") {
  process.stderr.write("Error: simulated Vercel failure\n");
  process.exit(1);
}
if (process.env.MOCK_VERCEL_ERROR === "secret") {
  process.stderr.write(`Error: rejected value ${stdin}\n`);
  process.exit(1);
}

if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify({ items: [{ name: "example", value: "secret-value" }], value: "top-secret" }) + "\n");
} else {
  process.stdout.write("Mock Vercel success\n");
}
