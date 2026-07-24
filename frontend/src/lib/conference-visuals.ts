const LIFECYCLE_PHASE_COLORS: Record<string, string> = {
  unknown: "#696969",
  "expression of interest": "#00a6a6",
  "proposal under review": "#7a4bc2",
  "itss approved": "#28a000",
  "ieee application and mou": "#1677ff",
  "detailed planning": "#5500b4",
  "submission and review": "#2f74c0",
  "registration and final preparation": "#ff4d4f",
  "conference delivery": "#e87722",
  "proceedings processing": "#ff9000",
  "financial and administrative closure": "#28a000",
  closed: "#0091ff",
};

export function lifecyclePhaseColor(value?: string | null) {
  return LIFECYCLE_PHASE_COLORS[String(value ?? "").trim().toLowerCase()] ?? "#696969";
}
