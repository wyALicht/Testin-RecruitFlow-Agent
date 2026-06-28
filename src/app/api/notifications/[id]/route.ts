import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { markNotificationDone } from "@/lib/services/candidates";

const schema = z.object({
  done: z.boolean()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(request, PERMISSIONS.CANDIDATE_WRITE);
  if (!authorization.ok) return authorization.response;

  try {
    const { id } = await params;
    const payload = schema.parse(await request.json());
    const notification = await markNotificationDone(id, payload.done);

    return NextResponse.json(notification);
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新提醒失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
