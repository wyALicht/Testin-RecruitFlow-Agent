import EmbeddedPostgres from "embedded-postgres";
import { access, readFile, unlink } from "node:fs/promises";
import path from "node:path";

const databaseName = "testin_recruitflow_agent";
const databaseDir = ".local-postgres";

const postgres = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "postgres",
  port: 5432,
  persistent: true,
  initdbFlags: ["--locale=C", "--encoding=UTF8"]
});

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const versionFile = path.join(databaseDir, "PG_VERSION");
const pidFile = path.join(databaseDir, "postmaster.pid");

if (!(await fileExists(versionFile))) {
  await postgres.initialise();
} else if (await fileExists(pidFile)) {
  const pid = Number((await readFile(pidFile, "utf8")).split(/\r?\n/, 1)[0]);
  if (!Number.isInteger(pid) || !isProcessRunning(pid)) {
    await unlink(pidFile);
    console.log("Removed stale PostgreSQL PID file.");
  }
}

await postgres.start();

const client = postgres.getPgClient();
await client.connect();
const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
await client.end();

if (!existing.rowCount) {
  await postgres.createDatabase(databaseName);
}

console.log(`Local PostgreSQL is ready on localhost:5432 (${databaseName}).`);

async function shutdown() {
  await postgres.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await new Promise(() => {});
