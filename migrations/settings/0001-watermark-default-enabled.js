export default function migrate(settings) {
  const hasImage = !!settings.get("watermark_image");
  const qrcode = settings.get("watermark_qrcode_enabled");
  const hasQrcode = qrcode === true || qrcode === "true";

  if (hasImage || hasQrcode) {
    settings.set("watermark_default_enabled", true);
  }

  return settings;
}
