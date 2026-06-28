/**
 * 上传文件文本解析工具。
 *
 * 支持 PDF、DOCX、TXT、MD、JSON、CSV 等文件转纯文本，并输出 Intake 所需的类型提示。
 * `/api/agent/extract-file` 依赖本模块先完成文件校验和文本提取，再交给 AI Intake 服务处理。
 */
import { RawInputType } from "@prisma/client";
import mammoth from "mammoth";
import { createRequire } from "node:module";

import { detectInputScene, detectRawInputType } from "@/lib/agents/extract";
import { INPUT_SCENE_LABELS, INPUT_TYPE_LABELS } from "@/lib/constants";

const MAX_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024;
const UTF8_DECODER = new TextDecoder("utf-8");
const UTF8_FATAL_DECODER = new TextDecoder("utf-8", { fatal: true });
const GB18030_DECODER = new TextDecoder("gb18030");

const EXTENSION_TO_INPUT_TYPE: Record<string, RawInputType> = {
  ".txt": RawInputType.NOTE,
  ".md": RawInputType.NOTE,
  ".json": RawInputType.OTHER,
  ".csv": RawInputType.OTHER,
  ".pdf": RawInputType.RESUME,
  ".docx": RawInputType.RESUME
};

export type ParsedUpload = {
  fileName: string;
  mimeType: string;
  size: number;
  extension: string;
  inputTypeHint: RawInputType;
  text: string;
};

function getFileExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

function normalizeText(raw: string) {
  return raw
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isTextMimeType(mimeType: string) {
  return mimeType.startsWith("text/") || mimeType === "application/json";
}

function countMojibakeSignals(text: string) {
  const matches = text.match(/[閿涢妴閸婇張閺傞幓鐠囬梽缂佽埖鈧娈戦崣]/g);
  return matches?.length ?? 0;
}

function decodeTextBuffer(buffer: Buffer) {
  try {
    // 优先使用严格 UTF-8；同一段字节用 GB18030 解码可能看似可读但实际产生中文乱码。
    return normalizeText(UTF8_FATAL_DECODER.decode(buffer));
  } catch {
    const utf8Text = normalizeText(UTF8_DECODER.decode(buffer));
    const gb18030Text = normalizeText(GB18030_DECODER.decode(buffer));
    return countMojibakeSignals(gb18030Text) <= countMojibakeSignals(utf8Text)
      ? gb18030Text
      : utf8Text;
  }
}

async function parseBufferByType(buffer: Buffer, extension: string, mimeType: string) {
  // 上传解析只返回纯文本；后续分类、抽取和追溯都围绕这份文本继续处理。
  if (extension === ".pdf" || mimeType === "application/pdf") {
    const require = createRequire(import.meta.url);
    const { PDFParse } = require("pdf-parse");
    const { CanvasFactory, getData } = require("pdf-parse/worker");
    PDFParse.setWorker(getData());
    const parser = new PDFParse({
      data: buffer,
      CanvasFactory,
      useSystemFonts: true
    });

    try {
      const result = await parser.getText();
      return normalizeText(result.text);
    } finally {
      await parser.destroy();
    }
  }

  if (
    extension === ".docx" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return normalizeText(result.value);
  }

  if (isTextMimeType(mimeType) || [".txt", ".md", ".json", ".csv"].includes(extension)) {
    return decodeTextBuffer(buffer);
  }

  throw new Error("暂不支持该文件类型，请上传 PDF、DOCX、TXT、MD 或 JSON 文件。");
}

export async function parseUploadedFile(file: File): Promise<ParsedUpload> {
  // 所有文件入口先做统一校验，避免大文件或空文件进入 PDF/DOCX 解析库导致请求阻塞。
  if (!file) {
    throw new Error("未检测到上传文件");
  }

  if (!file.name) {
    throw new Error("文件缺少名称，无法解析");
  }

  if (file.size <= 0) {
    throw new Error("上传文件为空");
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("文件大小超过 8MB，请拆分后再上传");
  }

  const extension = getFileExtension(file.name);
  const inputTypeHint = EXTENSION_TO_INPUT_TYPE[extension] ?? RawInputType.OTHER;
  const buffer = Buffer.from(await file.arrayBuffer());
  const text = await parseBufferByType(buffer, extension, file.type || "");

  if (!text) {
    throw new Error("文件解析完成，但未提取到可用文本");
  }

  return {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    extension,
    inputTypeHint,
    text
  };
}

export function buildIntakeContentFromFile(parsed: ParsedUpload) {
  // 给模型的内容包含文件元信息，但 RawInput 中仍保存原始解析文本，便于用户回看真实来源。
  const detectedInputType = detectRawInputType(parsed.text);
  const detectedInputScene = detectInputScene(parsed.text);
  const metadata = [
    `文件名：${parsed.fileName}`,
    `文件类型：${parsed.extension || parsed.mimeType}`,
    `内容类型提示：${INPUT_TYPE_LABELS[detectedInputType]}`,
    `输入场景提示：${INPUT_SCENE_LABELS[detectedInputScene]}`,
    "解析来源：上传文件"
  ].join("\n");

  return `${metadata}\n\n${parsed.text}`.trim();
}
