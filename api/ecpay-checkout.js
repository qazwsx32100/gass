import { fetchAppState, getBearerToken, sendJson, verifyToken } from './_auth.js';
import { encodeTradeNo, generateCheckMacValue, getEcpayConfig } from './_ecpay.js';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatMerchantTradeDate = (date) => {
  const yyyy = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const HH = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}/${MM}/${dd} ${HH}:${mm}:${ss}`;
};

const sendHtml = (res, status, html) => {
  res
    .status(status)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    .setHeader('Cache-Control', 'no-store, max-age=0')
    .setHeader('X-Content-Type-Options', 'nosniff');
  res.end(html);
};

const sendHtmlError = (res, status, message) => sendHtml(res, status, `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Payment error</title></head>
  <body>
    <main style="font-family: system-ui, sans-serif; max-width: 520px; margin: 72px auto; line-height: 1.6;">
      <h1>Payment is unavailable</h1>
      <p>${escapeHtml(message)}</p>
      <a href="/" style="color: #0f766e;">Back to ERP</a>
    </main>
  </body>
</html>`);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const requestUrl = new URL(req.url || '/', 'https://erp.local');
  const id = String(requestUrl.searchParams.get('id') || '').trim();
  const session = verifyToken(getBearerToken(req));
  if (!id || !session) {
    return sendHtmlError(res, 401, 'Missing invoice id or valid authorization.');
  }

  let ecpayConfig;
  try {
    ecpayConfig = getEcpayConfig();
  } catch {
    return sendHtmlError(res, 503, 'Payment service is not configured.');
  }

  try {
    const appState = await fetchAppState();
    const state = appState.state || {};
    const income = (state.incomes || []).find(item => item.id === id);
    if (!income) {
      return sendHtmlError(res, 404, 'Invoice was not found.');
    }
    if (income.paymentStatus === 'paid') {
      return sendHtmlError(res, 400, 'Invoice is already paid.');
    }

    const amount = Math.round(Number(income.amount || 0));
    if (!Number.isFinite(amount) || amount <= 0) {
      return sendHtmlError(res, 400, 'Invoice amount is invalid.');
    }

    const params = {
      MerchantID: ecpayConfig.merchantId,
      MerchantTradeNo: encodeTradeNo(income.id),
      MerchantTradeDate: formatMerchantTradeDate(new Date()),
      PaymentType: 'aio',
      TotalAmount: amount,
      TradeDesc: `Gass ERP Invoice Payment - ${income.id}`,
      ItemName: `Invoice ${income.id}`,
      ReturnURL: ecpayConfig.returnUrl,
      ChoosePayment: 'ALL',
      EncryptType: '1',
      ClientBackURL: process.env.APP_BASE_URL || 'https://erp-weld-three-96.vercel.app/#inputs'
    };
    params.CheckMacValue = generateCheckMacValue(params, ecpayConfig.hashKey, ecpayConfig.hashIV);

    return sendHtml(res, 200, `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Redirecting to payment</title></head>
  <body>
    <p>Redirecting to payment...</p>
    <form action="${escapeHtml(ecpayConfig.checkoutUrl)}" method="POST">
      ${Object.entries(params).map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`).join('\n      ')}
      <button type="submit">Continue to payment</button>
    </form>
    <script>document.forms[0].submit();</script>
  </body>
</html>`);
  } catch (error) {
    console.error('ECPay checkout error:', error);
    return sendHtmlError(res, 500, 'Payment checkout failed.');
  }
}
