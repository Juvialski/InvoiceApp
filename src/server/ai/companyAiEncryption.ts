import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { COMPANY_AI_ENCRYPTION_VERSION, CompanyAiError } from "./companyAiTypes.ts";

const AES_ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const CREDENTIAL_AAD_PREFIX = "invoiceapp:company-ai:";

function misconfiguredMasterKey(): CompanyAiError {
  return new CompanyAiError("AI_CREDENTIALS_SERVER_MISCONFIGURED", "AI credential encryption is not configured on the server.", 503);
}

function normalizedCompanyId(value: string) {
  const companyId = typeof value === "string" ? value.trim() : "";
  if (!companyId) throw new CompanyAiError("AI_CREDENTIAL_INVALID", "A company context is required for the AI credential.", 400);
  return companyId;
}

function strictBase64(value: unknown, expectedBytes?: number): Buffer {
  if (typeof value !== "string" || !value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error("invalid credential envelope encoding");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value || (expectedBytes !== undefined && decoded.length !== expectedBytes)) {
    throw new Error("invalid credential envelope encoding");
  }
  return decoded;
}

export interface EncryptedCompanyCredential {
  ciphertext: string;
  iv: string;
  authTag: string;
  encryptionVersion: number;
}

export function readAiCredentialsMasterKey(environment: NodeJS.ProcessEnv = process.env): Buffer {
  const encoded = environment.AI_CREDENTIALS_MASTER_KEY?.trim();
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) throw misconfiguredMasterKey();
  let key: Buffer;
  try {
    key = strictBase64(encoded);
  } catch {
    throw misconfiguredMasterKey();
  }
  if (key.length !== 32) throw misconfiguredMasterKey();
  return key;
}

function keyForOperation(masterKey?: Buffer) {
  const key = masterKey === undefined ? readAiCredentialsMasterKey() : masterKey;
  if (!Buffer.isBuffer(key) || key.length !== 32) throw misconfiguredMasterKey();
  return key;
}

function aadForCompany(companyId: string, encryptionVersion: number) {
  return Buffer.from(`${CREDENTIAL_AAD_PREFIX}${companyId}:v${encryptionVersion}`, "utf8");
}

function normalizedKey(value: string) {
  const key = value.trim();
  if (!key) throw new CompanyAiError("AI_CREDENTIAL_INVALID", "A Gemini API key is required.", 400);
  return key;
}

export function credentialLast4(apiKey: string) {
  return normalizedKey(apiKey).slice(-4);
}

export function encryptCompanyGeminiCredential(apiKey: string, companyId: string, masterKey?: Buffer): EncryptedCompanyCredential {
  const plaintext = Buffer.from(normalizedKey(apiKey), "utf8");
  const normalizedCompany = normalizedCompanyId(companyId);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, keyForOperation(masterKey), iv);
  cipher.setAAD(aadForCompany(normalizedCompany, COMPANY_AI_ENCRYPTION_VERSION));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    encryptionVersion: COMPANY_AI_ENCRYPTION_VERSION,
  };
}

export function decryptCompanyGeminiCredential(envelope: EncryptedCompanyCredential, companyId: string, masterKey?: Buffer): string {
  if (!envelope || envelope.encryptionVersion !== COMPANY_AI_ENCRYPTION_VERSION) throw new CompanyAiError("AI_CREDENTIAL_ENCRYPTION_UNSUPPORTED", "The company AI credential uses an unsupported encryption version.", 503);
  const normalizedCompany = normalizedCompanyId(companyId);
  // Keep deployment misconfiguration distinguishable from a corrupt or
  // tampered envelope. Both remain safe, static API errors.
  const key = keyForOperation(masterKey);
  try {
    const iv = strictBase64(envelope.iv, IV_BYTES);
    const authTag = strictBase64(envelope.authTag, AUTH_TAG_BYTES);
    const ciphertext = strictBase64(envelope.ciphertext);
    if (!ciphertext.length) throw new Error("empty credential envelope");
    const decipher = createDecipheriv(AES_ALGORITHM, key, iv);
    decipher.setAAD(aadForCompany(normalizedCompany, envelope.encryptionVersion));
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8").trim();
    if (!plaintext) throw new Error("empty credential");
    return plaintext;
  } catch {
    throw new CompanyAiError("AI_CREDENTIAL_UNAVAILABLE", "The company AI credential could not be opened safely.", 503);
  }
}
