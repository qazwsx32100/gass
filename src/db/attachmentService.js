import { apiFetch } from './apiClient';
import { getCloudSessionToken } from './supabaseService';

const authHeaders = () => {
  const token = getCloudSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const uploadCloudAttachment = async ({ dataUrl, filename }) => {
  const response = await apiFetch('/api/attachments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders() },
    body: JSON.stringify({ dataUrl, filename })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok || !data.attachment) {
    throw new Error(data.error || '附件上傳失敗。');
  }
  return data.attachment;
};

export const getCloudAttachmentUrl = async (attachment) => {
  if (!attachment) return '';
  if (typeof attachment === 'string') return attachment;
  if (!attachment.id) throw new Error('附件識別碼不存在。');

  const response = await apiFetch(`/api/attachments?id=${encodeURIComponent(attachment.id)}`, {
    method: 'GET',
    headers: { ...authHeaders() }
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || '附件讀取失敗。');
  }
  return URL.createObjectURL(await response.blob());
};

export const revokeCloudAttachmentUrl = (url) => {
  if (String(url || '').startsWith('blob:')) URL.revokeObjectURL(url);
};

