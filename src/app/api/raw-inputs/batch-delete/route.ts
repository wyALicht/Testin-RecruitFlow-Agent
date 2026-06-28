import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { batchDeleteRawInputsSchema } from "@/lib/schemas/raw-inputs";
import { batchDeleteRawInputs } from "@/lib/services/raw-inputs";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, PERMISSIONS.RAW_INPUT_DELETE);
  if (!authorization.ok) return authorization.response;

  try {
    const payload = batchDeleteRawInputsSchema.parse(await request.json());
    return NextResponse.json(await batchDeleteRawInputs(payload.ids));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "批量删除原始输入失败" },
      { status: 400 }
    );
  }
}
