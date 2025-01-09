/* eslint-disable no-console */
/* eslint-disable no-undef */

let promiseQrCode;

async function handleMessage(event) {
  const action = event.data.action;

  if (action === "load") {
    const { url, wasmUrl } = event.data;
    importScripts(url);
    promiseQrCode = __wbg_init({ module_or_path: wasmUrl });
  } else if (action === "generate") {
    await promiseQrCode;
    generateQrCode(event);
  }
}

onmessage = handleMessage;

async function generateQrCode(event) {
  const {
    seq,
    qrcode_text,
    qrcode_color,
    qrcode_background_color,
    qrcode_quiet_zone,
    qrcode_error_correction,
  } = event.data;

  try {
    const qr = new WasmQrCode();
    qr.generate(
      qrcode_text,
      qrcode_error_correction,
      1 /* minimum version */,
      40 /* maximum version */,
      null /* automatic mask */,
      true /* boost error level correction */
    );

    const pngData = qr.to_png(
      qrcode_color,
      qrcode_background_color,
      qrcode_quiet_zone
    );

    postMessage(
      {
        incomingSeq: seq,
        data: {
          buffer: pngData.buffer,
        },
      },
      [pngData.buffer]
    );
  } catch (error) {
    console.warn(error);

    postMessage({
      incomingSeq: seq,
      error: error.toString(),
    });
  }
}
