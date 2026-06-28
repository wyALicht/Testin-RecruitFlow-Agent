import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { updateCandidateSchema } from "@/lib/schemas/candidate";
import { getCandidateById, softDeleteCandidate, updateCandidate } from "@/lib/services/candidates";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidate = await getCandidateById(id);

  if (!candidate) {
    return NextResponse.json({ error: "候选人不存在" }, { status: 404 });
  }

  return NextResponse.json(candidate);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(request, PERMISSIONS.CANDIDATE_WRITE);
  if (!authorization.ok) return authorization.response;

  try {
    const { id } = await params;
    const json = await request.json();
    const payload = updateCandidateSchema.parse(json);
    const candidate = await updateCandidate(id, payload);

    if (!candidate) {
      return NextResponse.json({ error: "候选人不存在" }, { status: 404 });
    }

    return NextResponse.json(candidate);
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(request, PERMISSIONS.CANDIDATE_DELETE);
  if (!authorization.ok) return authorization.response;

  const { id } = await params;
  const candidate = await softDeleteCandidate(id);

  if (!candidate) {
    return NextResponse.json({ error: "候选人不存在" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
