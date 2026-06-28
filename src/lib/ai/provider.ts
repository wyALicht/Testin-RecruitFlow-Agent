/**
 * AI Provider 工厂与统一接口定义。
 *
 * 服务层只依赖 AIProvider.extractCandidate，不直接关心具体模型厂商。
 * 当前支持 mock、DeepSeek、Qwen 和 custom OpenAI-compatible provider。
 */
import { type ExtractedCandidateDraft } from "@/lib/agents/extract";
import { MockAIProvider } from "@/lib/ai/providers/mock";
import { OpenAICompatibleAIProvider } from "@/lib/ai/providers/openai-compatible";

export type AIExtractionContext = {
  position?: {
    id: string;
    title: string;
    departmentName: string | null;
    jobDescription: string | null;
  } | null;
  customFields?: Array<{
    key: string;
    label: string;
    fieldType: string;
    required: boolean;
  }>;
};

export interface AIProvider {
  name: string;
  displayName: string;
  model: string;
  extractCandidate(
    content: string,
    context?: AIExtractionContext
  ): Promise<ExtractedCandidateDraft>;
}

export type AIProviderSelection = {
  provider?: string | null;
};

function getRequiredEnv(name: string) {
  // 真实模型 provider 必须配置对应密钥或 base URL；mock provider 不需要任何外部环境变量。
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`);
  }
  return value;
}

export function getAIProvider(selection?: AIProviderSelection | string | null): AIProvider {
  // Provider 选择顺序：接口传入优先，其次读取环境变量，最后回退到 mock，方便本地无密钥演示。
  const providerKey =
    typeof selection === "string"
      ? selection
      : selection?.provider ?? process.env.AI_PROVIDER ?? "mock";
  const provider = providerKey.trim().toLowerCase();

  if (provider === "deepseek") {
    const model = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat";
    return new OpenAICompatibleAIProvider({
      providerName: "deepseek",
      displayName: `DeepSeek / ${model}`,
      apiKey: getRequiredEnv("DEEPSEEK_API_KEY"),
      baseURL: process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
      model
    });
  }

  if (provider === "qwen") {
    const model = process.env.QWEN_MODEL?.trim() || "qwen-plus";
    return new OpenAICompatibleAIProvider({
      providerName: "qwen",
      displayName: `Qwen / ${model}`,
      apiKey: getRequiredEnv("QWEN_API_KEY"),
      baseURL: process.env.QWEN_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model
    });
  }

  if (provider === "custom") {
    const model = getRequiredEnv("CUSTOM_AI_MODEL");
    const providerName = process.env.CUSTOM_AI_PROVIDER_NAME?.trim() || "custom";
    return new OpenAICompatibleAIProvider({
      providerName: "custom",
      displayName: `${providerName} / ${model}`,
      apiKey: getRequiredEnv("CUSTOM_AI_API_KEY"),
      baseURL: getRequiredEnv("CUSTOM_AI_BASE_URL"),
      model
    });
  }

  return new MockAIProvider();
}
