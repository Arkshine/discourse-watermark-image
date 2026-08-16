export const LOGO_DEFAULTS = {
  enabled: false,
  source: "icon",
  icon: "star",
  color: "",
  size: 20,
  padding: 0,
  background: false,
  transparentBackground: true,
  showDataBehind: false,
};

export const LOGO_SIZE = { min: 5, max: 40, step: 1 };
export const LOGO_PADDING = { min: 0, max: 25, step: 1 };

const EC_BUDGET = { Low: 0.07, Medium: 0.15, Quarter: 0.25, High: 0.3 };

export const MAX_ERROR_CORRECTION = "High";

export function logoExceedsErrorCorrection(size, errorCorrection) {
  const budget = EC_BUDGET[errorCorrection] ?? EC_BUDGET.Medium;
  return (size / 100) ** 2 > budget / 2;
}

export function parseLogoConfig(raw) {
  if (!raw) {
    return { ...LOGO_DEFAULTS };
  }

  try {
    const cfg = typeof raw === "string" ? JSON.parse(raw) : raw;
    return { ...LOGO_DEFAULTS, ...(cfg ?? {}) };
  } catch {
    return { ...LOGO_DEFAULTS };
  }
}

export function stringifyLogoConfig(config) {
  return JSON.stringify(config);
}
