import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { batchUpdateRawInputsSchema } from "@/lib/schemas/raw-inputs";
import { batchUpdateRawInputs } from "@/lib/services/raw-inputs";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, PERMISSIONS.RAW_INPUT_WRITE);
  if (!authorization.ok) return authorization.response;

  try {
    const payload = batchUpdateRawInputsSchema.parse(await request.json());
    return NextResponse.json(await batchUpdateRawInputs(payload.ids, payload.patch));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "批量编辑原始输入失败" },
      { status: 400 }
    );
  }
}
