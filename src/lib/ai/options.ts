export const AI_PROVIDER_OPTIONS = [
  {
    value: "qwen",
    label: "Qwen",
    hint: "使用环境变量中的 `QWEN_MODEL`"
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    hint: "使用环境变量中的 `DEEPSEEK_MODEL`"
  },
  {
    value: "custom",
    label: "其他模型",
    hint: "使用 `CUSTOM_AI_*` 环境变量接入 OpenAI 兼容模型"
  },
  {
    value: "mock",
    label: "Mock",
    hint: "本地演示抽取，不调用真实模型"
  }
] as const;

export type AIProviderOptionValue = (typeof AI_PROVIDER_OPTIONS)[number]["value"];
