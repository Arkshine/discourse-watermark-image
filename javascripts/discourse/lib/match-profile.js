import { AUTO_GROUPS } from "discourse/lib/constants";

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
