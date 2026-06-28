const fs = require("node:fs");
const path = require("node:path");
const { Prisma, PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const root = process.cwd();

function readJson(fileName, fallback) {
  const filePath = path.join(root, fileName);
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function toNullableJson(value) {
  if (value === undefined || value === null) {
    return Prisma.JsonNull;
  }

  return cloneJson(value);
}

function toRequiredJson(value) {
  const normalized = cloneJson(value ?? {});
  return normalized === null ? {} : normalized;
}

function toDate(value, fallback = new Date()) {
  if (!value) {
    return fallback;
  }

  return new Date(value);
}

function toStringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function emptyDb() {
  return {
    positions: [],
    candidates: [],
    logs: [],
    rawInputs: [],
    agentTasks: [],
    notifications: []
  };
}

function extractCandidateIdFromValue(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (typeof value.candidateId === "string" && value.candidateId.trim()) {
    return value.candidateId.trim();
  }

  if (typeof value.mergedIntoCandidateId === "string" && value.mergedIntoCandidateId.trim()) {
    return value.mergedIntoCandidateId.trim();
  }

  if (value.result) {
    return extractCandidateIdFromValue(value.result);
  }

  return null;
}

function extractIdentity(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const direct = {
    name: typeof value.name === "string" ? value.name.trim() : null,
    phone: typeof value.phone === "string" ? value.phone.trim() : null,
    email: typeof value.email === "string" ? value.email.trim().toLowerCase() : null,
    school: typeof value.school === "string" ? value.school.trim() : null
  };

  if (direct.name || direct.phone || direct.email || direct.school) {
    return direct;
  }

  if (value.result) {
    return extractIdentity(value.result);
  }

  return null;
}

function findCandidateIdByIdentity(identity, candidates) {
  if (!identity) {
    return null;
  }

  const availableCandidates = candidates.filter((candidate) => !candidate.deletedAt);

  if (identity.phone) {
    const matchedByPhone = availableCandidates.find((candidate) => candidate.phone === identity.phone);
    if (matchedByPhone) {
      return matchedByPhone.id;
    }
  }

  if (identity.email) {
    const matchedByEmail = availableCandidates.find(
      (candidate) => String(candidate.email || "").toLowerCase() === identity.email
    );
    if (matchedByEmail) {
      return matchedByEmail.id;
    }
  }

  if (identity.name && identity.school) {
    const matchedByNameAndSchool = availableCandidates.find(
      (candidate) => candidate.name === identity.name && candidate.school === identity.school
    );
    if (matchedByNameAndSchool) {
      return matchedByNameAndSchool.id;
    }
  }

  return null;
}

function resolveRawInputCandidateId(rawInput, tasks, candidates) {
  if (rawInput.candidateId) {
    return rawInput.candidateId;
  }

  const parsedResultCandidateId = extractCandidateIdFromValue(rawInput.parsedResult);
  if (parsedResultCandidateId) {
    return parsedResultCandidateId;
  }

  const relatedTasks = tasks.filter((task) => task.rawInputId === rawInput.id);
  for (const task of relatedTasks) {
    if (task.candidateId) {
      return task.candidateId;
    }

    const outputCandidateId = extractCandidateIdFromValue(task.output);
    if (outputCandidateId) {
      return outputCandidateId;
    }

    const inputCandidateId = extractCandidateIdFromValue(task.input);
    if (inputCandidateId) {
      return inputCandidateId;
    }
  }

  return (
    findCandidateIdByIdentity(extractIdentity(rawInput.parsedResult), candidates) ||
    findCandidateIdByIdentity(extractIdentity(relatedTasks[0] && relatedTasks[0].output), candidates) ||
    null
  );
}

function resolveTaskCandidateId(task, rawInputs, tasks, candidates) {
  if (task.candidateId) {
    return task.candidateId;
  }

  const outputCandidateId = extractCandidateIdFromValue(task.output);
  if (outputCandidateId) {
    return outputCandidateId;
  }

  const identityCandidateId =
    findCandidateIdByIdentity(extractIdentity(task.output), candidates) ||
    findCandidateIdByIdentity(extractIdentity(task.input), candidates);
  if (identityCandidateId) {
    return identityCandidateId;
  }

  const inputCandidateId = extractCandidateIdFromValue(task.input);
  if (inputCandidateId) {
    return inputCandidateId;
  }

  if (!task.rawInputId) {
    return null;
  }

  const rawInput = rawInputs.find((item) => item.id === task.rawInputId);
  if (!rawInput) {
    return null;
  }

  return resolveRawInputCandidateId(rawInput, tasks, candidates);
}

function normalizeSeedData(db) {
  const normalized = {
    positions: Array.isArray(db.positions) ? db.positions : [],
    candidates: Array.isArray(db.candidates) ? db.candidates : [],
    logs: Array.isArray(db.logs) ? db.logs : [],
    rawInputs: Array.isArray(db.rawInputs) ? db.rawInputs : [],
    agentTasks: Array.isArray(db.agentTasks) ? db.agentTasks : [],
    notifications: Array.isArray(db.notifications) ? db.notifications : []
  };

  normalized.rawInputs.forEach((rawInput) => {
    rawInput.candidateId = resolveRawInputCandidateId(rawInput, normalized.agentTasks, normalized.candidates);
  });

  normalized.agentTasks.forEach((task) => {
    task.candidateId = resolveTaskCandidateId(task, normalized.rawInputs, normalized.agentTasks, normalized.candidates);
  });

  return normalized;
}

async function resetDatabase() {
  await prisma.applicationFieldChange.deleteMany();
  await prisma.agentTask.deleteMany();
  await prisma.recruitmentLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.rawInput.deleteMany();
  await prisma.recruitmentApplication.deleteMany();
  await prisma.positionFieldDefinition.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.position.deleteMany();
  await prisma.authUser.deleteMany();
}

async function seedPositions(tx, positions) {
  for (const position of positions) {
    await tx.position.create({
      data: {
        id: String(position.id),
        title: String(position.title),
        department: position.department ?? null,
        headcount: Number(position.headcount ?? 1),
        owner: position.owner ?? null,
        description: position.description ?? null,
        status: position.status ?? "open",
        createdAt: toDate(position.createdAt),
        updatedAt: toDate(position.updatedAt)
      }
    });
  }
}

async function seedCandidates(tx, candidates) {
  for (const candidate of candidates) {
    await tx.candidate.create({
      data: {
        id: String(candidate.id),
        name: String(candidate.name),
        phone: candidate.phone ?? null,
        email: candidate.email ?? null,
        school: candidate.school ?? null,
        major: candidate.major ?? null,
        yearsOfExperience:
          candidate.yearsOfExperience === undefined || candidate.yearsOfExperience === null
            ? null
            : Number(candidate.yearsOfExperience),
        skills: toStringArray(candidate.skills),
        status: candidate.status,
        source: candidate.source ?? null,
        remark: candidate.remark ?? null,
        confidence:
          candidate.confidence === undefined || candidate.confidence === null ? null : Number(candidate.confidence),
        uncertainFields: toStringArray(candidate.uncertainFields),
        tags: toStringArray(candidate.tags),
        followUpSuggestion: candidate.followUpSuggestion ?? null,
        lastFollowUpAt: candidate.lastFollowUpAt ? toDate(candidate.lastFollowUpAt) : null,
        deletedAt: candidate.deletedAt ? toDate(candidate.deletedAt) : null,
        positionId: candidate.positionId ?? null,
        createdAt: toDate(candidate.createdAt),
        updatedAt: toDate(candidate.updatedAt)
      }
    });

    if (candidate.positionId) {
      await tx.recruitmentApplication.create({
        data: {
          id: `app_${String(candidate.id).replace(/^cand_/, "")}`,
          candidateId: String(candidate.id),
          positionId: String(candidate.positionId),
          status: candidate.status,
          source: candidate.source ?? null,
          appliedAt: toDate(candidate.createdAt),
          customValues: {},
          lastFollowUpAt: candidate.lastFollowUpAt ? toDate(candidate.lastFollowUpAt) : null,
          deletedAt: candidate.deletedAt ? toDate(candidate.deletedAt) : null,
          createdAt: toDate(candidate.createdAt),
          updatedAt: toDate(candidate.updatedAt)
        }
      });
    }
  }
}

async function seedLogs(tx, logs) {
  for (const log of logs) {
    await tx.recruitmentLog.create({
      data: {
        id: String(log.id),
        candidateId: String(log.candidateId),
        fromStatus: log.fromStatus ?? null,
        toStatus: log.toStatus,
        note: log.note ?? null,
        source: log.source ?? null,
        createdBy: log.createdBy ?? null,
        createdAt: toDate(log.createdAt)
      }
    });
  }
}

async function seedRawInputs(tx, rawInputs) {
  for (const rawInput of rawInputs) {
    const parsedResultObject =
      rawInput.parsedResult && typeof rawInput.parsedResult === "object" ? rawInput.parsedResult : null;
    const derivedInputScene =
      rawInput.inputScene ??
      (parsedResultObject &&
      parsedResultObject.result &&
      typeof parsedResultObject.result === "object" &&
      parsedResultObject.result.inputScene
        ? parsedResultObject.result.inputScene
        : null);

    await tx.rawInput.create({
      data: {
        id: String(rawInput.id),
        candidateId: rawInput.candidateId ?? null,
        inputType: rawInput.inputType ?? "OTHER",
        inputScene: derivedInputScene,
        content: String(rawInput.content ?? ""),
        parsedResult: toNullableJson(rawInput.parsedResult),
        createdAt: toDate(rawInput.createdAt)
      }
    });
  }
}

async function seedAgentTasks(tx, agentTasks) {
  for (const task of agentTasks) {
    await tx.agentTask.create({
      data: {
        id: String(task.id),
        agentName: String(task.agentName),
        taskType: String(task.taskType),
        status: task.status ?? "PENDING",
        input: toRequiredJson(task.input),
        output: toNullableJson(task.output),
        error: task.error ?? null,
        confidence: task.confidence === undefined || task.confidence === null ? null : Number(task.confidence),
        durationMs: task.durationMs === undefined || task.durationMs === null ? null : Number(task.durationMs),
        candidateId: task.candidateId ?? null,
        rawInputId: task.rawInputId ?? null,
        createdAt: toDate(task.createdAt),
        updatedAt: toDate(task.updatedAt)
      }
    });
  }
}

async function seedNotifications(tx, notifications) {
  for (const notification of notifications) {
    await tx.notification.create({
      data: {
        id: String(notification.id),
        type: notification.type ?? "OTHER",
        title: String(notification.title),
        note: notification.note ?? null,
        dueAt: notification.dueAt ? toDate(notification.dueAt) : null,
        done: Boolean(notification.done),
        candidateId: String(notification.candidateId),
        createdAt: toDate(notification.createdAt),
        updatedAt: toDate(notification.updatedAt)
      }
    });
  }
}

async function seedUsers(tx, users) {
  for (const user of users) {
    await tx.authUser.create({
      data: {
        id: String(user.id),
        name: String(user.name),
        email: String(user.email).trim().toLowerCase(),
        passwordHash: String(user.passwordHash),
        role: user.role === "admin" ? "admin" : "recruiter",
        createdAt: toDate(user.createdAt)
      }
    });
  }
}

async function main() {
  const db = normalizeSeedData(readJson("data/db.json", emptyDb()));
  const userSeed = readJson("data/users.json", []);
  const users = Array.isArray(userSeed) ? userSeed : [];

  await resetDatabase();

  await prisma.$transaction(async (tx) => {
    await seedPositions(tx, db.positions);
    await seedCandidates(tx, db.candidates);
    await seedLogs(tx, db.logs);
    await seedRawInputs(tx, db.rawInputs);
    await seedAgentTasks(tx, db.agentTasks);
    await seedNotifications(tx, db.notifications);
    await seedUsers(tx, users);
  },
  {
    maxWait: 20000,
    timeout: 120000,
  }
);

  console.log(
    `Seeded Postgres with ${db.candidates.length} candidates, ${db.rawInputs.length} raw inputs, ${db.agentTasks.length} agent tasks, ${db.notifications.length} notifications and ${users.length} users.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
