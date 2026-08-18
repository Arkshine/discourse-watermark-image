function sourceFromLegacy(qrcodeEnabled) {
  return qrcodeEnabled === true || qrcodeEnabled === "true"
    ? "qrcode"
    : "image";
}

export default function migrate(settings) {
  if (settings.has("watermark_qrcode_enabled")) {
    settings.set(
      "watermark_source",
      sourceFromLegacy(settings.get("watermark_qrcode_enabled"))
    );
    settings.delete("watermark_qrcode_enabled");
  }

  if (settings.has("watermark_profiles")) {
    const profiles = settings.get("watermark_profiles").map((profile) => {
      if (!Object.hasOwn(profile, "qrcode_enabled")) {
        return profile;
      }

      const { qrcode_enabled, ...rest } = profile;
      return { ...rest, source: sourceFromLegacy(qrcode_enabled) };
    });

    settings.set("watermark_profiles", profiles);
  }

  return settings;
}
