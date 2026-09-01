import crypto from "node:crypto";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import {
  DecryptionAuthenticationError,
  InvalidBackupHeaderError,
  InvalidEncryptionKeyError,
  KeyIdMismatchError,
} from "./types.ts";

export const BACKUP_HEADER_MAGIC = "ENGORYX_ENC_DB_V1";
export const BACKUP_HEADER_MAGIC_BUFFER = Buffer.from(BACKUP_HEADER_MAGIC, "utf-8");
export const GCM_IV_LENGTH_BYTES = 12; // 96 bits standard for AES-GCM
export const GCM_AUTH_TAG_LENGTH_BYTES = 16; // 128 bits standard for AES-GCM
export const AES_256_KEY_LENGTH_BYTES = 32; // 256 bits

/**
 * Validates and normalizes an AES-256 (32-byte / 256-bit) encryption key from Hex, Base64, or raw Buffer.
 * Strictly enforces length and format. NEVER includes key material in error messages.
 */
export function validateEncryptionKey(keyInput: string | Buffer): Buffer {
  if (!keyInput) {
    throw new InvalidEncryptionKeyError("Encryption key cannot be empty.");
  }

  if (Buffer.isBuffer(keyInput)) {
    if (keyInput.length !== AES_256_KEY_LENGTH_BYTES) {
      throw new InvalidEncryptionKeyError(
        `Invalid encryption key length: expected ${AES_256_KEY_LENGTH_BYTES} bytes (256-bit), got ${keyInput.length} bytes.`,
      );
    }
    return keyInput;
  }

  if (typeof keyInput !== "string") {
    throw new InvalidEncryptionKeyError("Encryption key must be a string or Buffer.");
  }

  const trimmed = keyInput.trim();
  if (!trimmed) {
    throw new InvalidEncryptionKeyError("Encryption key cannot be empty.");
  }

  // 1. Check for 64-char Hex (32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  // 2. Check for Base64 (32 bytes = 44 chars with standard padding)
  if (/^[A-Za-z0-9+/]{42,43}={0,2}$/.test(trimmed)) {
    const b64Buf = Buffer.from(trimmed, "base64");
    if (b64Buf.length === AES_256_KEY_LENGTH_BYTES) {
      return b64Buf;
    }
  }

  // 3. Check for 32-byte raw/UTF-8 string
  const utf8Buf = Buffer.from(trimmed, "utf-8");
  if (utf8Buf.length === AES_256_KEY_LENGTH_BYTES) {
    return utf8Buf;
  }

  throw new InvalidEncryptionKeyError(
    `Invalid encryption key: key must resolve to exactly ${AES_256_KEY_LENGTH_BYTES} bytes (256 bits). ` +
      `Provide a 64-character hex string, a 44-character base64 string, or a 32-byte buffer. (Input string length: ${trimmed.length})`,
  );
}

/**
 * Generate a cryptographically secure 256-bit key for database backups.
 */
export function generateEncryptionKey(): {
  key: Buffer;
  keyBuffer: Buffer;
  keyHex: string;
  keyBase64: string;
} {
  const keyBuffer = crypto.randomBytes(AES_256_KEY_LENGTH_BYTES);
  return {
    key: keyBuffer,
    keyBuffer,
    keyHex: keyBuffer.toString("hex"),
    keyBase64: keyBuffer.toString("base64"),
  };
}

/**
 * Calculate the SHA-256 digest of a Buffer or string in lowercase hex.
 */
export function calculateSha256(data: Buffer | string): string {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf-8");
  return crypto.createHash("sha256").update(buf).digest("hex").toLowerCase();
}

/**
 * Encrypt a database backup plaintext payload using AES-256-GCM.
 * Envelope layout:
 * [HEADER (17 bytes)][KEY_ID_LEN (2 bytes uint16BE)][KEY_ID (utf-8)][IV (12 bytes)][AUTH_TAG (16 bytes)][CIPHERTEXT]
 */
export async function encryptDatabasePayload(
  plaintext: Buffer | string,
  key: Buffer | string,
  keyId: string,
): Promise<{
  encryptedBuffer: Buffer;
  encryptedSha256: string;
  plaintextSha256: string;
  sizeBytes: number;
  keyId: string;
}> {
  if (!keyId || typeof keyId !== "string" || keyId.trim().length === 0) {
    throw new InvalidEncryptionKeyError("Encryption keyId must be a non-empty string identifier.");
  }

  const keyIdClean = keyId.trim();
  const keyIdBuf = Buffer.from(keyIdClean, "utf-8");
  if (keyIdBuf.length > 65535) {
    throw new InvalidEncryptionKeyError("Encryption keyId exceeds maximum length of 65535 bytes.");
  }

  const keyBuf = validateEncryptionKey(key);
  const plainBuf = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, "utf-8");
  const plaintextSha256 = calculateSha256(plainBuf);

  // Generate unique 12-byte IV for this payload
  const iv = crypto.randomBytes(GCM_IV_LENGTH_BYTES);

  const keyIdLenBuf = Buffer.allocUnsafe(2);
  keyIdLenBuf.writeUInt16BE(keyIdBuf.length, 0);

  // Additional Authenticated Data (AAD) binds the header prefix and key ID to the cipher authentication
  const aad = Buffer.concat([BACKUP_HEADER_MAGIC_BUFFER, keyIdLenBuf, keyIdBuf]);

  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuf, iv);
  cipher.setAAD(aad);

  const ciphertextChunk1 = cipher.update(plainBuf);
  const ciphertextChunk2 = cipher.final();
  const ciphertext = Buffer.concat([ciphertextChunk1, ciphertextChunk2]);
  const authTag = cipher.getAuthTag();

  const encryptedBuffer = Buffer.concat([
    BACKUP_HEADER_MAGIC_BUFFER,
    keyIdLenBuf,
    keyIdBuf,
    iv,
    authTag,
    ciphertext,
  ]);

  const encryptedSha256 = calculateSha256(encryptedBuffer);

  return {
    encryptedBuffer,
    encryptedSha256,
    plaintextSha256,
    sizeBytes: encryptedBuffer.length,
    keyId: keyIdClean,
  };
}

/**
 * Decrypt an AES-256-GCM encrypted database backup payload.
 * Verifies magic header, key ID, IV, and GCM authentication tag.
 */
export async function decryptDatabasePayload(
  encryptedBuffer: Buffer,
  key: Buffer | string,
  expectedKeyId?: string,
): Promise<{
  plaintextBuffer: Buffer;
  keyId: string;
  plaintextSha256: string;
}> {
  if (!Buffer.isBuffer(encryptedBuffer)) {
    throw new InvalidBackupHeaderError("Encrypted payload must be provided as a Buffer.");
  }

  const magicLen = BACKUP_HEADER_MAGIC_BUFFER.length;
  const minHeaderLen = magicLen + 2 + GCM_IV_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES;

  if (encryptedBuffer.length < minHeaderLen) {
    throw new InvalidBackupHeaderError(
      `Invalid backup payload: buffer length (${encryptedBuffer.length} bytes) is smaller than minimum envelope header (${minHeaderLen} bytes).`,
    );
  }

  // 1. Verify magic header prefix
  const magicSlice = encryptedBuffer.subarray(0, magicLen);
  if (!magicSlice.equals(BACKUP_HEADER_MAGIC_BUFFER)) {
    throw new InvalidBackupHeaderError("Invalid backup payload: missing or malformed magic header prefix.");
  }

  // 2. Read key ID length and value
  let offset = magicLen;
  const keyIdLen = encryptedBuffer.readUInt16BE(offset);
  offset += 2;

  if (encryptedBuffer.length < offset + keyIdLen + GCM_IV_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES) {
    throw new InvalidBackupHeaderError("Invalid backup payload: buffer truncated before envelope metadata.");
  }

  const parsedKeyId = encryptedBuffer.subarray(offset, offset + keyIdLen).toString("utf-8");
  offset += keyIdLen;

  // 3. Verify key ID if expected key ID is provided
  if (expectedKeyId !== undefined && expectedKeyId.trim() !== "" && parsedKeyId !== expectedKeyId.trim()) {
    throw new KeyIdMismatchError(
      `Mismatched encryption key ID: expected "${expectedKeyId.trim()}", found "${parsedKeyId}" in backup envelope.`,
    );
  }

  // 4. Extract IV, AuthTag, and Ciphertext
  const iv = encryptedBuffer.subarray(offset, offset + GCM_IV_LENGTH_BYTES);
  offset += GCM_IV_LENGTH_BYTES;

  const authTag = encryptedBuffer.subarray(offset, offset + GCM_AUTH_TAG_LENGTH_BYTES);
  offset += GCM_AUTH_TAG_LENGTH_BYTES;

  const ciphertext = encryptedBuffer.subarray(offset);

  // 5. Validate key and execute authenticated decryption
  const keyBuf = validateEncryptionKey(key);

  const keyIdBuf = Buffer.from(parsedKeyId, "utf-8");
  const keyIdLenBuf = Buffer.allocUnsafe(2);
  keyIdLenBuf.writeUInt16BE(keyIdBuf.length, 0);
  const aad = Buffer.concat([BACKUP_HEADER_MAGIC_BUFFER, keyIdLenBuf, keyIdBuf]);

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuf, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);

    const chunk1 = decipher.update(ciphertext);
    const chunk2 = decipher.final();
    const plaintextBuffer = Buffer.concat([chunk1, chunk2]);
    const plaintextSha256 = calculateSha256(plaintextBuffer);

    return {
      plaintextBuffer,
      keyId: parsedKeyId,
      plaintextSha256,
    };
  } catch (err: any) {
    if (
      err instanceof InvalidBackupHeaderError ||
      err instanceof KeyIdMismatchError ||
      err instanceof InvalidEncryptionKeyError
    ) {
      throw err;
    }
    throw new DecryptionAuthenticationError(
      "Database backup decryption failed: authentication tag verification failed, wrong key, or corrupted ciphertext.",
    );
  }
}

export interface EncryptBackupFileInput {
  sourceFilePath: string;
  destinationFilePath?: string;
  targetEncryptedPath?: string;
  key: Buffer | string;
  keyId: string;
}

export interface DecryptBackupFileInput {
  sourceEncryptedPath?: string;
  encryptedFilePath?: string;
  destinationFilePath?: string;
  targetPlaintextPath?: string;
  key: Buffer | string;
  expectedKeyId?: string;
}

/**
 * Encrypt a backup file from disk and write the authenticated ciphertext to a target file.
 * Supports both object argument and positional parameters.
 */
export async function encryptBackupFile(
  inputOrSourcePath: string | EncryptBackupFileInput,
  destinationFilePath?: string,
  key?: Buffer | string,
  keyId?: string,
): Promise<{
  encryptedSha256: string;
  plaintextSha256: string;
  sizeBytes: number;
  keyId: string;
}> {
  let srcPath: string;
  let dstPath: string;
  let encKey: Buffer | string;
  let encKeyId: string;

  if (typeof inputOrSourcePath === "object" && inputOrSourcePath !== null) {
    srcPath = inputOrSourcePath.sourceFilePath;
    dstPath = inputOrSourcePath.targetEncryptedPath || inputOrSourcePath.destinationFilePath || "";
    encKey = inputOrSourcePath.key;
    encKeyId = inputOrSourcePath.keyId;
  } else {
    srcPath = inputOrSourcePath as string;
    dstPath = destinationFilePath || "";
    encKey = key!;
    encKeyId = keyId!;
  }

  const plaintext = await fsp.readFile(srcPath);
  const encrypted = await encryptDatabasePayload(plaintext, encKey, encKeyId);
  await fsp.writeFile(dstPath, encrypted.encryptedBuffer, { mode: 0o600 });

  return {
    encryptedSha256: encrypted.encryptedSha256,
    plaintextSha256: encrypted.plaintextSha256,
    sizeBytes: encrypted.sizeBytes,
    keyId: encrypted.keyId,
  };
}

/**
 * Decrypt an authenticated backup file from disk and write plaintext to a target file.
 * Supports both object argument and positional parameters.
 */
export async function decryptBackupFile(
  inputOrEncryptedPath: string | DecryptBackupFileInput,
  destinationFilePath?: string,
  key?: Buffer | string,
  expectedKeyId?: string,
): Promise<{
  keyId: string;
  plaintextSha256: string;
  sizeBytes: number;
}> {
  let encPath: string;
  let dstPath: string;
  let decKey: Buffer | string;
  let expKeyId: string | undefined;

  if (typeof inputOrEncryptedPath === "object" && inputOrEncryptedPath !== null) {
    encPath = inputOrEncryptedPath.sourceEncryptedPath || inputOrEncryptedPath.encryptedFilePath || "";
    dstPath = inputOrEncryptedPath.targetPlaintextPath || inputOrEncryptedPath.destinationFilePath || "";
    decKey = inputOrEncryptedPath.key;
    expKeyId = inputOrEncryptedPath.expectedKeyId;
  } else {
    encPath = inputOrEncryptedPath as string;
    dstPath = destinationFilePath || "";
    decKey = key!;
    expKeyId = expectedKeyId;
  }

  const encryptedBuffer = await fsp.readFile(encPath);
  const decrypted = await decryptDatabasePayload(encryptedBuffer, decKey, expKeyId);
  await fsp.writeFile(dstPath, decrypted.plaintextBuffer, { mode: 0o600 });

  return {
    keyId: decrypted.keyId,
    plaintextSha256: decrypted.plaintextSha256,
    sizeBytes: decrypted.plaintextBuffer.length,
  };
}
