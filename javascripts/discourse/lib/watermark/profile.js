import { AUTO_GROUPS } from "discourse/lib/constants";
import {
  matchProfiles,
  PROFILE_META_KEYS,
  resolveComposerTags,
} from "../match-profile";

export const PROFILE_CONFIG_KEYS = [
  "source",
  "qrcode_text",
  "qrcode_color",
  "qrcode_background_color",
  "qrcode_quiet_zone",
  "qrcode_error_correction",
  "qrcode_style_config",
  "qrcode_halftone_image",
  "qrcode_logo_config",
  "qrcode_logo_image",
  "text",
  "text_style",
  "position",
  "margin_x",
  "margin_y",
  "opacity",
  "size_mode",
  "relative_width",
  "absolute_scale",
  "max_size",
  "rotate",
  "pattern",
  "pattern_allow_partial",
  "pattern_max_count",
  "pattern_spacing",
  "blend_mode",
];

export function profileToOverwriteOptions(profile) {
  const options = {};

  if (profile) {
    for (const [key, value] of Object.entries(profile)) {
      if (PROFILE_META_KEYS.has(key) || value === "" || value == null) {
        continue;
      }

      options[`watermark_${key}`] = value;
    }
  }

  return options;
}

export function buildTopicData(composerModel) {
  if (!composerModel.topic) {
    return null;
  }

  return {
    id: composerModel.topic?.id,
    title: composerModel.topic?.title,
    url: composerModel.topic?.url,
  };
}

export function matchingProfileNames(composerModel, currentUser) {
  return matchProfiles(
    settings.watermark_profiles,
    composerModel,
    currentUser
  ).map((profile) => profile.name);
}

export function resolveProfile(
  composerModel,
  currentUser,
  { profileName } = {}
) {
  const matches = matchProfiles(
    settings.watermark_profiles,
    composerModel,
    currentUser
  );
  const profile =
    (profileName && matches.find((match) => match.name === profileName)) ||
    matches[0] ||
    null;
  const overwriteOptions = profileToOverwriteOptions(profile);
  const merged = { ...settings, ...overwriteOptions };
  const source = merged.watermark_source;

  if (
    (source === "image" && !merged.watermark_image) ||
    (source === "text" && !merged.watermark_text)
  ) {
    return { apply: false, overwriteOptions, profile };
  }

  if (!profile) {
    if (!settings.watermark_default_enabled) {
      return { apply: false, overwriteOptions, profile };
    }

    if (
      settings.watermark_categories &&
      !settings.watermark_categories
        .split("|")
        .map((c) => Number(c))
        .includes(composerModel.categoryId)
    ) {
      return { apply: false, overwriteOptions, profile };
    }

    if (settings.watermark_tags) {
      const requiredTags = settings.watermark_tags.split("|").filter(Boolean);

      if (
        requiredTags.length &&
        !resolveComposerTags(composerModel).some((slug) =>
          requiredTags.includes(slug)
        )
      ) {
        return { apply: false, overwriteOptions, profile };
      }
    }

    if (Object.hasOwn(settings, "user_in_watermark_groups")) {
      if (!settings.user_in_watermark_groups) {
        return { apply: false, overwriteOptions, profile };
      }
    }
    // DEPRECATED: Once user_in_ is fully supported, remove this.
    else if (settings.watermark_groups?.length) {
      const requiredGroups = settings.watermark_groups
        .split("|")
        .filter(Boolean)
        .map((group) => Number(group));

      if (
        !requiredGroups.includes(AUTO_GROUPS.everyone.id) &&
        !currentUser.groups
          .map((group) => group.id)
          .some((group) => requiredGroups.includes(group))
      ) {
        return { apply: false, overwriteOptions, profile };
      }
    }
  }

  return { apply: true, overwriteOptions, profile };
}

export function profileSignature(resolved) {
  return resolved.apply ? JSON.stringify(resolved.overwriteOptions) : "none";
}
