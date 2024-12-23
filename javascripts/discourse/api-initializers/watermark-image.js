import { setOwner } from "@ember/owner";
import { withPluginApi } from "discourse/lib/plugin-api";
import { imageDataToFile } from "../lib/media-watermark-utils";
import UppyMediaWatermark from "../lib/uppy-media-watermark-plugin";
import Watermark from "../lib/watermark";

class WatermarkInit {
  constructor(owner) {
    setOwner(this, owner);

    withPluginApi("1.8.0", (api) => {
      api.addComposerUploadPreProcessor(
        UppyMediaWatermark,
        ({ isMobileDevice }) => {
          return {
            watermarkFn: async (file) => {
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
