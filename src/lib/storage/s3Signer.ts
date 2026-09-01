/**
 * Lightweight dependency-free AWS SigV4 signer and presigned URL generator.
 * Designed for Cloudflare R2, MinIO, and standard S3-compatible private storage.
 */

import { calculateSha256Hex } from "./dedup.ts";

export interface AwsSigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  service?: string;
}

export interface SignRequestOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  bodyBytes?: Uint8Array;
  credentials: AwsSigV4Credentials;
  timestamp?: Date;
}

export interface PresignUrlOptions {
  method?: string;
  url: string;
  credentials: AwsSigV4Credentials;
  expiresInSeconds?: number;
  headers?: Record<string, string>;
  timestamp?: Date;
}

/**
 * Perform HMAC-SHA256 calculation using Web Crypto API or Node crypto fallback.
 */
async function hmacSha256(key: Uint8Array | string, message: string | Uint8Array): Promise<Uint8Array> {
  const messageBytes = typeof message === "string" ? new TextEncoder().encode(message) : message;

  if (typeof globalThis.crypto?.subtle !== "undefined") {
    const rawKey = typeof key === "string" ? new TextEncoder().encode(key) : key;
    // Safe buffer copy to prevent detached array issues
    const keyBuf = rawKey.buffer.slice(rawKey.byteOffset, rawKey.byteOffset + rawKey.byteLength) as ArrayBuffer;
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      "raw",
      keyBuf,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const msgBuf = messageBytes.buffer.slice(messageBytes.byteOffset, messageBytes.byteOffset + messageBytes.byteLength) as ArrayBuffer;
    const signature = await globalThis.crypto.subtle.sign("HMAC", cryptoKey, msgBuf);
    return new Uint8Array(signature);
  }

  // Node fallback
  const nodeCrypto = await import("node:crypto");
  const hmac = nodeCrypto.createHmac("sha256", typeof key === "string" ? key : Buffer.from(key));
  hmac.update(messageBytes);
  return new Uint8Array(hmac.digest());
}

/**
 * Convert byte array to lowercase hexadecimal string.
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Format Date to ISO 8601 basic format: YYYYMMDDTHHMMSSZ.
 */
function toAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());

  const dateStamp = `${year}${month}${day}`;
  const amzDate = `${dateStamp}T${hours}${minutes}${seconds}Z`;
  return { amzDate, dateStamp };
}

/**
 * RFC 3986 URI encoding.
 */
function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * URI encode path components preserving slashes.
 */
function encodeUriPath(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}

/**
 * Derive the SigV4 signing key:
 * kDate = HMAC("AWS4" + secretKey, dateStamp)
 * kRegion = HMAC(kDate, region)
 * kService = HMAC(kRegion, service)
 * kSigning = HMAC(kService, "aws4_request")
 */
async function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service = "s3",
): Promise<Uint8Array> {
  const kDate = await hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

/**
 * Canonical query string generator: query parameters sorted alphabetically by key then value.
 */
function buildCanonicalQueryString(searchParams: URLSearchParams): string {
  const entries: [string, string][] = [];
  searchParams.forEach((value, key) => {
    entries.push([key, value]);
  });

  entries.sort((a, b) => {
    const keyCompare = encodeRfc3986(a[0]).localeCompare(encodeRfc3986(b[0]));
    if (keyCompare !== 0) return keyCompare;
    return encodeRfc3986(a[1]).localeCompare(encodeRfc3986(b[1]));
  });

  return entries
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
}

/**
 * Sign an HTTP request using AWS SigV4 authorization header.
 */
export async function signS3Request(options: SignRequestOptions): Promise<{
  url: string;
  headers: Record<string, string>;
}> {
  const parsedUrl = new URL(options.url);
  const region = options.credentials.region || "auto";
  const service = options.credentials.service || "s3";
  const now = options.timestamp || new Date();
  const { amzDate, dateStamp } = toAmzDate(now);

  const payloadHash = options.bodyBytes
    ? await calculateSha256Hex(options.bodyBytes)
    : "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // Empty hash

  const headersToSign: Record<string, string> = {
    host: parsedUrl.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    ...(options.headers || {}),
  };

  // Canonical headers
  const sortedHeaderKeys = Object.keys(headersToSign)
    .map((k) => k.toLowerCase())
    .sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((key) => `${key}:${headersToSign[key].trim().replace(/\s+/g, " ")}\n`)
    .join("");
  const signedHeaders = sortedHeaderKeys.join(";");

  // Canonical request
  const canonicalUri = encodeUriPath(parsedUrl.pathname) || "/";
  const canonicalQuery = buildCanonicalQueryString(parsedUrl.searchParams);
  const canonicalRequest = [
    options.method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  // String to sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = await calculateSha256Hex(new TextEncoder().encode(canonicalRequest));
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join("\n");

  // Signing key & signature
  const signingKey = await getSigningKey(options.credentials.secretAccessKey, dateStamp, region, service);
  const signatureBytes = await hmacSha256(signingKey, stringToSign);
  const signatureHex = bytesToHex(signatureBytes);

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${options.credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signatureHex}`;

  return {
    url: parsedUrl.toString(),
    headers: {
      ...headersToSign,
      authorization: authorizationHeader,
    },
  };
}

/**
 * Generate a pre-signed URL for direct GET/HEAD access.
 */
export async function createPresignedS3Url(options: PresignUrlOptions): Promise<string> {
  const parsedUrl = new URL(options.url);
  const method = (options.method || "GET").toUpperCase();
  const region = options.credentials.region || "auto";
  const service = options.credentials.service || "s3";
  const now = options.timestamp || new Date();
  const { amzDate, dateStamp } = toAmzDate(now);
  const expiresIn = options.expiresInSeconds || 3600;

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const searchParams = parsedUrl.searchParams;
  searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  searchParams.set("X-Amz-Credential", `${options.credentials.accessKeyId}/${credentialScope}`);
  searchParams.set("X-Amz-Date", amzDate);
  searchParams.set("X-Amz-Expires", String(expiresIn));

  // Canonical headers (host is always signed)
  const headersToSign: Record<string, string> = {
    host: parsedUrl.host,
    ...(options.headers || {}),
  };
  const sortedHeaderKeys = Object.keys(headersToSign)
    .map((k) => k.toLowerCase())
    .sort();
  const signedHeaders = sortedHeaderKeys.join(";");
  searchParams.set("X-Amz-SignedHeaders", signedHeaders);

  const canonicalHeaders = sortedHeaderKeys
    .map((key) => `${key}:${headersToSign[key].trim().replace(/\s+/g, " ")}\n`)
    .join("");

  const canonicalUri = encodeUriPath(parsedUrl.pathname) || "/";
  const canonicalQuery = buildCanonicalQueryString(searchParams);
  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const canonicalRequestHash = await calculateSha256Hex(new TextEncoder().encode(canonicalRequest));
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join("\n");

  const signingKey = await getSigningKey(options.credentials.secretAccessKey, dateStamp, region, service);
  const signatureBytes = await hmacSha256(signingKey, stringToSign);
  const signatureHex = bytesToHex(signatureBytes);

  searchParams.set("X-Amz-Signature", signatureHex);

  return parsedUrl.toString();
}
