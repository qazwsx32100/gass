import crypto from 'node:crypto';
import { fetchWithTimeout } from './_fetch.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

const base64url = (input) => Buffer.from(input).toString('base64url');

const getPrivateKey = () => {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';
  return key.replace(/\\n/g, '\n');
};

export const isGoogleDriveBackupConfigured = () => (
  Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID) &&
  (
    (
      Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID) &&
      Boolean(process.env.GOOGLE_DRIVE_CLIENT_SECRET) &&
      Boolean(process.env.GOOGLE_DRIVE_REFRESH_TOKEN)
    ) ||
    (
      Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) &&
      Boolean(getPrivateKey())
    )
  )
);

const createServiceAccountJwt = () => {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    .sign(getPrivateKey(), 'base64url');
  return `${unsigned}.${signature}`;
};

const getServiceAccountAccessToken = async () => {
  const response = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: createServiceAccountJwt()
    })
  }, 10000);

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Google token request failed.');
  }
  return data.access_token;
};

const getOAuthAccessToken = async () => {
  const response = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
      client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  }, 10000);

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Google OAuth token request failed.');
  }
  return data.access_token;
};

const getAccessToken = () => {
  if (
    process.env.GOOGLE_DRIVE_CLIENT_ID &&
    process.env.GOOGLE_DRIVE_CLIENT_SECRET &&
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN
  ) {
    return getOAuthAccessToken();
  }
  return getServiceAccountAccessToken();
};

const safeFilename = (value) => String(value || 'attachment')
  .replace(/[^a-zA-Z0-9._-]+/g, '_')
  .slice(0, 140);

export const uploadPrivateFileToGoogleDrive = async ({ filename, mimeType, buffer, description = '' }) => {
  if (!isGoogleDriveBackupConfigured()) {
    throw new Error('Google Drive private storage is not configured.');
  }

  const accessToken = await getAccessToken();
  const boundary = `erp_file_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  const metadata = {
    name: safeFilename(filename),
    parents: [process.env.GOOGLE_DRIVE_ATTACHMENTS_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID],
    mimeType,
    description: String(description || '').slice(0, 500)
  };
  const head = Buffer.from([
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    'Content-Transfer-Encoding: binary',
    '',
    ''
  ].join('\r\n'));
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, Buffer.from(buffer), tail]);

  const response = await fetchWithTimeout(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(body.length)
    },
    body
  }, 25000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) {
    throw new Error(data.error?.message || 'Google Drive attachment upload failed.');
  }

  return {
    id: data.id,
    name: data.name || metadata.name,
    mimeType,
    size: Buffer.byteLength(buffer),
    webViewLink: data.webViewLink || ''
  };
};

export const downloadPrivateFileFromGoogleDrive = async (fileId) => {
  if (!isGoogleDriveBackupConfigured()) {
    throw new Error('Google Drive private storage is not configured.');
  }
  const accessToken = await getAccessToken();
  const metadataResponse = await fetchWithTimeout(
    `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,trashed`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    15000
  );
  const metadata = await metadataResponse.json().catch(() => ({}));
  if (!metadataResponse.ok || metadata.trashed) {
    throw new Error(metadata.error?.message || 'Attachment was not found.');
  }

  const contentResponse = await fetchWithTimeout(
    `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    25000
  );
  if (!contentResponse.ok) {
    const data = await contentResponse.json().catch(() => ({}));
    throw new Error(data.error?.message || 'Attachment download failed.');
  }

  return {
    name: metadata.name || 'attachment',
    mimeType: metadata.mimeType || 'application/octet-stream',
    buffer: Buffer.from(await contentResponse.arrayBuffer())
  };
};

export const uploadBackupToGoogleDrive = async ({ filename, jsonText }) => {
  if (!isGoogleDriveBackupConfigured()) {
    return { skipped: true, status: 'not_configured' };
  }

  const accessToken = await getAccessToken();
  const boundary = `erp_backup_${Date.now()}`;
  const metadata = {
    name: filename,
    parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
    mimeType: 'application/json'
  };
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    jsonText,
    `--${boundary}--`,
    ''
  ].join('\r\n');

  const response = await fetchWithTimeout(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body
  }, 25000);

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || 'Google Drive upload failed.');
  }

  return {
    skipped: false,
    status: 'uploaded',
    fileId: data.id,
    webViewLink: data.webViewLink
  };
};
