import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const projects = ["server", "web"];
let hasHighOrCritical = false;

for (const project of projects) {
  const isWindows = process.platform === "win32";
  const command = isWindows ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const args = isWindows
    ? ["/d", "/s", "/c", "npm audit --json"]
    : ["audit", "--json"];
  const result = spawnSync(command, args, {
    cwd: path.join(root, project),
    encoding: "utf8",
  });

  if (result.error) {
    console.error(
      `${project}: unable to run npm audit: ${result.error.message}`,
    );
    hasHighOrCritical = true;
    continue;
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    console.error(
      `${project}: npm audit did not return valid JSON.\n${result.stderr}`,
    );
    hasHighOrCritical = true;
    continue;
  }

  if (report.error) {
    console.error(`${project}: npm audit failed: ${report.error.summary}`);
    hasHighOrCritical = true;
    continue;
  }

  const vulnerabilities = Object.values(report.vulnerabilities ?? {});
  console.log(`${project}: ${vulnerabilities.length} vulnerable package(s)`);

  for (const vulnerability of vulnerabilities) {
    const message = `${project}: ${vulnerability.name} (${vulnerability.severity}), affected ${vulnerability.range}`;
    if (
      vulnerability.severity === "critical" ||
      vulnerability.severity === "high"
    ) {
      console.error(
        `::error title=High or critical dependency advisory::${message}`,
      );
      hasHighOrCritical = true;
    } else if (vulnerability.severity === "moderate") {
      console.warn(`::warning title=Moderate dependency advisory::${message}`);
    } else {
      console.log(message);
    }
  }

  if (result.status !== 0 && vulnerabilities.length === 0) {
    console.error(`${project}: npm audit exited with status ${result.status}`);
    hasHighOrCritical = true;
  }
}

if (hasHighOrCritical) process.exitCode = 1;
