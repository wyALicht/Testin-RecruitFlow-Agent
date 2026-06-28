const { PrismaClient } = require("@prisma/client");
const { createHash, randomBytes, scryptSync } = require("node:crypto");

const prisma = new PrismaClient();

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeName(name) {
  return String(name || "").trim();
}

function buildUserId(email) {
  return createHash("sha1").update(normalizeEmail(email)).digest("hex").slice(0, 12);
}

function hashPassword(password, salt) {
  const resolvedSalt = salt || randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, resolvedSalt, 64).toString("hex");
  return `${resolvedSalt}:${derivedKey}`;
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const role = args.role === "recruiter" ? "recruiter" : "admin";
  const defaultEmail = role === "admin" ? "admin@testin.local" : "hr@testin.local";
  const defaultName = role === "admin" ? "Testin Admin" : "Testin HR";
  const defaultPassword = role === "admin" ? "Admin123456" : "Hr123456";
  const email = normalizeEmail(
    args.email || process.env.BOOTSTRAP_ADMIN_EMAIL || process.env.BOOTSTRAP_USER_EMAIL || defaultEmail
  );
  const name = normalizeName(
    args.name || process.env.BOOTSTRAP_ADMIN_NAME || process.env.BOOTSTRAP_USER_NAME || defaultName
  );
  const password = String(
    args.password ||
      process.env.BOOTSTRAP_ADMIN_PASSWORD ||
      process.env.BOOTSTRAP_USER_PASSWORD ||
      defaultPassword
  ).trim();
  const usedDefaultPassword =
    !args.password && !process.env.BOOTSTRAP_ADMIN_PASSWORD && !process.env.BOOTSTRAP_USER_PASSWORD;

  if (!email) {
    throw new Error("Missing admin email. Use --email or BOOTSTRAP_ADMIN_EMAIL.");
  }

  if (!name) {
    throw new Error("Missing admin name. Use --name or BOOTSTRAP_ADMIN_NAME.");
  }

  if (password.length < 8) {
    throw new Error("Admin password must be at least 8 characters.");
  }

  const user = await prisma.authUser.upsert({
    where: { email },
    update: {
      name,
      passwordHash: hashPassword(password),
      role
    },
    create: {
      id: buildUserId(email),
      name,
      email,
      passwordHash: hashPassword(password),
      role
    }
  });

  console.log(`${role === "admin" ? "Admin" : "HR"} account is ready: ${user.email}`);
  console.log(`Role: ${user.role}`);
  if (usedDefaultPassword) {
    console.log(`Password: ${defaultPassword}`);
    console.log("Warning: default password was used. Change it after login or rerun this script with --password.");
  } else {
    console.log("Password: <custom password provided>");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
