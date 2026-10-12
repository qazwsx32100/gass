import crypto from 'crypto';

const JWT_SECRET = process.env.ADMIN_SESSION_SECRET || 'shenglong-gas-admin-session-secret-2026';
const PASSWORD_SALT = process.env.ADMIN_PASSWORD_SALT || 'shenglong_gas_secure_salt_2026';
const ADMIN_DEFAULT_PW = process.env.ADMIN_DEFAULT_PASSWORD || '';

// 單向不可逆鹽值加密函數 (HMAC-SHA256)
export function hashPassword(pw) {
  return crypto
    .createHmac('sha256', PASSWORD_SALT)
    .update(String(pw || '').trim())
    .digest('hex');
}

// 帳號資訊清單：所有密碼均為加密後的不可逆雜湊密文 (Hashes)，代碼中不包含任何明文密碼
const USERS = [
  {
    id: 'SH001',
    name: '主管理員',
    email: 'qazwsx32100@gmail.com',
    aliases: ['qazwsx32100@gmail.com', 'admin', '主管理員'],
    passwordHashes: [
      '5092f081c6f2b8a96bc61fbeda2175de1431516660c4a5ef084bfb75c1b16d91',
      '3bec558162410a1920629f6272eef15e93a0bf273efee0789cc2db04e458f972'
    ],
    role: 'admin'
  },
  {
    id: 'SH002',
    name: '周子傑',
    email: 'zijie@shenglonggas.com',
    aliases: ['zijie@shenglonggas.com', '周子傑'],
    passwordHashes: [
      '5092f081c6f2b8a96bc61fbeda2175de1431516660c4a5ef084bfb75c1b16d91',
      '01696fadb2449d3394a8d955f9e08cad42517b9322b466ce81d180939575b6bc',
      '3bec558162410a1920629f6272eef15e93a0bf273efee0789cc2db04e458f972'
    ],
    role: 'manager'
  },
  {
    id: 'SH003',
    name: '林曄鏵',
    email: 'yehua@shenglonggas.com',
    aliases: ['yehua@shenglonggas.com', '林曄鏵'],
    passwordHashes: [
      '5092f081c6f2b8a96bc61fbeda2175de1431516660c4a5ef084bfb75c1b16d91',
      '01696fadb2449d3394a8d955f9e08cad42517b9322b466ce81d180939575b6bc',
      '3bec558162410a1920629f6272eef15e93a0bf273efee0789cc2db04e458f972'
    ],
    role: 'manager'
  }
];

if (ADMIN_DEFAULT_PW) {
  USERS[0].passwordHashes.push(hashPassword(ADMIN_DEFAULT_PW));
}

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

export function createToken(payload) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days
  const body = base64UrlEncode(JSON.stringify({ ...payload, exp }));
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;

  const expectedSig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(body));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: Verify existing token
  if (req.method === 'GET') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : (req.query?.token || '');

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ success: false, error: '未授權或登入憑證已過期' });
    }

    return res.status(200).json({
      success: true,
      user: decoded.user
    });
  }

  // POST: Login
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const accountInput = String(body.account || body.email || '').trim().toLowerCase();
      const passwordInput = String(body.password || '').trim();

      if (!accountInput || !passwordInput) {
        return res.status(400).json({
          success: false,
          error: '請輸入帳號（或 Email）與密碼'
        });
      }

      // 透過單向加密後的不可逆雜湊密文比對，確保明文密碼不在伺服器或記憶體中停留
      const inputHash = hashPassword(passwordInput);

      const user = USERS.find(u => {
        const matchesAccount = u.aliases.some(alias => alias.toLowerCase() === accountInput) ||
                               u.email.toLowerCase() === accountInput ||
                               u.name.toLowerCase() === accountInput;
        if (!matchesAccount) return false;
        return u.passwordHashes.includes(inputHash);
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          error: '帳號或密碼錯誤，請重新確認。'
        });
      }

      const safeUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      };

      const token = createToken({ user: safeUser });

      return res.status(200).json({
        success: true,
        message: `${user.name} 登入成功`,
        user: safeUser,
        token
      });
    } catch (err) {
      console.error('Auth handler error:', err);
      return res.status(500).json({ success: false, error: '伺服器驗證程序發生異常' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
