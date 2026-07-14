import crypto from 'node:crypto';

const REQUIRED_ECPAY_ENV = [
  'ECPAY_MERCHANT_ID',
  'ECPAY_HASH_KEY',
  'ECPAY_HASH_IV',
  'ECPAY_CHECKOUT_URL',
  'ECPAY_RETURN_URL'
];

export const isEcpayConfigured = () => (
  REQUIRED_ECPAY_ENV.every(key => Boolean(process.env[key]))
);

/**
 * Loads ECPay config from environment variables. Payment endpoints stay disabled
 * unless every required value is explicitly configured on the server.
 */
export const getEcpayConfig = () => {
  if (!isEcpayConfigured()) {
    throw new Error('ECPay environment variables are not configured.');
  }

  return {
    merchantId: process.env.ECPAY_MERCHANT_ID,
    hashKey: process.env.ECPAY_HASH_KEY,
    hashIV: process.env.ECPAY_HASH_IV,
    checkoutUrl: process.env.ECPAY_CHECKOUT_URL,
    returnUrl: process.env.ECPAY_RETURN_URL,
  };
};

/**
 * Generates ECPay CheckMacValue signature.
 * 
 * Rules:
 * 1. Sort parameters alphabetically by key.
 * 2. Join with & as key=value.
 * 3. Prepend HashKey and append HashIV.
 * 4. encodeURIComponent.
 * 5. Replace specific chars to match ECPay URL encode rules (replace %20 with +, etc.).
 * 6. UpperCase percent-encoded symbols.
 * 7. SHA256 hashing -> UpperCase hex.
 */
export const generateCheckMacValue = (params, hashKey, hashIV) => {
  const sortedKeys = Object.keys(params).sort();
  let queryStr = sortedKeys
    .map(key => `${key}=${params[key]}`)
    .join('&');

  queryStr = `HashKey=${hashKey}&${queryStr}&HashIV=${hashIV}`;

  let encoded = encodeURIComponent(queryStr);

  // ECPay specific URL encoding replacements
  encoded = encoded
    .replace(/%20/g, '+')
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%[0-9a-f]{2}/g, (match) => match.toUpperCase());

  const hash = crypto.createHash('sha256').update(encoded).digest('hex');
  return hash.toUpperCase();
};

/**
 * Verifies ECPay callback params CheckMacValue.
 */
export const verifyCheckMacValue = (params, hashKey, hashIV) => {
  const { CheckMacValue, ...otherParams } = params;
  if (!CheckMacValue) return false;
  const calculated = generateCheckMacValue(otherParams, hashKey, hashIV);
  const expected = Buffer.from(calculated, 'utf8');
  const actual = Buffer.from(String(CheckMacValue).toUpperCase(), 'utf8');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

/**
 * Encodes an ERP Income ID into a unique 20-character ECPay MerchantTradeNo.
 * Format: [shortenedId]X[Base36Timestamp]
 * e.g., 'REV202607002' -> 'R2607002XIS1XZK1P'
 */
export const encodeTradeNo = (incomeId) => {
  const shortId = incomeId.startsWith('REV20') ? incomeId.replace('REV20', 'R') : incomeId;
  const suffix = Date.now().toString(36).toUpperCase();
  return `${shortId}X${suffix}`.slice(0, 20);
};

/**
 * Decodes the 20-character ECPay MerchantTradeNo back to the ERP Income ID.
 */
export const decodeTradeNo = (tradeNo) => {
  if (!tradeNo) return '';
  const [shortId] = tradeNo.split('X');
  return shortId.startsWith('R') ? shortId.replace(/^R/, 'REV20') : shortId;
};
