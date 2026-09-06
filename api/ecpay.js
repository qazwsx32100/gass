import { captureServerException } from './_monitoring.js';
import { fetchAppState, saveAppState, getClientIp, getBearerToken, sendJson, verifyToken } from './_auth.js';
import {
  encodeTradeNo,
  decodeTradeNo,
  generateCheckMacValue,
  getEcpayConfig,
  verifyCheckMacValue
} from './_ecpay.js';

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

const sendEcpayResponse = (res, status, body) => {
  res
    .status(status)
    .setHeader('Content-Type', 'text/plain; charset=utf-8')
    .setHeader('Cache-Control', 'no-store, max-age=0')
    .setHeader('X-Content-Type-Options', 'nosniff');
  res.end(body);
};

async function handleCheckout(req, res) {
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
    await captureServerException(error, {
      tags: { endpoint: '/api/ecpay', action: 'checkout', method: req.method, status: 500 }
    });
    return sendHtmlError(res, 500, 'Payment checkout failed.');
  }
}

async function handleCallback(req, res) {
  try {
    let params = req.body || {};
    if (typeof params === 'string') {
      params = Object.fromEntries(new URLSearchParams(params));
    } else if (Buffer.isBuffer(params)) {
      params = Object.fromEntries(new URLSearchParams(params.toString('utf-8')));
    }

    let ecpayConfig;
    try {
      ecpayConfig = getEcpayConfig();
    } catch {
      console.warn('ECPay callback received while payment service is not configured.');
      sendEcpayResponse(res, 200, '0|PaymentNotConfigured');
      return;
    }

    const isValidSignature = verifyCheckMacValue(params, ecpayConfig.hashKey, ecpayConfig.hashIV);
    if (!isValidSignature) {
      console.warn('ECPay callback signature verification failed.');
      sendEcpayResponse(res, 200, '0|CheckMacValueVerifyFail');
      return;
    }

    if (params.RtnCode === '1') {
      const merchantTradeNo = params.MerchantTradeNo;
      const incomeId = decodeTradeNo(merchantTradeNo);
      if (!incomeId) {
        console.error('Failed to decode income id from MerchantTradeNo:', merchantTradeNo);
        sendEcpayResponse(res, 200, '0|InvalidMerchantTradeNo');
        return;
      }

      const appState = await fetchAppState();
      if (!appState || !appState.state) {
        console.error('Failed to fetch app state during ECPay callback.');
        sendEcpayResponse(res, 200, '0|FetchAppStateFail');
        return;
      }

      const state = appState.state;
      const income = (state.incomes || []).find(item => item.id === incomeId);
      if (!income) {
        console.warn(`Income record ${incomeId} not found during ECPay callback.`);
        sendEcpayResponse(res, 200, '0|IncomeNotFound');
        return;
      }

      const paidAmount = Number(params.TradeAmt || params.TradeAmount || params.TotalAmount || 0);
      const expectedAmount = Math.round(Number(income.amount || 0));
      if (!Number.isFinite(paidAmount) || paidAmount !== expectedAmount) {
        console.warn(`ECPay amount mismatch for ${incomeId}. expected=${expectedAmount}, actual=${paidAmount}`);
        sendEcpayResponse(res, 200, '0|AmountMismatch');
        return;
      }

      if (income.paymentStatus !== 'paid') {
        income.paymentStatus = 'paid';
        income.paymentMethod = 'ecpay';

        const timeStr = params.PaymentDate || new Date().toISOString();
        const tradeNo = params.TradeNo || '';
        const payType = params.PaymentType || '';
        const metaMsg = `\n[ECPay paid at: ${timeStr}, trade no: ${tradeNo}, payment type: ${payType}]`;
        income.remarks = ((income.remarks || '') + metaMsg).trim();

        if (Array.isArray(state.logs)) {
          state.logs.push({
            id: `LOG${Date.now()}`,
            timestamp: new Date().toISOString(),
            actor: 'ECPay Callback',
            action: 'PAYMENT_CONFIRMED',
            details: `Income ${incomeId} marked paid via ECPay trade ${tradeNo}`
          });
        }

        await saveAppState({
          state,
          updatedBy: 'ECPay Callback',
          requestIp: getClientIp(req),
          previousState: appState.state
        });

        console.log(`Income ${incomeId} successfully marked as paid via ECPay callback.`);
      } else {
        console.log(`Income ${incomeId} was already marked as paid.`);
      }
    } else {
      console.warn(`ECPay transaction was not successful. RtnCode: ${params.RtnCode}, RtnMsg: ${params.RtnMsg}`);
    }

    sendEcpayResponse(res, 200, '1|OK');
  } catch (error) {
    console.error('Error handling ECPay callback:', error);
    await captureServerException(error, {
      tags: { endpoint: '/api/ecpay', action: 'callback', method: req.method, status: 500 }
    });
    sendEcpayResponse(res, 200, '0|ExceptionError');
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return handleCheckout(req, res);
  }
  if (req.method === 'POST') {
    return handleCallback(req, res);
  }
  res.setHeader('Allow', 'GET, POST');
  return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
}
