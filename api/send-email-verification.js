const json = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { success: false, error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    json(res, 503, { success: false, error: '尚未設定 RESEND_API_KEY，無法實際寄出 Email。' });
    return;
  }

  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      json(res, 400, { success: false, error: 'Email 內容格式錯誤。' });
      return;
    }
  }

  const to = String(payload?.to || '').trim();
  const subject = String(payload?.subject || '').trim();
  const text = String(payload?.text || '').trim();
  const html = String(payload?.html || text).trim();

  if (!to || !subject || !text) {
    json(res, 400, { success: false, error: '缺少收件人、主旨或內容。' });
    return;
  }

  const from = process.env.RESEND_FROM_EMAIL || 'BusinessPilot ERP <onboarding@resend.dev>';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
        html
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      json(res, response.status, {
        success: false,
        error: data?.message || data?.error || 'Email 寄送失敗。'
      });
      return;
    }

    json(res, 200, { success: true, id: data?.id || '' });
  } catch (error) {
    json(res, 500, { success: false, error: error.message || 'Email 寄送失敗。' });
  }
}
