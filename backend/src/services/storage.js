import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';

dotenv.config();

const r2Client = new S3Client({
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  },
  endpoint: process.env.R2_ENDPOINT
});

const PUBLIC_BUCKET = process.env.R2_BUCKET_PUBLIC || 'duys-media-public';
const VERIFICATION_BUCKET = process.env.R2_BUCKET_VERIFICATION || 'duys-verification-private';
const PUBLIC_URL = process.env.R2_BUCKET_PUBLIC_URL || process.env.R2_ENDPOINT;

/**
 * Upload file to public bucket (images, videos)
 * @param {string} key - File path in bucket (e.g., 'posts/123/image.jpg')
 * @param {Buffer} body - File content
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} Public URL
 */
export async function uploadPublic(key, body, contentType = 'application/octet-stream') {
  try {
    const command = new PutObjectCommand({
      Bucket: PUBLIC_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType
    });

    await r2Client.send(command);
    return `${PUBLIC_URL}/${key}`;
  } catch (error) {
    console.error('[R2 Upload Public]', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}

/**
 * Upload file to verification bucket (private - ID, face, etc)
 * @param {string} key - File path in bucket (e.g., 'verifications/user-123/id.jpg')
 * @param {Buffer} body - File content
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} File key (no public URL)
 */
export async function uploadVerification(key, body, contentType = 'application/octet-stream') {
  try {
    const command = new PutObjectCommand({
      Bucket: VERIFICATION_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType
    });

    await r2Client.send(command);
    return key; // Return key, not URL - bucket is private
  } catch (error) {
    console.error('[R2 Upload Verification]', error);
    throw new Error(`Failed to upload verification file: ${error.message}`);
  }
}

/**
 * Get signed URL for private verification file (temporary access)
 * @param {string} key - File path in bucket
 * @param {number} expiresIn - Seconds until URL expires (default 3600 = 1 hour)
 * @returns {Promise<string>} Signed URL
 */
export async function getVerificationUrl(key, expiresIn = 3600) {
  try {
    const command = new GetObjectCommand({
      Bucket: VERIFICATION_BUCKET,
      Key: key
    });

    const url = await getSignedUrl(r2Client, command, { expiresIn });
    return url;
  } catch (error) {
    console.error('[R2 Get Verification URL]', error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
}

/**
 * Delete file from public bucket
 * @param {string} key - File path in bucket
 */
export async function deletePublic(key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: PUBLIC_BUCKET,
      Key: key
    });

    await r2Client.send(command);
  } catch (error) {
    console.error('[R2 Delete Public]', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * Delete file from verification bucket
 * @param {string} key - File path in bucket
 */
export async function deleteVerification(key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: VERIFICATION_BUCKET,
      Key: key
    });

    await r2Client.send(command);
  } catch (error) {
    console.error('[R2 Delete Verification]', error);
    throw new Error(`Failed to delete verification file: ${error.message}`);
  }
}

export default {
  uploadPublic,
  uploadVerification,
  getVerificationUrl,
  deletePublic,
  deleteVerification
};
