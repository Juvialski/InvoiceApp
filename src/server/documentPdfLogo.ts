import { readFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";
import type { PdfImage } from "../lib/documentGeneration.ts";

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function readUint32(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function paeth(left: number, above: number, upperLeft: number) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function decodePng(bytes: Uint8Array): PdfImage | undefined {
  if (bytes.length < PNG_SIGNATURE.length || !sameBytes(bytes.subarray(0, PNG_SIGNATURE.length), PNG_SIGNATURE)) return undefined;
  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlaceMethod = 0;
  const idat: Uint8Array[] = [];
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const bodyStart = offset + 8;
    const bodyEnd = bodyStart + length;
    if (bodyEnd + 4 > bytes.length) return undefined;
    const body = bytes.subarray(bodyStart, bodyEnd);
    if (type === "IHDR") {
      if (length !== 13) return undefined;
      width = readUint32(body, 0);
      height = readUint32(body, 4);
      bitDepth = body[8];
      colorType = body[9];
      interlaceMethod = body[12];
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    offset = bodyEnd + 4;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 0 ? 1 : 0;
  if (!width || !height || bitDepth !== 8 || !channels || interlaceMethod !== 0 || idat.length === 0) return undefined;
  const compressed = new Uint8Array(idat.reduce((total, chunk) => total + chunk.length, 0));
  let compressedOffset = 0;
  for (const chunk of idat) { compressed.set(chunk, compressedOffset); compressedOffset += chunk.length; }
  let inflated: Uint8Array;
  try { inflated = new Uint8Array(inflateSync(Buffer.from(compressed))); } catch { return undefined; }
  const rowBytes = width * channels;
  const expectedLength = height * (rowBytes + 1);
  if (inflated.length < expectedLength) return undefined;
  const decoded = new Uint8Array(height * rowBytes);
  let sourceOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[sourceOffset++];
    const rowStart = row * rowBytes;
    for (let column = 0; column < rowBytes; column += 1) {
      const raw = inflated[sourceOffset++];
      const left = column >= channels ? decoded[rowStart + column - channels] : 0;
      const above = row > 0 ? decoded[rowStart - rowBytes + column] : 0;
      const upperLeft = row > 0 && column >= channels ? decoded[rowStart - rowBytes + column - channels] : 0;
      const predictor = filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : filter === 4 ? paeth(left, above, upperLeft) : 0;
      if (filter > 4) return undefined;
      decoded[rowStart + column] = (raw + predictor) & 0xff;
    }
  }
  const rgb = new Uint8Array(width * height * 3);
  let targetOffset = 0;
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const source = (row * rowBytes) + column * channels;
      const red = decoded[source];
      const green = colorType === 0 || colorType === 4 ? red : decoded[source + 1];
      const blue = colorType === 0 || colorType === 4 ? red : decoded[source + 2];
      const alpha = colorType === 6 ? decoded[source + 3] : colorType === 4 ? decoded[source + 1] : 255;
      rgb[targetOffset++] = Math.round((red * alpha + 255 * (255 - alpha)) / 255);
      rgb[targetOffset++] = Math.round((green * alpha + 255 * (255 - alpha)) / 255);
      rgb[targetOffset++] = Math.round((blue * alpha + 255 * (255 - alpha)) / 255);
    }
  }
  return { rgbBytes: rgb, width, height };
}

/** Load only deployment-local public PNG assets; never fetch an arbitrary URL. */
export async function loadServerPdfLogo(logoPath?: string | null): Promise<PdfImage | undefined> {
  const normalized = String(logoPath || "").trim();
  if (!normalized || /^https?:\/\//i.test(normalized)) return undefined;
  const relativePath = normalized.replace(/^\/+/, "");
  if (!relativePath.toLowerCase().endsWith(".png")) return undefined;
  const publicRoot = path.resolve(process.cwd(), "public");
  const filePath = path.resolve(publicRoot, relativePath);
  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${path.sep}`)) return undefined;
  try { return decodePng(new Uint8Array(await readFile(filePath))); } catch { return undefined; }
}
