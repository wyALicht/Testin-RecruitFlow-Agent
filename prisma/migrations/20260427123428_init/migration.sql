-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('NEW', 'SCREENING', 'WRITTEN_TEST', 'FIRST_INTERVIEW', 'SECOND_INTERVIEW', 'FINAL_INTERVIEW', 'OFFER', 'ONBOARD', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AgentTaskStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'NEED_REVIEW');

-- CreateEnum
CREATE TYPE "RawInputType" AS ENUM ('RESUME', 'EMAIL', 'CHAT', 'NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "InputScene" AS ENUM ('RESUME', 'EMAIL', 'CHAT', 'INTERVIEW_FEEDBACK', 'NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('FOLLOW_UP', 'INTERVIEW', 'OFFER', 'ONBOARD', 'OTHER');

-- CreateEnum
CREATE TYPE "AuthRole" AS ENUM ('admin', 'recruiter');

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "school" TEXT,
    "major" TEXT,
    "yearsOfExperience" INTEGER,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "CandidateStatus" NOT NULL DEFAULT 'NEW',
    "source" TEXT,
    "remark" TEXT,
    "confidence" DOUBLE PRECISION,
    "uncertainFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "followUpSuggestion" TEXT,
    "lastFollowUpAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "positionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "owner" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentLog" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "fromStatus" "CandidateStatus",
    "toStatus" "CandidateStatus" NOT NULL,
    "note" TEXT,
    "source" TEXT DEFAULT 'manual',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecruitmentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawInput" (
    "id" TEXT NOT NULL,
    "inputType" "RawInputType" NOT NULL DEFAULT 'OTHER',
    "inputScene" "InputScene",
    "content" TEXT NOT NULL,
    "parsedResult" JSONB,
    "candidateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "status" "AgentTaskStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "confidence" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "candidateId" TEXT,
    "rawInputId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "note" TEXT,
    "dueAt" TIMESTAMP(3),
    "done" BOOLEAN NOT NULL DEFAULT false,
    "candidateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AuthRole" NOT NULL DEFAULT 'recruiter',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Candidate_name_idx" ON "Candidate"("name");

-- CreateIndex
CREATE INDEX "Candidate_phone_idx" ON "Candidate"("phone");

-- CreateIndex
CREATE INDEX "Candidate_email_idx" ON "Candidate"("email");

-- CreateIndex
CREATE INDEX "Candidate_status_idx" ON "Candidate"("status");

-- CreateIndex
CREATE INDEX "Candidate_positionId_idx" ON "Candidate"("positionId");

-- CreateIndex
CREATE INDEX "Candidate_deletedAt_idx" ON "Candidate"("deletedAt");

-- CreateIndex
CREATE INDEX "Position_title_idx" ON "Position"("title");

-- CreateIndex
CREATE INDEX "Position_department_idx" ON "Position"("department");

-- CreateIndex
CREATE INDEX "RecruitmentLog_candidateId_idx" ON "RecruitmentLog"("candidateId");

-- CreateIndex
CREATE INDEX "RecruitmentLog_toStatus_idx" ON "RecruitmentLog"("toStatus");

-- CreateIndex
CREATE INDEX "RecruitmentLog_createdAt_idx" ON "RecruitmentLog"("createdAt");

-- CreateIndex
CREATE INDEX "RawInput_candidateId_idx" ON "RawInput"("candidateId");

-- CreateIndex
CREATE INDEX "RawInput_inputType_idx" ON "RawInput"("inputType");

-- CreateIndex
CREATE INDEX "RawInput_createdAt_idx" ON "RawInput"("createdAt");

-- CreateIndex
CREATE INDEX "AgentTask_agentName_idx" ON "AgentTask"("agentName");

-- CreateIndex
CREATE INDEX "AgentTask_taskType_idx" ON "AgentTask"("taskType");

-- CreateIndex
CREATE INDEX "AgentTask_status_idx" ON "AgentTask"("status");

-- CreateIndex
CREATE INDEX "AgentTask_candidateId_idx" ON "AgentTask"("candidateId");

-- CreateIndex
CREATE INDEX "AgentTask_rawInputId_idx" ON "AgentTask"("rawInputId");

-- CreateIndex
CREATE INDEX "AgentTask_createdAt_idx" ON "AgentTask"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_candidateId_idx" ON "Notification"("candidateId");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE INDEX "Notification_done_idx" ON "Notification"("done");

-- CreateIndex
CREATE INDEX "Notification_dueAt_idx" ON "Notification"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthUser_email_key" ON "AuthUser"("email");

-- CreateIndex
CREATE INDEX "AuthUser_role_idx" ON "AuthUser"("role");

-- CreateIndex
CREATE INDEX "AuthUser_createdAt_idx" ON "AuthUser"("createdAt");

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentLog" ADD CONSTRAINT "RecruitmentLog_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawInput" ADD CONSTRAINT "RawInput_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_rawInputId_fkey" FOREIGN KEY ("rawInputId") REFERENCES "RawInput"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
