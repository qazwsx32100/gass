// Initial Mock Data for BusinessPilot ERP v1.0 (Sheng-Long TaskAmigo Edition)

export const INITIAL_COMPANIES = [
  { id: 'COMP001', name: '盛隆瓦斯行', desc: '專業瓦斯配送及爐具修繕' }
];

export const INITIAL_SHAREHOLDERS = [
  {
    id: 'SH001',
    name: '張順安',
    email: 'qazwsx32100@gmail.com',
    idCard: 'A123456789',
    phone: '0912-345-678',
    password: '6789', // Last 4 digits of ID card A123456789
    role: 'business_reviewer',
    allowedCompanies: ['COMP001'],
    allowedTabs: ['dashboard', 'reports', 'inputs']
  },
  {
    id: 'SH002',
    name: '李美玲',
    email: 'meiling@example.com',
    idCard: 'B234567890',
    phone: '0923-456-789',
    password: '7890', // Last 4 digits of ID card B234567890
    role: 'readonly_shareholder',
    allowedCompanies: ['COMP001'],
    allowedTabs: ['dashboard'] // Can only see Dashboard!
  },
  {
    id: 'SH003',
    name: '陳志強',
    email: 'zhiqiang@example.com',
    idCard: 'C345678901',
    phone: '0934-567-890',
    password: '8901', // Last 4 digits of ID card C345678901
    role: 'bookkeeper',
    allowedCompanies: ['COMP001'],
    allowedTabs: ['dashboard', 'reports', 'inputs']
  }
];

export const INITIAL_BANKS = [
  { id: 'BANK001', companyId: 'COMP001', name: '第一銀行 - 盛隆活存', accountNo: '123-45-67890-1', initialBalance: 250000 },
  { id: 'BANK002', companyId: 'COMP001', name: '玉山銀行 - 盛隆週轉金', accountNo: '808-12-34567-8', initialBalance: 150000 },
  { id: 'BANK_PETTY', companyId: 'COMP001', name: '店內零用金 (現金)', accountNo: 'CASH-BOX-01', initialBalance: 10000 }
];

export const INITIAL_CHART_OF_ACCOUNTS = [
  // Revenues
  { code: '4101', name: '銷貨收入', type: 'revenue', desc: '主要商品營業收入' },
  { code: '4102', name: '維修服務收入', type: 'revenue', desc: '安裝及爐具檢修收入' },
  { code: '4103', name: '其他營業收入', type: 'revenue', desc: '非主營業務之金流' },
  { code: '4104', name: '爐具/零件銷貨收入', type: 'revenue', desc: '商品出貨收入' },
  { code: '410401', name: '雙口瓦斯爐', type: 'revenue', desc: '家用雙口防乾燒瓦斯爐（子項目）', subGroup: '爐具類' },
  { code: '410402', name: '強制排氣熱水器', type: 'revenue', desc: '16L 數位恆溫強制排氣熱水器（子項目）', subGroup: '熱水器類' },
  { code: '410403', name: '低壓安全調整器', type: 'revenue', desc: 'R280 帶超流切斷安全防護調整器（子項目）', subGroup: '調整器類' },
  
  // Cost of Goods Sold (COGS)
  { code: '5101', name: '進氣成本', type: 'cogs', desc: '瓦斯分裝廠進氣成本' },
  { code: '5102', name: '材料零件成本', type: 'cogs', desc: '爐具、管線與安全閥進貨' },
  { code: '510201', name: '雙口瓦斯爐', type: 'cogs', desc: '家用雙口防乾燒瓦斯爐（子項目）', subGroup: '爐具類' },
  { code: '510202', name: '強制排氣熱水器', type: 'cogs', desc: '16L 數位恆溫強制排氣熱水器（子項目）', subGroup: '熱水器類' },
  { code: '510203', name: '低壓安全調整器', type: 'cogs', desc: 'R280 帶超流切斷安全防護調整器（子項目）', subGroup: '調整器類' },
  
  // Operating Expenses
  { code: '6101', name: '員工薪資', type: 'expense', desc: '正職員工及配送司機薪資' },
  { code: '610101', name: '司機配送薪資', type: 'expense', desc: '小貨車配送司機月薪（子項目）' },
  { code: '6102', name: '店租費用', type: 'expense', desc: '店面與鋼瓶放置場租金' },
  { code: '6103', name: '車輛油資', type: 'expense', desc: '送貨小貨車之加油費用' },
  { code: '6104', name: '車輛折舊與維修', type: 'expense', desc: '貨車牌照、檢驗、損耗修繕' },
  { code: '6105', name: '水電瓦斯與電信', type: 'expense', desc: '水費、電費、店內瓦斯、電話費' },
  { code: '6106', name: '雜項支出', type: 'expense', desc: '文具、交際費、清潔用品等' }
];

// Historical shareholder operations for dynamic equity timeline
// Types: 'join' (入股), 'increase' (增資), 'decrease' (減資)
export const INITIAL_SHAREHOLDER_LEDGER = [
  // 2026-01-10: Company 1 founded (Sheng-Long)
  {
    id: 'SHL202601001',
    date: '2026-01-10',
    companyId: 'COMP001',
    shareholderId: 'SH001', // 張順安
    type: 'join',
    amount: 600000,
    remarks: '創始入股，出資 60%'
  },
  {
    id: 'SHL202601002',
    date: '2026-01-10',
    companyId: 'COMP001',
    shareholderId: 'SH002', // 李美玲
    type: 'join',
    amount: 400000,
    remarks: '創始入股，出資 40%'
  },
  // 2026-05-15: Shareholder 3 joins
  {
    id: 'SHL202605001',
    date: '2026-05-15',
    companyId: 'COMP001',
    shareholderId: 'SH003', // 陳志強
    type: 'join',
    amount: 200000,
    remarks: '新股東入股，總出資變 120萬'
  },
  // 2026-06-20: Shareholder 1 increases capital
  {
    id: 'SHL202606001',
    date: '2026-06-20',
    companyId: 'COMP001',
    shareholderId: 'SH001',
    type: 'increase',
    amount: 100000,
    remarks: '增資 10 萬元，調整持股比例'
  },
  // 2026-07-01: Shareholder 2 decreases capital (withdraws some investment)
  {
    id: 'SHL202607001',
    date: '2026-07-01',
    companyId: 'COMP001',
    shareholderId: 'SH002',
    type: 'decrease',
    amount: 100000,
    remarks: '資金變現需求，部分退股 10 萬元'
  }
];

export const INITIAL_INCOMES = [];

export const INITIAL_EXPENSES = [];

export const INITIAL_LOANS = [
  {
    id: 'LOAN001',
    companyId: 'COMP001',
    bankId: 'BANK001',
    name: '第一銀行 青年創業貸款',
    principal: 500000,
    interestRate: 2.1,
    months: 36,
    startDate: '2026-02-15',
    monthlyPayment: 14350,
    status: 'approved',
    remarks: '購置送貨新小貨車及周轉金使用'
  }
];

export const INITIAL_BANK_TRANSACTIONS = [];

export const INITIAL_GAS_INVENTORY_PERIODS = [];

export const INITIAL_LOGS = [
  { id: 'LOG202606001', timestamp: '2026-06-01 09:12:00', operator: '系統管理員', action: '初始化', details: '系統資料庫初始化，載入盛隆瓦斯行開戶餘額。' },
  { id: 'LOG202606201', timestamp: '2026-06-20 14:35:12', operator: '張順安', action: '登記股東往來', details: '登記股東張順安增資 $100,000 元，調整持股佔比。' }
];
