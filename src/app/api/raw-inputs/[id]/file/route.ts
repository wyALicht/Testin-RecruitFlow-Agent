/**
 * 原始输入附件读取 API。
 *
 * 根据 RawInput.parsedResult.inputMeta 中保存的 storedFileName 读取本地简历文件，
 * 并以内联响应返回给前端。该接口只读取文件，不负责权限细分，登录态由 middleware 保护。
 */
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { readStoredResume } from "@/lib/files/storage";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rawInput = await prisma.rawInput.findUnique({
    where: { id },
    select: { parsedResult: true }
  });

  if (!rawInput) {
    return NextResponse.json({ error: "原始输入不存在" }, { status: 404 });
  }

  const parsedResult = objectValue(rawInput.parsedResult);
  const inputMeta = objectValue(parsedResult.inputMeta);
  const storedFileName =
    typeof inputMeta.storedFileName === "string" ? inputMeta.storedFileName : null;
  const originalFileName =
    typeof inputMeta.fileName === "string" ? inputMeta.fileName : "candidate-resume";
  const mimeType =
    typeof inputMeta.mimeType === "string" ? inputMeta.mimeType : "application/octet-stream";

  if (!storedFileName) {
    return NextResponse.json({ error: "该记录没有可下载的原始简历文件" }, { status: 404 });
  }

  try {
    const bytes = await readStoredResume(storedFileName);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(originalFileName)}`,
        "Cache-Control": "private, max-age=3600"
      }
    });
  } catch {
    return NextResponse.json({ error: "简历文件不存在或无法读取" }, { status: 404 });
  }
}
