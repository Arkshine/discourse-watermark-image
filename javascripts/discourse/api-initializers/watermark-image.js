import { setOwner } from "@ember/owner";
import { service } from "@ember/service";
import { withPluginApi } from "discourse/lib/plugin-api";
import { imageDataToFile } from "../lib/media-watermark-utils";
import UppyMediaWatermark from "../lib/uppy-media-watermark-plugin";
import Watermark from "../lib/watermark";

class WatermarkInit {
  @service currentUser;

  constructor(owner) {
    setOwner(this, owner);

    withPluginApi("1.8.0", (api) => {
      api.addComposerUploadPreProcessor(
        UppyMediaWatermark,
        ({ composerModel, isMobileDevice }) => {
          return {
            watermarkFn: async (file) => {
              if (owner.isDestroyed || owner.isDestroying) {
                return Promise.resolve();
              }

              if (
                settings.watermark_categories &&
                !settings.watermark_categories
                  .split("|")
                  .map((c) => Number(c))
                  .includes(composerModel.categoryId)
              ) {
                return Promise.resolve();
              }

              if (settings.watermark_groups.length > 0) {
                const requiredGroups = settings.watermark_groups
                  .split("|")
                  .map((g) => Number(g));

                if (
                  !requiredGroups.includes(0) &&
                  !this.currentUser.groups
                    .map((group) => group.id)
                    .some((group) => requiredGroups.includes(group))
                ) {
                  return Promise.resolve();
                }
              }

              const watermark = new Watermark(file.data);
              const imageData = await watermark.sendToWorker();

              if (!imageData) {
                return Promise.resolve(file.data);
              }

              const watermarkFile = await imageDataToFile(imageData, {
                fileName: file.name,
                fileType: file.type,
              });

              return Promise.resolve(watermarkFile);
            },
            runParallel: !isMobileDevice,
          };
        }
      );
    });
  }
}

export default {
  name: "discourse-watermark",

  initialize(owner) {
    this.instance = new WatermarkInit(owner);
  },

  tearDown() {
    this.instance = null;
  },
};
