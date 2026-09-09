import QRCode from "qrcode";

export async function makeQrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#071018", light: "#e7eef2" },
  });
}
