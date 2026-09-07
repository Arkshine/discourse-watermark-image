export const PROFILE_CHANGED_EVENT = "watermark:profile-changed";
export const LOGO_CONFIG_CHANGED_EVENT = "watermark:logo-config-changed";

let current = null;
let currentLogoConfig = null;

export function activeProfile() {
  return current;
}

export function activeLogoConfig() {
  return currentLogoConfig;
}

export function publishActiveProfile(profile) {
  current = profile;
}

export function publishActiveLogoConfig(value) {
  currentLogoConfig = value ?? null;
}
