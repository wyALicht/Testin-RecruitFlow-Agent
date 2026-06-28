/**
 * 文本 AI Intake API。
 *
 * 接收前端粘贴的原始文本、部门、岗位和 provider，完成权限校验和 Zod 参数校验后，
 * 将业务编排交给 runCandidateIntake。
 */
import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { extractRequestSchema } from "@/lib/schemas/candidate";
import { runCandidateIntake } from "@/lib/services/intake";

export async function POST(request: Request) {
  // 文本录入入口：只负责鉴权、参数校验和 HTTP 响应，业务编排交给 runCandidateIntake。
  const authorization = await authorizeRequest(request, PERMISSIONS.AI_INTAKE_USE);
  if (!authorization.ok) return authorization.response;

  try {
    const json = await request.json();
    const payload = extractRequestSchema.parse(json);
    const result = await runCandidateIntake({
      content: payload.content,
      initialInputType: payload.inputTypeHint,
      providerSelection: {
        provider: payload.provider
      },
      departmentId: payload.departmentId,
      positionId: payload.positionId
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent 分析失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
