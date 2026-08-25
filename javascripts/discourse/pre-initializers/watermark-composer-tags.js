import { getOwner } from "@ember/owner";
import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "watermark-composer-tags",

  before: "inject-discourse-objects",

  initialize() {
    withPluginApi((api) => {
      api.addModelAccessor("composer", "tags", {
        get() {
          return this._watermarkTags;
        },

        set(value) {
          const changed =
            JSON.stringify(this._watermarkTags) !== JSON.stringify(value);
          this._watermarkTags = value;

          if (changed) {
            getOwner(this).lookup("service:watermark-reprocess").recheck(this);
          }
        },
      });
    });
  },
};
