import { isImage } from "discourse/lib/uploads";

function extensionsToArray(exts) {
  return exts
    .toLowerCase()
    .replace(/[\s\.]+/g, "")
    .split("|")
    .filter((ext) => !ext.includes("*"));
}

function extensions(siteSettings) {
  return extensionsToArray(siteSettings.authorized_extensions);
}

function staffExtensions(siteSettings) {
  return extensionsToArray(siteSettings.authorized_extensions_for_staff);
}

export function imagesExtensions(staff, siteSettings) {
  let exts = extensions(siteSettings).filter((ext) => isImage(`.${ext}`));
  if (staff) {
    const staffExts = staffExtensions(siteSettings).filter((ext) =>
      isImage(`.${ext}`)
    );
    exts = exts.concat(staffExts);
  }
  return exts;
}
