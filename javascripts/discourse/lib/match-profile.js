import { AUTO_GROUPS } from "discourse/lib/constants";

export const PROFILE_META_KEYS = new Set([
  "name",
  "enabled",
  "categories",
  "groups",
  "user_in_groups",
  "tags",
]);

export function resolveComposerTags(composerModel) {
  const tags = composerModel.tags?.length
    ? composerModel.tags
    : (composerModel.topic?.tags ?? []);

  return tags.map((tag) => (typeof tag === "string" ? tag : tag.slug));
}

export default function matchProfile(profiles, composerModel, currentUser) {
  if (!Array.isArray(profiles)) {
    return null;
  }

  return (
    profiles.find((profile) => {
      if (!profile.enabled) {
        return false;
      }

      const categories = profile.categories ?? [];

      if (categories.length && !categories.includes(composerModel.categoryId)) {
        return false;
      }

      const tags = profile.tags ?? [];

      if (
        tags.length &&
        !resolveComposerTags(composerModel).some((slug) => tags.includes(slug))
      ) {
        return false;
      }

      if (Object.hasOwn(profile, "user_in_groups")) {
        if (!profile.user_in_groups) {
          return false;
        }
      }
      // DEPRECATED: Once user_in_ is fully supported, remove this.
      else if (profile.groups?.length) {
        const requiredGroups = profile.groups
          .split("|")
          .filter(Boolean)
          .map((group) => Number(group));

        if (
          !requiredGroups.includes(AUTO_GROUPS.everyone.id) &&
          !currentUser.groups
            .map((group) => group.id)
            .some((group) => requiredGroups.includes(group))
        ) {
          return false;
        }
      }

      return true;
    }) ?? null
  );
}
