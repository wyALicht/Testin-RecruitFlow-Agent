/**
 * 简历上传文件存储工具。
 *
 * 文件保存在项目工作目录 `data/uploads/resumes` 下，RawInput.parsedResult.inputMeta
 * 只保存随机文件名和原始文件元信息。读取和删除时通过 resolveStoredPath 防止路径穿越。
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const RESUME_UPLOAD_DIR = path.resolve(process.cwd(), "data", "uploads", "resumes");

function safeExtension(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  return [".pdf", ".docx", ".txt", ".md", ".json", ".csv"].includes(extension)
    ? extension
    : ".bin";
}

function resolveStoredPath(storedFileName: string) {
  const safeName = path.basename(storedFileName);
  const resolved = path.resolve(RESUME_UPLOAD_DIR, safeName);
  if (!resolved.startsWith(`${RESUME_UPLOAD_DIR}${path.sep}`)) {
    throw new Error("非法的简历文件路径");
  }
  return resolved;
}

export async function storeResumeUpload(file: File) {
  await mkdir(RESUME_UPLOAD_DIR, { recursive: true });
  const storedFileName = `${randomUUID()}${safeExtension(file.name)}`;
  await writeFile(resolveStoredPath(storedFileName), Buffer.from(await file.arrayBuffer()));
  return storedFileName;
}

export async function readStoredResume(storedFileName: string) {
  return readFile(resolveStoredPath(storedFileName));
}

export async function removeStoredResume(storedFileName: string) {
  try {
    await unlink(resolveStoredPath(storedFileName));
  } catch {
    // 文件可能已被清理或不存在；RawInput 记录仍然有效，因此删除失败不阻断主流程。
  }
}
