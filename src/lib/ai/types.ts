export const INPUT_SCENES = [
  "RESUME",
  "EMAIL",
  "CHAT",
  "INTERVIEW_FEEDBACK",
  "NOTE",
  "OTHER"
] as const;

export type InputScene = (typeof INPUT_SCENES)[number];
