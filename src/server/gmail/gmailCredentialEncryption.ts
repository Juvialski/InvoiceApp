import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const GMAIL_CREDENTIAL_ENCRYPTION_VERSION = 1;

const AES_ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const CREDENTIAL_AAD_PREFIX = "invoiceapp:gmail-provider:";

export interface EncryptedGoogleRefreshToken {
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
  readonly encryptionVersion: number;
}

export class GmailCredentialError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 503) {
    super(message);
    this.name = "GmailCredentialError";
    this.code = code;
    this.status = status;
  }
}

function strictBase64(value: unknown, expectedBytes?: number): Buffer {
  if (typeof value !== "string" || !value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error("invalid envelope encoding");
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value || (expectedBytes !== undefined && decoded.length !== expectedBytes)) throw new Error("invalid envelope encoding");
  return decoded;
}

function scopePart(value: string, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > 200 || /[\u0000-\u001f\u007f]/.test(normalized)) throw new GmailCredentialError("GMAIL_CREDENTIAL_INVALID", `A valid Gmail ${label} is required.`, 400);
  return normalized;
}

function normalizedRefreshToken(value: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > 4096 || /[\u0000-\u001f\u007f]/.test(normalized)) throw new GmailCredentialError("GMAIL_REFRESH_TOKEN_INVALID", "A valid Google refresh token is required.", 400);
  return normalized;
}

function configurationError() {
  return new GmailCredentialError("GMAIL_CREDENTIALS_SERVER_MISCONFIGURED", "Gmail credential encryption is not configured for this deployment.");
}

export function readGmailCredentialsMasterKey(environment: Record<string, string | undefined> = process.env): Buffer {
  const encoded = environment.GMAIL_CREDENTIALS_MASTER_KEY?.trim();
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) throw configurationError();
  let decoded: Buffer;
  try { decoded = strictBase64(encoded); } catch { throw configurationError(); }
  if (decoded.length !== 32) throw configurationError();
  return decoded;
}

function operationKey(masterKey: Buffer | undefined) {
  const key = masterKey === undefined ? readGmailCredentialsMasterKey() : masterKey;
  if (!Buffer.isBuffer(key) || key.length !== 32) throw configurationError();
  return key;
}

function aad(companyId: string, userId: string) {
  return Buffer.from(`${CREDENTIAL_AAD_PREFIX}${scopePart(companyId, "company")}:${scopePart(userId, "user")}:v${GMAIL_CREDENTIAL_ENCRYPTION_VERSION}`, "utf8");
}

export function encryptGoogleRefreshToken(
  refreshToken: string,
  companyId: string,
  userId: string,
  masterKey?: Buffer,
): EncryptedGoogleRefreshToken {
  const plaintext = Buffer.from(normalizedRefreshToken(refreshToken), "utf8");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, operationKey(masterKey), iv);
  cipher.setAAD(aad(companyId, userId));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    encryptionVersion: GMAIL_CREDENTIAL_ENCRYPTION_VERSION,
  };
}

export function decryptGoogleRefreshToken(
  envelope: EncryptedGoogleRefreshToken,
  companyId: string,
  userId: string,
  masterKey?: Buffer,
): string {
  if (!envelope || envelope.encryptionVersion !== GMAIL_CREDENTIAL_ENCRYPTION_VERSION) throw new GmailCredentialError("GMAIL_CREDENTIAL_ENCRYPTION_UNSUPPORTED", "The stored Gmail authorization uses an unsupported encryption version.");
  const key = operationKey(masterKey);
  try {
    const iv = strictBase64(envelope.iv, IV_BYTES);
    const authTag = strictBase64(envelope.authTag, AUTH_TAG_BYTES);
    const ciphertext = strictBase64(envelope.ciphertext);
    if (!ciphertext.length) throw new Error("empty credential");
    const decipher = createDecipheriv(AES_ALGORITHM, key, iv);
    decipher.setAAD(aad(companyId, userId));
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8").trim();
    if (!plaintext) throw new Error("empty credential");
    return normalizedRefreshToken(plaintext);
  } catch {
    throw new GmailCredentialError("GMAIL_CREDENTIAL_UNAVAILABLE", "The stored Gmail authorization could not be opened safely.");
  }
}
