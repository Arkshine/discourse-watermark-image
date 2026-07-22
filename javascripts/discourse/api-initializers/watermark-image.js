import { setOwner } from "@ember/owner";
import { service } from "@ember/service";
import { AUTO_GROUPS } from "discourse/lib/constants";
import { bind } from "discourse/lib/decorators";
import { withPluginApi } from "discourse/lib/plugin-api";
import { isImage } from "discourse/lib/uploads";
import { i18n } from "discourse-i18n";
import WatermarkBlendPicker from "../components/settings/types/blend-picker";
import WatermarkChoiceSegmented from "../components/settings/types/choice-segmented";
import WatermarkColorField from "../components/settings/types/color-field";
import WatermarkPatternPicker from "../components/settings/types/pattern-picker";
import WatermarkPositionPicker from "../components/settings/types/position-picker";
import WatermarkRotationDial from "../components/settings/types/rotation-dial";
import WatermarkSlider from "../components/settings/types/slider";
import WatermarkSourceToggle from "../components/settings/types/source-toggle";
import WatermarkStepper from "../components/settings/types/stepper";
import { imageDataToFile } from "../lib/media-watermark-utils";
import { imagesExtensions } from "../lib/uploads";
import UppyMediaWatermark from "../lib/uppy-media-watermark-plugin";
import Watermark, { isImageAllowed } from "../lib/watermark";

class WatermarkInit {
  @service currentUser;

  constructor(owner, api) {
    setOwner(this, owner);
    this.api = api;

    const customControls = {
      watermark_opacity: WatermarkSlider,
      watermark_position: WatermarkPositionPicker,
      watermark_margin_x: WatermarkStepper,
      watermark_margin_y: WatermarkStepper,
      watermark_rotate: WatermarkRotationDial,
      watermark_pattern: WatermarkPatternPicker,
      watermark_blend_mode: WatermarkBlendPicker,
      watermark_size_mode: WatermarkChoiceSegmented,
      watermark_relative_width: WatermarkSlider,
      watermark_absolute_scale: WatermarkStepper,
      watermark_max_size: WatermarkSlider,
      watermark_pattern_max_count: WatermarkStepper,
      watermark_pattern_spacing: WatermarkStepper,
      watermark_qrcode_enabled: WatermarkSourceToggle,
      watermark_qrcode_color: WatermarkColorField,
      watermark_qrcode_background_color: WatermarkColorField,
      watermark_qrcode_quiet_zone: WatermarkStepper,
      watermark_qrcode_error_correction: WatermarkChoiceSegmented,
    };

    api.modifyClass(
      "component:theme-setting-editor",
      (Superclass) =>
        class extends Superclass {
          get resolvedComponent() {
            return (
              customControls[this.setting?.setting] ?? super.resolvedComponent
            );
          }
        }
    );

    api.addComposerUploadPreProcessor(
      UppyMediaWatermark,
      ({ composerModel, isMobileDevice }) => {
        return {
          watermarkFn: async (file) => {
            if (owner.isDestroyed || owner.isDestroying) {
              return null;
            }

            const fileNameLowered = file.name.toLowerCase();

            if (!isImage(fileNameLowered)) {
              return null;
            }

            if (!isImageAllowed(fileNameLowered)) {
              return null;
            }

            if (
              !settings.watermark_image &&
              !settings.watermark_qrcode_enabled
            ) {
              return null;
            }

            if (
              settings.watermark_categories &&
              !settings.watermark_categories
                .split("|")
                .map((c) => Number(c))
                .includes(composerModel.categoryId)
            ) {
              return null;
            }

            if (Object.hasOwn(settings, "user_in_watermark_groups")) {
              if (!settings.user_in_watermark_groups) {
                return null;
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
                !this.currentUser.groups
                  .map((group) => group.id)
                  .some((group) => requiredGroups.includes(group))
              ) {
                return null;
              }
            }

            let topicData = null;

            if (composerModel.topic) {
              topicData = {
                id: composerModel.topic?.id,
                title: composerModel.topic?.title,
                url: composerModel.topic?.url,
              };
            }

            const watermark = new Watermark(owner, file.data, {
              topic: topicData,
            });

            const imageData = await watermark.process();

            if (!imageData) {
              return null;
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

    if (!settings.watermark_allow_non_supported_uploads) {
      api.modifyClass(
        "component:composer-editor",
        (Superclass) =>
          class extends Superclass {
            @service dialog;
            @service currentUser;
            @service siteSettings;

            @bind
            setupEditor(textManipulation) {
              const result = super.setupEditor(textManipulation);

              const { uppyInstance } = this.uppyComposerUpload.uppyWrapper;
              const originalHandler = uppyInstance.opts.onBeforeFileAdded;
              uppyInstance.opts.onBeforeFileAdded = (currentFile) => {
                if (
                  originalHandler &&
                  isImage(currentFile.name.toLowerCase())
                ) {
                  const {
                    pattern: regexPattern,
                    extensions: commonExtensions,
                  } = Watermark.getExtensionsRegex(
                    imagesExtensions(this.currentUser?.staff, this.siteSettings)
                  );

                  if (!regexPattern.test(currentFile.type)) {
                    this.dialog.alert(
                      i18n(
                        themePrefix("composer.errors.upload_not_authorized"),
                        {
                          authorized_extensions: commonExtensions.join(", "),
                        }
                      )
                    );
                    return false;
                  }
                }

                return originalHandler;
              };

              return result;
            }
          }
      );
    }
  }
}

export default {
  name: "discourse-watermark",

  initialize(owner) {
    withPluginApi("1.38.0", (api) => {
      this.instance = new WatermarkInit(owner, api);
    });
  },

  tearDown() {
    this.instance = null;
  },
};
