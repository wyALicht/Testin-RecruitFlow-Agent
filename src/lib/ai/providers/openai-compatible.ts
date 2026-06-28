/**
 * 兼容 OpenAI Chat Completions 协议的模型 Provider。
 *
 * 用于接入 DeepSeek、Qwen 和自定义模型服务。该类负责提示词调用、JSON 截取、
 * 本地规则兜底、Zod 结构校验和常见模型调用错误归一化。
 */
import OpenAI from "openai";

import { extractCandidateDraft, type ExtractedCandidateDraft } from "@/lib/agents/extract";
import { applyJobDescriptionAssessment } from "@/lib/ai/job-match";
import { type AIExtractionContext } from "@/lib/ai/provider";
import {
  CANDIDATE_EXTRACTION_SYSTEM_PROMPT,
  buildCandidateExtractionUserPrompt
} from "@/lib/ai/prompts";
import { llmCandidateExtractSchema } from "@/lib/ai/schemas";

type ProviderName = "deepseek" | "qwen" | "custom";

type OpenAICompatibleProviderOptions = {
  providerName: ProviderName;
  displayName: string;
  apiKey: string;
  baseURL: string;
  model: string;
};

function normalizeProviderError(error: unknown, providerName: string) {
  // 将 OpenAI SDK 的错误类型转换成面向用户的中文提示，便于 Agent 日志页排查。
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new Error(`${providerName} 请求超时，请检查网络或代理设置后重试。`);
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new Error(`${providerName} 连接失败，请确认服务运行环境允许访问公网，并检查代理、防火墙和 API 地址。`);
  }
  if (error instanceof OpenAI.AuthenticationError) {
    return new Error(`${providerName} API Key 无效或已过期，请检查环境变量中的密钥。`);
  }
  if (error instanceof OpenAI.RateLimitError) {
    return new Error(`${providerName} 请求频率或账户额度受限，请检查账户余额和限流状态。`);
  }
  if (error instanceof OpenAI.APIError) {
    return new Error(`${providerName} 调用失败（HTTP ${error.status ?? "未知"}）：${error.message}`);
  }
  return error instanceof Error ? error : new Error(`${providerName} 调用失败`);
}

function extractJsonObject(raw: string) {
  // 兼容模型返回 ```json 代码块或在 JSON 前后追加解释文本的情况，只截取首个完整对象。
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fencedMatch?.[1]) {
    return extractJsonObject(fencedMatch[1]);
  }

  const firstBrace = trimmed.indexOf("{");
  if (firstBrace < 0) {
    throw new Error("模型未返回 JSON 对象");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstBrace; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(firstBrace, index + 1);
      }
    }
  }

  throw new Error("模型返回内容中未找到完整 JSON 对象");
}

export class OpenAICompatibleAIProvider {
  readonly name: ProviderName;
  readonly displayName: string;
  readonly model: string;
  private readonly client: OpenAI;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.name = options.providerName;
    this.displayName = options.displayName;
    this.model = options.model;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      timeout: 30000
    });
  }

  async extractCandidate(
    content: string,
    context?: AIExtractionContext
  ): Promise<ExtractedCandidateDraft> {
    let lastError: Error | null = null;

    // 模型偶发返回非标准 JSON 时允许重试一次；最终仍用 Zod 校验，保证服务层拿到稳定结构。
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          temperature: 0.2,
          response_format: {
            type: "json_object"
          },
          messages: [
            {
              role: "system",
              content: CANDIDATE_EXTRACTION_SYSTEM_PROMPT
            },
            {
              role: "user",
              content: buildCandidateExtractionUserPrompt(content, context)
            }
          ]
        });

        const messageContent = completion.choices[0]?.message?.content;
        if (!messageContent) {
          throw new Error(`${this.name} 未返回可解析内容`);
        }

        const parsedJson = JSON.parse(extractJsonObject(messageContent));
        // 本地规则先生成兜底草稿，再用模型字段覆盖；这样模型漏掉手机号/邮箱时仍有机会补齐。
        const heuristicDraft = applyJobDescriptionAssessment(
          extractCandidateDraft(content),
          content,
          context
        );
        const mergedDraft = {
          name:
            typeof parsedJson?.name === "string" && parsedJson.name.trim()
              ? parsedJson.name.trim()
              : heuristicDraft.name,
          phone: parsedJson?.phone ?? heuristicDraft.phone,
          email: parsedJson?.email ?? heuristicDraft.email,
          school: parsedJson?.school ?? heuristicDraft.school,
          education: parsedJson?.education ?? heuristicDraft.education,
          major: parsedJson?.major ?? heuristicDraft.major,
          yearsOfExperience: parsedJson?.yearsOfExperience ?? heuristicDraft.yearsOfExperience,
          skills: parsedJson?.skills ?? heuristicDraft.skills,
          status: parsedJson?.status ?? heuristicDraft.status,
          source: parsedJson?.source ?? heuristicDraft.source,
          remark:
            parsedJson?.remark ?? `由 ${this.displayName} 提取，缺失字段已由本地规则兜底补全。`,
          confidence: parsedJson?.confidence ?? Math.max(heuristicDraft.confidence, 0.72),
          uncertainFields: parsedJson?.uncertainFields ?? heuristicDraft.uncertainFields,
          positionTitle: parsedJson?.positionTitle ?? heuristicDraft.positionTitle,
          inputType: parsedJson?.inputType ?? heuristicDraft.inputType,
          inputScene: parsedJson?.inputScene ?? heuristicDraft.inputScene,
          tags: parsedJson?.tags ?? heuristicDraft.tags,
          followUpSuggestion: parsedJson?.followUpSuggestion ?? heuristicDraft.followUpSuggestion,
          customFields:
            parsedJson?.customFields && typeof parsedJson.customFields === "object"
              ? parsedJson.customFields
              : heuristicDraft.customFields
        };

        return llmCandidateExtractSchema.parse(mergedDraft);
      } catch (error) {
        lastError = normalizeProviderError(error, this.displayName);
      }
    }

    throw lastError ?? new Error(`${this.displayName} 调用失败`);
  }
}
