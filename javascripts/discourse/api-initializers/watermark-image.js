import { action } from "@ember/object";
import { setOwner } from "@ember/owner";
import { service } from "@ember/service";
import { AUTO_GROUPS } from "discourse/lib/constants";
import { bind } from "discourse/lib/decorators";
import { withPluginApi } from "discourse/lib/plugin-api";
import { isImage } from "discourse/lib/uploads";
import { i18n } from "discourse-i18n";
import SchemaFieldControl, {
  SCHEMA_CONTROLS,
} from "../components/settings/schema-field-control";
import WatermarkBlendPicker from "../components/settings/types/blend-picker";
import WatermarkChoiceSegmented from "../components/settings/types/choice-segmented";
import WatermarkColorField from "../components/settings/types/color-field";
import WatermarkPatternPicker from "../components/settings/types/pattern-picker";
import WatermarkPositionPicker from "../components/settings/types/position-picker";
import WatermarkQrLogo from "../components/settings/types/qr-logo";
import WatermarkQrStyle from "../components/settings/types/qr-style";
import WatermarkRotationDial from "../components/settings/types/rotation-dial";
import WatermarkSlider from "../components/settings/types/slider";
import WatermarkSourceToggle from "../components/settings/types/source-toggle";
import WatermarkStepper from "../components/settings/types/stepper";
import WatermarkSwitch from "../components/settings/types/switch";
import WatermarkTextStyle from "../components/settings/types/text-style";
import WatermarkTextarea from "../components/settings/types/textarea";
import matchProfile, {
  PROFILE_META_KEYS,
  resolveComposerTags,
} from "../lib/match-profile";
import { imageDataToFile } from "../lib/media-watermark-utils";
import { imagesExtensions } from "../lib/uploads";
import UppyMediaWatermark from "../lib/uppy-media-watermark-plugin";
import Watermark, { isImageAllowed } from "../lib/watermark";
import {
  LOGO_CONFIG_CHANGED_EVENT,
  PROFILE_CHANGED_EVENT,
  publishActiveLogoConfig,
  publishActiveProfile,
} from "../lib/watermark/active-state";

const PROFILE_CONFIG_KEYS = [
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

function flatProfileSeed() {
  const seed = { enabled: true, groups: [AUTO_GROUPS.logged_in_users.id] };

  for (const key of PROFILE_CONFIG_KEYS) {
    seed[key] = settings[`watermark_${key}`];
  }

  return seed;
}

function profileToOverwriteOptions(profile) {
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

class WatermarkInit {
  @service currentUser;

  constructor(owner, api) {
    setOwner(this, owner);
    this.api = api;

    const customControls = {
      watermark_default_enabled: WatermarkSwitch,
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
      watermark_source: WatermarkSourceToggle,
      watermark_qrcode_color: WatermarkColorField,
      watermark_qrcode_background_color: WatermarkColorField,
      watermark_qrcode_quiet_zone: WatermarkStepper,
      watermark_qrcode_error_correction: WatermarkChoiceSegmented,
      watermark_qrcode_style_config: WatermarkQrStyle,
      watermark_qrcode_logo_config: WatermarkQrLogo,
      watermark_text: WatermarkTextarea,
      watermark_text_style: WatermarkTextStyle,
    };

    const customLabels = {
      watermark_source: "Watermark source",
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

          get settingName() {
            return customLabels[this.setting?.setting] ?? super.settingName;
          }
        }
    );

    api.modifyClass(
      "component:schema-setting/field",
      (Superclass) =>
        class extends Superclass {
          get component() {
            if (
              this.args.setting?.setting === "watermark_profiles" &&
              SCHEMA_CONTROLS[this.args.name]
            ) {
              return SchemaFieldControl;
            }

            return super.component;
          }
        }
    );

    api.modifyClass(
      "component:schema-setting/editor",
      (Superclass) =>
        class extends Superclass {
          @service appEvents;

          constructor() {
            super(...arguments);
            this.publishWatermarkProfile();
          }

          @action
          inputFieldChanged(field, newVal) {
            const result = super.inputFieldChanged(field, newVal);
            this.publishWatermarkProfile();
            return result;
          }

          @action
          updateIndex(index) {
            const result = super.updateIndex(index);
            this.publishWatermarkProfile();
            return result;
          }

          @action
          addItem() {
            const result = super.addItem();
            if (this.args.setting?.setting === "watermark_profiles") {
              Object.assign(
                this.activeData[this.activeIndex],
                flatProfileSeed()
              );
              this.publishWatermarkProfile();
            }
            return result;
          }

          @action
          async removeItem() {
            const result = await super.removeItem();
            this.publishWatermarkProfile();
            return result;
          }

          publishWatermarkProfile() {
            if (this.args.setting?.setting === "watermark_profiles") {
              const profile = this.activeData?.[this.activeIndex];
              publishActiveProfile(profile);
              this.appEvents.trigger(PROFILE_CHANGED_EVENT, profile);

              publishActiveLogoConfig(profile?.qrcode_logo_config);
              this.appEvents.trigger(
                LOGO_CONFIG_CHANGED_EVENT,
                profile?.qrcode_logo_config
              );
            }
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

            const profile = matchProfile(
              settings.watermark_profiles,
              composerModel,
              api.getCurrentUser()
            );

            const overwriteOptions = profileToOverwriteOptions(profile);
            const merged = { ...settings, ...overwriteOptions };

            const source = merged.watermark_source;

            if (
              (source === "image" && !merged.watermark_image) ||
              (source === "text" && !merged.watermark_text)
            ) {
              return null;
            }

            if (!profile) {
              if (!settings.watermark_default_enabled) {
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

              if (settings.watermark_tags) {
                const requiredTags = settings.watermark_tags
                  .split("|")
                  .filter(Boolean);

                if (
                  requiredTags.length &&
                  !resolveComposerTags(composerModel).some((slug) =>
                    requiredTags.includes(slug)
                  )
                ) {
                  return null;
                }
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
              overwriteOptions,
            });

            const { data: imageData } = await watermark.process();

            if (!imageData) {
              return null;
            }

            const watermarkFile = await imageDataToFile(imageData, {
              fileName: file.name,
              fileType: file.type,
            });

            return Promise.resolve(watermarkFile);
          },
          allowUploadOnError: settings.watermark_allow_upload_on_error,
          errorMessage: i18n(themePrefix("composer.errors.watermark_failed")),
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
    withPluginApi((api) => {
      this.instance = new WatermarkInit(owner, api);
    });
  },

  tearDown() {
    this.instance = null;
  },
};
