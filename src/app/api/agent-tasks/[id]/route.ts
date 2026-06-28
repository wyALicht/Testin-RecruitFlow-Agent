import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { deleteAgentTaskById, getAgentTaskById } from "@/lib/services/candidates";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await getAgentTaskById(id);

  if (!task) {
    return NextResponse.json({ error: "Agent 日志不存在" }, { status: 404 });
  }

  return NextResponse.json(task);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(request, PERMISSIONS.AGENT_TASK_DELETE);
  if (!authorization.ok) return authorization.response;

  const { id } = await params;
  const task = await deleteAgentTaskById(id);

  if (!task) {
    return NextResponse.json({ error: "Agent 日志不存在" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
