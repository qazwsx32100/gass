import {
  searchCloudCustomers,
  normalizePhone,
  extractCustomerCode,
  getCloudCustomerById,
} from '../lib/cloud-customer-gateway.ts';

/**
 * 門市經典代號正規化比對 (如 26.21.1, 47.2, 102.15.3)
 */
export function extractCustomerCodeFromText(text) {
  if (!text || typeof text !== 'string') return null;

  // 1. 顯式代號模式：如 "代號 26.21.1"、"編號:26.21.1"、"我是 26.21.1"、"26.21.1號"
  const explicitMatch = text.match(/(?:代號|編號|我是|客戶|會員|帳號)?\s*[:：#]?\s*([0-9]{1,3}\.[0-9]{1,3}(?:\.[0-9]{1,3})?)/i);
  if (explicitMatch && explicitMatch[1]) {
    const candidate = explicitMatch[1];
    // 排除純小數點數字 (如 400.0) 或版本號
    if (!candidate.endsWith('.0') && candidate.includes('.')) {
      return candidate;
    }
  }

  // 2. 獨立代號模式 (獨立詞組)
  const standaloneMatch = text.match(/\b([0-9]{1,3}\.[0-9]{1,3}(?:\.[0-9]{1,3})?)\b/);
  if (standaloneMatch && standaloneMatch[1]) {
    const candidate = standaloneMatch[1];
    if (!candidate.endsWith('.0') && candidate.includes('.')) {
      return candidate;
    }
  }

  return null;
}

/**
 * 電話與手機萃取 (支援 09xx-xxx-xxx, 02-xxxx-xxxx, 7~10位純數字)
 */
export function extractPhoneFromText(text) {
  if (!text || typeof text !== 'string') return null;

  // 1. 完整手機 (09xxxxxxxx)
  const mobileMatch = text.match(/09\d{2}[-\s]?\d{3}[-\s]?\d{3}|09\d{8}/);
  if (mobileMatch) return normalizePhone(mobileMatch[0]);

  // 2. 市話 (02-xxxxxxxx)
  const landlineMatch = text.match(/02[-\s]?\d{4}[-\s]?\d{4}|02\d{8}/);
  if (landlineMatch) return normalizePhone(landlineMatch[0]);

  // 3. 末 7~8 碼電話號碼 (例如 734808, 29763869)
  const partialMatch = text.match(/(?:電話|手機|號碼|打)?\s*[:：]?\s*(\d{7,8})\b/);
  if (partialMatch) return partialMatch[1];

  return null;
}

/**
 * 地址關鍵字萃取 (路街巷弄門牌)
 */
export function extractAddressSnippet(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/([^\s,，。:：\n]+?(?:路|街|大道|巷|弄)(?:[一二三四五六七八九十\d]+段)?(?:\d+巷)?(?:\d+弄)?\s*\d+(?:-\d+)?號)/);
  if (match) {
    return match[1]
      .trim()
      .replace(/^(我家在|我家|抱歉更正一下地址，?|更正為|改送到|改送|換送到|送去|送到|請送|送|在|住|地址是|麻煩送|請幫我送)+/, '')
      .trim();
  }
  return null;
}

/**
 * 依客戶名冊推斷常用瓦斯規格 (住家 20kg、羊肉爐/快炒/小吃 20kg 或 50kg)
 */
export function inferCustomerSpec(customer) {
  if (!customer) return '20kg';

  // 1. 若有特定規格單價或歷史規格
  if (customer.p50 && customer.p50 > 0) return '50kg';
  if (customer.p20 && customer.p20 > 0) return '20kg';
  if (customer.p16 && customer.p16 > 0) return '16kg';
  if (customer.p10 && customer.p10 > 0) return '10kg';
  if (customer.p4 && customer.p4 > 0) return '4kg';

  // 2. 依名稱推估大戶規格 (餐廳、快炒、羊肉爐、火鍋)
  const name = customer.name || '';
  if (/羊肉|熱炒|快炒|牛肉麵|小吃|便當|火鍋|餐廳|廚房/.test(name)) {
    return '20kg'; // 生意攤主流 20kg
  }

  // 預設盛隆最主流住家規格
  return '20kg';
}

/**
 * 核心：從 LINE 當前文字與多輪歷史對話中秒級匹配雲端客戶
 * 匹配優先級：
 * 1. 門市經典代號 (100% 絕對權威)
 * 2. 電話號碼 / 末碼 (精確比對)
 * 3. 完整地址 / 路名門牌 (精準命中)
 */
export function matchLineCustomer(currentText = '', historyMessages = []) {
  const allTexts = [
    currentText,
    ...historyMessages.map((m) => (typeof m === 'string' ? m : m.content || m.text || '')),
  ].filter(Boolean);

  // ── 階段 1：門市代號檢索 (例如 26.21.1) ──
  for (const txt of allTexts) {
    const code = extractCustomerCodeFromText(txt);
    if (code) {
      const results = searchCloudCustomers(code, 5);
      const exact = results.find((c) => c.code === code);
      if (exact) {
        return {
          customer: exact,
          matchType: 'CODE',
          matchedTerm: code,
          inferredSpec: inferCustomerSpec(exact),
        };
      }
    }
  }

  // ── 階段 2：電話號碼檢索 ──
  for (const txt of allTexts) {
    const phone = extractPhoneFromText(txt);
    if (phone && phone.length >= 7) {
      const results = searchCloudCustomers(phone, 5);
      if (results.length > 0) {
        const topMatch = results[0];
        return {
          customer: topMatch,
          matchType: 'PHONE',
          matchedTerm: phone,
          inferredSpec: inferCustomerSpec(topMatch),
        };
      }
    }
  }

  // ── 階段 3：地址片段檢索 ──
  for (const txt of allTexts) {
    const addr = extractAddressSnippet(txt);
    if (addr && addr.length >= 4) {
      const results = searchCloudCustomers(addr, 5);
      if (results.length > 0) {
        const topMatch = results[0];
        return {
          customer: topMatch,
          matchType: 'ADDRESS',
          matchedTerm: addr,
          inferredSpec: inferCustomerSpec(topMatch),
        };
      }
    }
  }

  return null;
}

/**
 * 格式化注入給 AI 的雲端熟客精準上下文 (Context Prompt)
 */
export function formatCustomerContextPrompt(matched) {
  if (!matched || !matched.customer) return '';
  const { customer, matchType, inferredSpec } = matched;

  const codeDisplay = customer.code ? `代號 ${customer.code}` : '門市客戶';
  const lastOrderText = customer.lastOrder
    ? `${customer.lastOrder} (${customer.daysDiff >= 0 ? `約 ${customer.daysDiff} 天前` : '近期'})`
    : '近期有交易紀錄';

  return `
【👑 盛隆雲端中樞客戶識別成功 (命中依據: ${matchType})】
- 客戶代號：${customer.code || '（門市未設代號）'}
- 客戶稱呼/店名：${customer.name}
- 客戶類型：${customer.type || '一般客戶'}
- 登記地址：${customer.cleanAddress || customer.addr}
- 聯絡電話：${customer.tel || '（未登記電話）'}
- 慣用瓦斯規格：${inferredSpec}
- 最後叫瓦斯時間：${lastOrderText}
- 歷史備註：${customer.note || '無特殊注意事項'}
【🤖 熟客專屬智慧對答指引】：
1. 此客戶為盛隆瓦斯熟客（${codeDisplay}）！請在回答時親切尊稱客戶，並主動詢問是否一樣送至「${customer.cleanAddress || customer.addr}」。
2. 主動確認是否一樣送「${inferredSpec} 一桶」，切勿再要求客戶重新提供已經登記過的地址、電話或代號！
3. 若客戶已確認規格與送貨，以熱情有禮的態度完成確認，告知已安排師傅排趟，並提醒出車前會先電話聯絡。
`;
}
