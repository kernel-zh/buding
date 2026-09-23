import type { Language } from "@/lib/data/schema";

export function LanguageBadge({ language }: { language: Language }) {
  const label = language === "mixed" ? "Mixed" : language;
  const style = language === "zh_CN" ? "badge-cn" : language === "zh_TW" ? "badge-tw" : "badge-mixed";
  return <span className={`tag ${style}`}>{label}</span>;
}
