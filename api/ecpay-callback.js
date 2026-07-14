import { fetchAppState, saveAppState, getClientIp } from './_auth.js';
import { getEcpayConfig, verifyCheckMacValue, decodeTradeNo } from './_ecpay.js';

const sendEcpayResponse = (res, status, body) => {
  res
    .status(status)
    .setHeader('Content-Type', 'text/plain; charset=utf-8')
    .setHeader('Cache-Control', 'no-store, max-age=0')
    .setHeader('X-Content-Type-Options', 'nosniff');
  res.end(body);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendEcpayResponse(res, 405, 'Method not allowed');
    return;
  }

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
    sendEcpayResponse(res, 200, '0|ExceptionError');
  }
}
