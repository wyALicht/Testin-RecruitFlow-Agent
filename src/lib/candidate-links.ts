type TaskLike = {
  candidateId: string | null;
  rawInputId: string | null;
  output?: unknown;
  input?: unknown;
};

type RawInputLike = {
  id: string;
  candidateId: string | null;
  parsedResult?: unknown;
};

type CandidateLike = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  school?: string | null;
  deletedAt?: Date | string | null;
};

function extractCandidateIdFromValue(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.candidateId === "string" && record.candidateId.trim()) {
    return record.candidateId.trim();
  }

  if (typeof record.mergedIntoCandidateId === "string" && record.mergedIntoCandidateId.trim()) {
    return record.mergedIntoCandidateId.trim();
  }

  if (record.result) {
    const nestedCandidateId = extractCandidateIdFromValue(record.result);
    if (nestedCandidateId) {
      return nestedCandidateId;
    }
  }

  return null;
}

function extractIdentity(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const direct = {
    name: typeof record.name === "string" ? record.name.trim() : null,
    phone: typeof record.phone === "string" ? record.phone.trim() : null,
    email: typeof record.email === "string" ? record.email.trim().toLowerCase() : null,
    school: typeof record.school === "string" ? record.school.trim() : null
  };

  if (direct.name || direct.phone || direct.email || direct.school) {
    return direct;
  }

  if (record.result) {
    return extractIdentity(record.result);
  }

  return null;
}

function findCandidateIdByIdentity(identity: ReturnType<typeof extractIdentity>, candidates?: CandidateLike[]) {
  if (!identity || !candidates?.length) {
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
      (candidate) => candidate.email?.toLowerCase() === identity.email
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

export function resolveRawInputCandidateId<TTask extends TaskLike, TRawInput extends RawInputLike>(
  rawInput: TRawInput,
  tasks: TTask[],
  candidates?: CandidateLike[]
) {
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

  const identityCandidateId =
    findCandidateIdByIdentity(extractIdentity(rawInput.parsedResult), candidates) ??
    findCandidateIdByIdentity(extractIdentity(relatedTasks[0]?.output), candidates);
  if (identityCandidateId) {
    return identityCandidateId;
  }

  return null;
}

export function resolveTaskCandidateId<TTask extends TaskLike, TRawInput extends RawInputLike>(
  task: TTask,
  rawInputs: TRawInput[],
  tasks: TTask[],
  candidates?: CandidateLike[]
) {
  if (task.candidateId) {
    return task.candidateId;
  }

  const outputCandidateId = extractCandidateIdFromValue(task.output);
  if (outputCandidateId) {
    return outputCandidateId;
  }

  const identityCandidateId =
    findCandidateIdByIdentity(extractIdentity(task.output), candidates) ??
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
