const LIFF_ID = '2011207944-VaQEXeyi';
const SNAPSHOT_STORAGE_KEY = 'sl_encrypted_member_snapshot_v1';
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PRICES = {
  '50kg': 2100,
  '20kg': 850,
  '18kg': 800,
  '16kg': 750,
  '10kg': 550,
  'new4kg': 350,
  '4kg': 350,
};
const PROMO_CODES = {
  'SL50': { name: '盛隆好友現折 $50', discount: 50 },
  'LINE50': { name: 'LINE 專屬叫瓦斯折抵 $50', discount: 50 },
  'VIP30': { name: 'VIP 會員每單回饋 $30', discount: 30 },
  'FIRST50': { name: '新客首叫優惠折 $50', discount: 50 },
  'SL100': { name: '盛隆雙桶特惠折 $100', discount: 100 },
};
const state = { token: '', data: null, fastLoaded: false, ordersLoaded: false, ordersLoading: false, lookupPhone: '', lookupCandidates: [], registrationMode: '', appliedPromo: null };
const $ = (id) => document.getElementById(id);
const DISTRICTS = {
  '新北市': ['板橋區', '三重區', '中和區', '永和區', '新莊區', '新店區', '樹林區', '鶯歌區', '三峽區', '淡水區', '汐止區', '瑞芳區', '土城區', '蘆洲區', '五股區', '泰山區', '林口區', '深坑區', '石碇區', '坪林區', '三芝區', '石門區', '八里區', '平溪區', '雙溪區', '貢寮區', '金山區', '萬里區', '烏來區'],
  '台北市': ['中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區'],
};
const roadCache = new Map();

function showOnly(id) {
  ['loading', 'external', 'error', 'register', 'app'].forEach((name) => $(name).hidden = name !== id);
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  setTimeout(() => $('toast').classList.remove('show'), 2800);
}

async function api(action, body) {
  const response = await fetch(`/api?action=${encodeURIComponent(action)}`, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: { ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify({ action, ...body }) : undefined,
  });
  const data = await response.json().catch(() => ({ ok: false, message: '伺服器回應異常' }));
  if (!response.ok || !data.ok) throw new Error(data.message || '操作失敗');
  return data;
}

function normalizePhoneInput(value) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.startsWith('886')) phone = `0${phone.slice(3)}`;
  return phone;
}

function setAddressBuilderVisible(prefix, visible) {
  $(`${prefix}-address-builder`).hidden = !visible;
  [`${prefix}-city`, `${prefix}-district`, `${prefix}-road`].forEach((id) => $(id).required = visible);
  const number = document.querySelector(`[name="${prefix}Number"]`);
  if (number) number.required = visible;
}

function fillDistricts(prefix) {
  const city = $(`${prefix}-city`).value;
  const district = $(`${prefix}-district`);
  district.innerHTML = `<option value="">${city ? '請選擇行政區' : '請先選縣市'}</option>${(DISTRICTS[city] || []).map((item) => `<option value="${item}">${item}</option>`).join('')}`;
  $(`${prefix}-road`).innerHTML = '<option value="">請先選行政區</option>';
}

async function loadRoads(prefix) {
  const city = $(`${prefix}-city`).value;
  const district = $(`${prefix}-district`).value;
  const road = $(`${prefix}-road`);
  if (!city || !district) { road.innerHTML = '<option value="">請先選行政區</option>'; return; }
  const cacheKey = `${city}|${district}`;
  road.disabled = true;
  road.innerHTML = '<option value="">正在載入道路…</option>';
  try {
    let roads = roadCache.get(cacheKey);
    if (!roads) {
      roads = (await api('address-options', { city, district })).roads;
      roadCache.set(cacheKey, roads);
    }
    road.innerHTML = roads.length
      ? `<option value="">請選擇道路</option>${roads.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('')}`
      : '<option value="">目前沒有可選道路，請聯絡客服</option>';
  } catch (error) {
    road.innerHTML = '<option value="">道路載入失敗，請重試</option>';
    toast(error.message);
  } finally {
    road.disabled = false;
  }
}

function setupAddressBuilder(prefix) {
  $(`${prefix}-city`).addEventListener('change', () => fillDistricts(prefix));
  $(`${prefix}-district`).addEventListener('change', () => loadRoads(prefix));
}

function structuredAddress(prefix, form) {
  const value = (name) => String(form.get(`${prefix}${name}`) || '').trim();
  const city = value('City');
  const district = value('District');
  const road = value('Road');
  const number = value('Number');
  if (!city || !district || !road || !number) return '';
  return `${city}${district}${road}${value('Section')}${value('Lane') ? `${value('Lane')}巷` : ''}${value('Alley') ? `${value('Alley')}弄` : ''}${number}號${value('Floor') ? `${value('Floor')}樓` : ''}`;
}

function selectedCandidate() {
  const selected = document.querySelector('input[name="customerMatch"]:checked');
  return state.lookupCandidates.find((item) => item.customerId === selected?.value) || null;
}

function resetRegistrationBranches() {
  state.registrationMode = '';
  $('member-found').hidden = true;
  $('new-member-prompt').hidden = true;
  $('registration-fields').hidden = true;
  setAddressBuilderVisible('reg', false);
}

function updateExistingMemberActions() {
  const candidate = selectedCandidate();
  $('confirm-existing-member').disabled = !candidate?.hasAddress;
  $('confirm-existing-member').textContent = candidate?.hasAddress ? '資料正確，繼續' : '此資料沒有可用地址';
  $('change-existing-address').textContent = candidate?.hasAddress ? '地址需要修改' : '新增配送地址';
  $('registration-fields').hidden = true;
  state.registrationMode = '';
}

function openRegistrationFields(mode) {
  state.registrationMode = mode;
  $('new-member-prompt').hidden = true;
  $('registration-fields').hidden = false;
  $('registration-name-row').hidden = mode !== 'new';
  $('registration-name').required = mode === 'new';
  $('registration-mode-title').textContent = mode === 'new' ? '建立新的會員資料' : '新增目前的配送地址';
  $('submit-registration').textContent = mode === 'new' ? '完成建立會員' : '儲存新地址並繼續';
  setAddressBuilderVisible('reg', true);
}

function renderCustomerLookup(result) {
  state.lookupPhone = result.phone;
  state.lookupCandidates = result.candidates || [];
  resetRegistrationBranches();
  $('lookup-result').hidden = false;
  if (!state.lookupCandidates.length) {
    $('lookup-result').className = 'lookup-result empty';
    $('lookup-result').textContent = '查無此電話的會員資料。';
    $('new-member-prompt').hidden = false;
  } else {
    $('lookup-result').className = 'lookup-result found';
    $('lookup-result').textContent = `查到 ${state.lookupCandidates.length} 筆會員資料，請確認是否正確。`;
    $('member-found').hidden = false;
    $('customer-match-section').hidden = false;
    $('customer-match-list').innerHTML = state.lookupCandidates.map((item, index) => `<label class="radio-row"><input type="radio" name="customerMatch" value="${escapeHtml(item.customerId)}" ${index ? '' : 'checked'}><span><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.address)}</small></span></label>`).join('');
    document.querySelectorAll('input[name="customerMatch"]').forEach((input) => input.addEventListener('change', updateExistingMemberActions));
    updateExistingMemberActions();
  }
}

function openSnapshotDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('shenglong-secure-cache-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getSnapshotKey() {
  const database = await openSnapshotDatabase();
  const existing = await new Promise((resolve, reject) => {
    const request = database.transaction('keys').objectStore('keys').get('member-key');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await new Promise((resolve, reject) => {
    const request = database.transaction('keys', 'readwrite').objectStore('keys').put(key, 'member-key');
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  return key;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function saveEncryptedSnapshot(data) {
  if (!data?.member || !crypto.subtle || !window.indexedDB) return;
  try {
    const key = await getSnapshotKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const payload = new TextEncoder().encode(JSON.stringify({ savedAt: Date.now(), data: {
      profile: data.profile, member: data.member, addresses: data.addresses, products: data.products,
    } }));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload);
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify({ iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(encrypted)) }));
  } catch {
    // Fast cache is optional; LINE verification remains the source of truth.
  }
}

async function loadEncryptedSnapshot() {
  if (!crypto.subtle || !window.indexedDB) return null;
  try {
    const stored = JSON.parse(localStorage.getItem(SNAPSHOT_STORAGE_KEY) || 'null');
    if (!stored?.iv || !stored?.ciphertext) return null;
    const key = await getSnapshotKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(stored.iv) }, key, base64ToBytes(stored.ciphertext),
    );
    const snapshot = JSON.parse(new TextDecoder().decode(decrypted));
    if (!snapshot.savedAt || Date.now() - snapshot.savedAt > SNAPSHOT_MAX_AGE_MS) {
      localStorage.removeItem(SNAPSHOT_STORAGE_KEY);
      return null;
    }
    return snapshot.data;
  } catch {
    localStorage.removeItem(SNAPSHOT_STORAGE_KEY);
    return null;
  }
}

function getProductUnitPrice(p) {
  if (p.hasHistory && p.price) return Number(p.price);
  return DEFAULT_PRICES[p.code] || 800;
}

function updateOrderSummary() {
  let subtotal = 0;
  let totalQuantity = 0;
  document.querySelectorAll('[data-product]').forEach((input) => {
    const qty = Number(input.value) || 0;
    const price = Number(input.dataset.price) || 0;
    subtotal += qty * price;
    totalQuantity += qty;
  });

  let discount = 0;
  if (state.appliedPromo && subtotal > 0) {
    discount = Math.min(state.appliedPromo.discount, subtotal);
  }

  const finalTotal = Math.max(0, subtotal - discount);

  $('summary-subtotal').textContent = `$${subtotal.toLocaleString('zh-TW')}`;
  if (discount > 0) {
    $('summary-discount-row').hidden = false;
    $('summary-discount').textContent = `-$${discount.toLocaleString('zh-TW')}`;
  } else {
    $('summary-discount-row').hidden = true;
  }
  $('summary-total').textContent = `$${finalTotal.toLocaleString('zh-TW')}`;
}

function renderProducts(products) {
  $('product-list').innerHTML = products.map((p) => {
    const unitPrice = getProductUnitPrice(p);
    const priceDisplay = `$${unitPrice.toLocaleString('zh-TW')}`;
    const historyNote = p.hasHistory ? '（會員專屬價）' : '';
    return `
      <div class="product-card" id="card-${escapeHtml(p.code)}">
        <div class="product-info">
          <strong>${escapeHtml(p.name)}</strong>
          <span class="product-spec-tag">${escapeHtml(p.spec)}</span>
          <div class="product-price-badge">${priceDisplay} / 桶 <small style="font-weight: normal; color: #6d7c72;">${historyNote}</small></div>
        </div>
        <div class="stepper">
          <button type="button" class="step-btn minus-btn" data-code="${escapeHtml(p.code)}">－</button>
          <input type="number" min="0" max="20" value="0" readonly class="step-qty" data-product="${escapeHtml(p.code)}" data-price="${unitPrice}" aria-label="${escapeHtml(p.name)}數量">
          <button type="button" class="step-btn plus-btn" data-code="${escapeHtml(p.code)}">＋</button>
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.minus-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      const input = document.querySelector(`input[data-product="${code}"]`);
      const card = document.getElementById(`card-${code}`);
      let val = Math.max(0, (Number(input.value) || 0) - 1);
      input.value = val;
      card.classList.toggle('selected', val > 0);
      updateOrderSummary();
    });
  });

  document.querySelectorAll('.plus-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      const input = document.querySelector(`input[data-product="${code}"]`);
      const card = document.getElementById(`card-${code}`);
      let val = Math.min(20, (Number(input.value) || 0) + 1);
      input.value = val;
      card.classList.toggle('selected', val > 0);
      updateOrderSummary();
    });
  });

  updateOrderSummary();
}

function renderAddresses(addresses) {
  $('address-list').innerHTML = addresses.map((a, i) => `<label class="radio-row"><input type="radio" name="addressId" value="${escapeHtml(a.id)}" ${a.isDefault || (!i && !addresses.some(x => x.isDefault)) ? 'checked' : ''}><span><strong>${escapeHtml(a.label)}</strong><br><small>${escapeHtml(a.address)}</small></span></label>`).join('');
}

function renderHistory(orders) {
  $('order-history').innerHTML = orders.length ? orders.map((o) => {
    const items = (o.items || []).map((item) => `<div class="history-line"><span>${escapeHtml(item.name)} × ${Number(item.quantity) || 0}</span><strong>${item.subtotal == null ? '沒有叫過此規格的瓦斯' : `$${Number(item.subtotal).toLocaleString('zh-TW')}`}</strong></div>`).join('');
    const createdAt = o.createdAt ? new Date(o.createdAt).toLocaleString('zh-TW') : '';
    return `<article class="history-item"><div class="history-head"><div><strong>${escapeHtml(o.id)}</strong><br><small>${escapeHtml(createdAt)}</small></div><span class="status">${escapeHtml(o.status)}</span></div>${items ? `<div class="history-lines">${items}</div>` : ''}<div class="history-foot"><small>${escapeHtml(o.address)}</small><strong>${o.total == null ? '金額待確認' : `訂單金額 $${Number(o.total).toLocaleString('zh-TW')}`}</strong></div></article>`;
  }).join('') : '<p class="muted">目前還沒有訂單紀錄。</p>';
}

function renderProfile() {
  const { member, addresses } = state.data;
  $('profile-content').innerHTML = `<div class="profile-row"><small>姓名</small><br><strong>${escapeHtml(member.contactName)}</strong></div><div class="profile-row"><small>電話</small><br><strong>${escapeHtml(member.phone)}</strong></div><div class="profile-row"><small>會員編號</small><br><strong>${escapeHtml(member.customerId)}</strong></div><div class="profile-row"><small>常用地址</small><br>${addresses.map(a => `<strong>${escapeHtml(a.label)}</strong>　${escapeHtml(a.address)}`).join('<br>')}</div>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function openView(view) {
  const safe = ['order', 'history', 'profile'].includes(view) ? view : 'order';
  document.querySelectorAll('.view').forEach((el) => el.hidden = el.id !== `view-${safe}`);
  document.querySelectorAll('.tabs button').forEach((el) => el.classList.toggle('active', el.dataset.view === safe));
  const url = new URL(location.href); url.searchParams.set('view', safe); history.replaceState(null, '', url);
}

function applyMemberData(data, persist = true) {
  const savedOrders = state.data?.orders || [];
  state.data = { ...state.data, ...data, orders: savedOrders };
  $('user-chip').textContent = state.data.profile.displayName || 'LINE 會員';
  $('user-chip').hidden = false;
  if (!state.data.member) return showOnly('register');
  renderProducts(state.data.products);
  renderAddresses(state.data.addresses);
  if (state.ordersLoaded) renderHistory(state.data.orders);
  else $('order-history').innerHTML = '<p class="muted">點選訂單紀錄後立即載入。</p>';
  renderProfile();
  showOnly('app');
  const view = new URLSearchParams(location.search).get('view') || 'order';
  openView(view);
  if (view === 'history') loadOrders();
  if (persist) saveEncryptedSnapshot(state.data);
}

async function refresh() {
  const data = await api('bootstrap');
  applyMemberData(data);
}

async function loadOrders() {
  if (state.ordersLoaded || state.ordersLoading || !state.data?.member) return;
  state.ordersLoading = true;
  $('order-history').innerHTML = '<div class="spinner"></div><p class="muted">正在載入訂單紀錄…</p>';
  try {
    const result = await api('orders');
    state.data.orders = result.orders;
    state.ordersLoaded = true;
    renderHistory(result.orders);
  } catch (error) {
    $('order-history').innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  } finally {
    state.ordersLoading = false;
  }
}

function loadLiffSdk() {
  if (window.liff) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('無法載入 LINE 服務'));
    document.head.appendChild(script);
  });
}

async function start() {
  const localDataPromise = loadEncryptedSnapshot();
  const fastDataPromise = api('fast-bootstrap').catch(() => null);
  const liffReadyPromise = loadLiffSdk().then(() => liff.init({ liffId: LIFF_ID, withLoginOnExternalBrowser: true }));
  try {
    const localData = await localDataPromise;
    if (localData?.member) {
      state.fastLoaded = true;
      applyMemberData(localData, false);
      fastDataPromise.then((data) => { if (data?.member) applyMemberData(data); });
    } else {
      const fastData = await fastDataPromise;
      if (fastData?.member) {
        state.fastLoaded = true;
        applyMemberData(fastData);
      }
    }
    await liffReadyPromise;
    if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
    state.token = liff.getAccessToken();
    if (!state.token) { showOnly('external'); return; }
    if (state.fastLoaded) refresh().catch((error) => toast(error.message));
    else await refresh();
  } catch (error) {
    if (state.fastLoaded) { toast('LINE 背景驗證稍後重試'); return; }
    $('error-text').textContent = error.message || '請關閉後從 LINE 再次開啟。';
    showOnly('error');
  }
}

document.querySelectorAll('.tabs button').forEach((button) => button.addEventListener('click', () => {
  openView(button.dataset.view);
  if (button.dataset.view === 'history') loadOrders();
}));
document.addEventListener('change', (event) => {
  if (event.target.name === 'addressId') {
    const isNew = event.target.value === 'new';
    $('new-address-fields').hidden = !isNew;
    setAddressBuilderVisible('order', isNew);
  }
});

$('register-phone').addEventListener('input', (event) => {
  if (state.lookupPhone && normalizePhoneInput(event.target.value) !== state.lookupPhone) {
    state.lookupPhone = '';
    state.lookupCandidates = [];
    state.registrationMode = '';
    $('lookup-result').hidden = true;
    resetRegistrationBranches();
  }
});

$('lookup-customer').addEventListener('click', async (event) => {
  const phone = normalizePhoneInput($('register-phone').value);
  if (phone.length < 8) { toast('請輸入正確的電話號碼'); return; }
  event.currentTarget.disabled = true;
  event.currentTarget.textContent = '查詢中…';
  try {
    renderCustomerLookup(await api('customer-lookup', { phone }));
  } catch (error) {
    toast(error.message);
  } finally {
    event.currentTarget.disabled = false;
    event.currentTarget.textContent = '查詢客戶';
  }
});

async function connectMember(customerId, address, name, button) {
  const phone = normalizePhoneInput($('register-phone').value);
  if (!state.lookupPhone || phone !== state.lookupPhone) { toast('請先用目前的電話查詢會員'); return; }
  button.disabled = true;
  try {
    await api('register', { name, phone, customerId, address, lookupConfirmed: true });
    toast(customerId ? '會員連結完成' : '會員建立完成');
    await refresh();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

$('confirm-existing-member').addEventListener('click', async (event) => {
  const candidate = selectedCandidate();
  if (!candidate?.hasAddress) { toast('這筆會員沒有可用地址，請先新增配送地址'); return; }
  await connectMember(candidate.customerId, '', '', event.currentTarget);
});

$('change-existing-address').addEventListener('click', () => {
  if (!selectedCandidate()) { toast('請先選擇會員資料'); return; }
  openRegistrationFields('new-address');
});

$('not-my-member').addEventListener('click', () => {
  $('member-found').hidden = true;
  $('registration-fields').hidden = true;
  $('lookup-result').className = 'lookup-result empty';
});

$('retry-other-phone')?.addEventListener('click', () => {
  $('register-phone').value = '';
  state.lookupPhone = '';
  state.lookupCandidates = [];
  $('lookup-result').hidden = true;
  resetRegistrationBranches();
  $('register-phone').focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('start-new-member').addEventListener('click', () => openRegistrationFields('new'));

$('apply-promo-btn')?.addEventListener('click', () => {
  const code = ($('promo-code-input').value || '').trim().toUpperCase();
  if (!code) { toast('請輸入優惠代碼'); return; }
  const promo = PROMO_CODES[code];
  if (promo) {
    state.appliedPromo = { code, ...promo };
    $('promo-desc').textContent = `${promo.name} (-$${promo.discount})`;
    $('promo-applied-badge').hidden = false;
    toast(`🎉 已成功套用：${promo.name}`);
  } else if (/^\d+$/.test(code) && Number(code) <= 300) {
    state.appliedPromo = { code, name: `店內特惠折抵 $${code}`, discount: Number(code) };
    $('promo-desc').textContent = `店內特惠折抵 (-$${code})`;
    $('promo-applied-badge').hidden = false;
    toast('🎉 已成功套用特惠折抵');
  } else {
    toast('此優惠代碼不存在或已過期');
    return;
  }
  updateOrderSummary();
});

$('remove-promo-btn')?.addEventListener('click', () => {
  state.appliedPromo = null;
  $('promo-code-input').value = '';
  $('promo-applied-badge').hidden = true;
  updateOrderSummary();
  toast('已移除優惠折抵');
});

$('register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const phone = normalizePhoneInput(form.get('phone'));
  if (!state.lookupPhone || phone !== state.lookupPhone) { toast('請先用目前的電話查詢客戶'); return; }
  if (!['new', 'new-address'].includes(state.registrationMode)) { toast('請先選擇正確的會員處理方式'); return; }
  const address = structuredAddress('reg', form);
  if (!address) { toast('請完整選擇縣市、行政區、道路與門牌號碼'); return; }
  const candidate = state.registrationMode === 'new-address' ? selectedCandidate() : null;
  if (state.registrationMode === 'new-address' && !candidate) { toast('請重新選擇會員資料'); return; }
  await connectMember(candidate?.customerId || '', address, state.registrationMode === 'new' ? form.get('name') : '', event.submitter || $('submit-registration'));
});

$('order-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const orderForm = event.currentTarget;
  const button = event.submitter || $('submit-order-btn');
  button.disabled = true;
  try {
    const form = new FormData(orderForm);
    const items = [...document.querySelectorAll('[data-product]')].map((input) => ({
      code: input.dataset.product,
      quantity: Number(input.value) || 0,
      unitPrice: Number(input.dataset.price) || 0,
    })).filter(i => i.quantity > 0);

    if (!items.length) throw new Error('請至少選擇 1 桶瓦斯規格');

    const addressId = form.get('addressId');
    const newAddress = addressId === 'new' ? structuredAddress('order', form) : '';
    if (addressId === 'new' && !newAddress) throw new Error('請完整選擇縣市、行政區、道路與門牌號碼');

    let subtotal = items.reduce((acc, cur) => acc + (cur.quantity * cur.unitPrice), 0);
    let discount = state.appliedPromo ? Math.min(state.appliedPromo.discount, subtotal) : 0;
    let total = Math.max(0, subtotal - discount);

    const result = await api('order', {
      requestId: crypto.randomUUID(),
      items,
      subtotal,
      discount,
      total,
      promoCode: state.appliedPromo?.code || '',
      promoName: state.appliedPromo?.name || '',
      addressId,
      newAddress,
      saveAddress: form.get('saveAddress') === 'on',
      addressLabel: form.get('addressLabel'),
      note: form.get('note'),
    });

    toast(result.duplicate ? '這筆訂單已送出' : `🎉 訂單已送出：${result.orderId}`);
    state.data.orders = result.orders || (result.order ? [result.order] : []);
    state.ordersLoaded = true;
    renderHistory(state.data.orders);
    
    // Reset order inputs
    document.querySelectorAll('[data-product]').forEach(i => {
      i.value = 0;
      document.getElementById(`card-${i.dataset.product}`)?.classList.remove('selected');
    });
    state.appliedPromo = null;
    $('promo-applied-badge').hidden = true;
    $('promo-code-input').value = '';
    updateOrderSummary();
    orderForm.reset();
    openView('history');
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});

setupAddressBuilder('reg');
setupAddressBuilder('order');
setAddressBuilderVisible('reg', false);
setAddressBuilderVisible('order', false);
start();
