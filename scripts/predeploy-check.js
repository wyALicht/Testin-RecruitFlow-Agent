const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const envExample = exists(".env.example") ? read(".env.example") : "";
const usesPostgres = envExample.includes('DATABASE_URL="postgresql://');

const checks = [];

checks.push({
  title: "Git repository",
  status: exists(".git") ? "pass" : "warn",
  detail: exists(".git")
    ? "Git repository already initialized."
    : "No .git directory found. Run `git init` before connecting GitHub."
});

checks.push({
  title: "Environment template",
  status: envExample.includes("AUTH_SECRET=") && usesPostgres ? "pass" : "warn",
  detail:
    envExample.includes("AUTH_SECRET=") && usesPostgres
      ? ".env.example already contains AUTH_SECRET and a Postgres DATABASE_URL template."
      : ".env.example should include AUTH_SECRET and a Postgres DATABASE_URL template."
});

checks.push({
  title: "Prisma schema",
  status: exists("prisma/schema.prisma") && read("prisma/schema.prisma").includes('provider = "postgresql"')
    ? "pass"
    : "warn",
  detail:
    exists("prisma/schema.prisma") && read("prisma/schema.prisma").includes('provider = "postgresql"')
      ? "Prisma datasource is configured for PostgreSQL."
      : 'Prisma datasource is not yet set to `postgresql`.'
});

checks.push({
  title: "Seed source",
  status: exists("prisma/seed.js") ? "pass" : "warn",
  detail: exists("prisma/seed.js")
    ? "A Prisma seed script is available for importing candidate and auth data."
    : "Missing prisma/seed.js seed script."
});

checks.push({
  title: "Build readiness",
  status: "pass",
  detail:
    "For populated databases, prefer `npx prisma migrate deploy` instead of `prisma migrate dev`, then run `npm run db:seed`, `npm run admin:bootstrap`, and `npm run build`."
});

const summary = {
  pass: checks.filter((item) => item.status === "pass").length,
  warn: checks.filter((item) => item.status === "warn").length,
  blocker: checks.filter((item) => item.status === "blocker").length
};

console.log("Predeploy Check");
console.log("===============");
for (const item of checks) {
  console.log(`[${item.status.toUpperCase()}] ${item.title}`);
  console.log(`  ${item.detail}`);
}
console.log("");
console.log(
  `Summary: ${summary.pass} pass / ${summary.warn} warn / ${summary.blocker} blocker`
);

if (summary.blocker > 0) {
  process.exitCode = 2;
}
