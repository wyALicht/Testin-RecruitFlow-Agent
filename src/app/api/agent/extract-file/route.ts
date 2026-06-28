/**
 * 文件 AI Intake API。
 *
 * 接收上传文件并解析为文本，保存原始文件后复用 runCandidateIntake 完成候选人草稿生成。
 * 若 AI 处理失败，会清理已落盘文件，避免出现未关联 RawInput 的孤儿附件。
 */
import { NextResponse } from "next/server";
import { RawInputType } from "@prisma/client";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { detectInputScene, detectRawInputType } from "@/lib/agents/extract";
import { buildIntakeContentFromFile, parseUploadedFile } from "@/lib/files/parser";
import { removeStoredResume, storeResumeUpload } from "@/lib/files/storage";
import { INPUT_SCENE_LABELS } from "@/lib/constants";
import { runCandidateIntake } from "@/lib/services/intake";

export async function POST(request: Request) {
  // 文件录入入口：先解析并保存上传文件，再复用文本 Intake 流程，确保两种录入方式行为一致。
  const authorization = await authorizeRequest(request, PERMISSIONS.AI_INTAKE_USE);
  if (!authorization.ok) return authorization.response;

  try {
    const formData = await request.formData();
    const uploaded = formData.get("file");
    const provider = formData.get("provider");
    const departmentId = formData.get("departmentId");
    const positionId = formData.get("positionId");

    if (!(uploaded instanceof File)) {
      return NextResponse.json({ error: "请先选择要解析的文件" }, { status: 400 });
    }

    const parsed = await parseUploadedFile(uploaded);
    const detectedInputType = detectRawInputType(parsed.text);
    const detectedInputScene = detectInputScene(parsed.text);
    const finalInputTypeHint =
      parsed.inputTypeHint === RawInputType.RESUME
        ? RawInputType.RESUME
        : detectedInputType !== RawInputType.OTHER
          ? detectedInputType
          : parsed.inputTypeHint;
    const finalInputSceneHint = parsed.inputTypeHint === RawInputType.RESUME ? "RESUME" : detectedInputScene;

    const storedFileName = await storeResumeUpload(uploaded);
    const content = buildIntakeContentFromFile(parsed);
    let result;
    try {
      result = await runCandidateIntake({
        content,
        rawInputContent: parsed.text,
        initialInputType: finalInputTypeHint,
        inputMeta: {
          fileName: parsed.fileName,
          storedFileName,
          mimeType: parsed.mimeType,
          fileSize: parsed.size,
          inputSceneHint: finalInputSceneHint
        },
        providerSelection: {
          provider: typeof provider === "string" ? provider : undefined
        },
        departmentId:
          typeof departmentId === "string" && departmentId ? departmentId : undefined,
        positionId: typeof positionId === "string" && positionId ? positionId : undefined
      });
    } catch (error) {
      // AI 处理失败时删除已落盘文件，避免产生无法在页面关联的孤儿附件。
      await removeStoredResume(storedFileName);
      throw error;
    }

    return NextResponse.json({
      ...result,
      parsedText: parsed.text,
      file: {
        name: parsed.fileName,
        mimeType: parsed.mimeType,
        size: parsed.size,
        url: `/api/raw-inputs/${result.rawInputId}/file`,
        inputTypeHint: finalInputTypeHint,
        inputSceneHint: finalInputSceneHint,
        inputSceneLabel: INPUT_SCENE_LABELS[finalInputSceneHint]
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "文件解析失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
