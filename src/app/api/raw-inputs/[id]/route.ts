import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { deleteRawInputById, getRawInputById } from "@/lib/services/raw-inputs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rawInput = await getRawInputById(id);

  if (!rawInput) {
    return NextResponse.json({ error: "原始输入不存在" }, { status: 404 });
  }

  return NextResponse.json(rawInput);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(request, PERMISSIONS.RAW_INPUT_DELETE);
  if (!authorization.ok) return authorization.response;

  const { id } = await params;
  const rawInput = await deleteRawInputById(id);

  if (!rawInput) {
    return NextResponse.json({ error: "原始输入不存在" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
