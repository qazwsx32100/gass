import crypto from 'node:crypto';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';

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
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: createServiceAccountJwt()
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Google token request failed.');
  }
  return data.access_token;
};

const getOAuthAccessToken = async () => {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
      client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });

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

  const response = await fetch(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body
  });

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
