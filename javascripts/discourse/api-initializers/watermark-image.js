import { setOwner } from "@ember/owner";
import { service } from "@ember/service";
import { withPluginApi } from "discourse/lib/plugin-api";
import { imageDataToFile } from "../lib/media-watermark-utils";
import UppyMediaWatermark from "../lib/uppy-media-watermark-plugin";
import Watermark from "../lib/watermark";

class WatermarkInit {
  @service currentUser;

  constructor(owner, api) {
    setOwner(this, owner);
    this.api = api;

    api.addComposerUploadPreProcessor(
      UppyMediaWatermark,
      ({ composerModel, isMobileDevice }) => {
        return {
          watermarkFn: async (file) => {
            if (owner.isDestroyed || owner.isDestroying) {
              return Promise.resolve();
            }

            if (
              !settings.watermark_image ||
              !settings.watermark_qrcode_enabled ||
              settings.watermark_qrcode_text.trim().length === 0
            ) {
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

            if (settings.watermark_groups) {
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

            const watermark = new Watermark(owner, file.data, {
              topic: {
                id: composerModel.topic.id,
                title: composerModel.topic.title,
                url: composerModel.topic.url,
              },
            });

            const imageData = await watermark.process();

            if (!imageData) {
              return Promise.resolve();
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
  }
}

export default {
  name: "discourse-watermark",

  initialize(owner) {
    withPluginApi("1.8.0", (api) => {
      this.instance = new WatermarkInit(owner, api);
    });
  },

  tearDown() {
    this.instance = null;
  },
};
