import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, setDoc } from 'firebase/firestore';

let app = null;
let db = null;
let unsubscribe = null;
let isSyncing = false; // Prevent circular sync loops

export const getFirebaseConfig = () => {
  // 1. Check localstorage first (Admin custom entry)
  try {
    const data = localStorage.getItem('bp_firebase_config');
    if (data) return JSON.parse(data);
  } catch {}

  // 2. Fallback to Vite environment variables (Vercel/production deployment)
  if (import.meta.env && import.meta.env.VITE_FIREBASE_PROJECT_ID && import.meta.env.VITE_FIREBASE_API_KEY) {
    return {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || '',
      appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
    };
  }

  return null;
};

export const saveFirebaseConfig = (config) => {
  if (config) {
    localStorage.setItem('bp_firebase_config', JSON.stringify(config));
  } else {
    localStorage.removeItem('bp_firebase_config');
    localStorage.removeItem('bp_cloud_updated_at');
  }
};

export const isFirebaseConnected = () => {
  const config = getFirebaseConfig();
  return !!(config && config.projectId && config.apiKey);
};

export const initFirebase = (onSync) => {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  const config = getFirebaseConfig();
  if (!config || !config.projectId || !config.apiKey) {
    app = null;
    db = null;
    return false;
  }

  try {
    const firebaseConfig = {
      apiKey: config.apiKey,
      authDomain: config.authDomain || `${config.projectId}.firebaseapp.com`,
      projectId: config.projectId,
      databaseURL: config.databaseURL,
      appId: config.appId
    };

    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);

    // Set up real-time listener on document projects/{projectId}
    const docRef = doc(db, 'projects', config.projectId);
    unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const cloudData = docSnap.data();
        
        // Prevent loop if we are the ones who just uploaded it
        const localUpdatedAt = parseInt(localStorage.getItem('bp_cloud_updated_at') || '0', 10);
        const cloudUpdatedAt = cloudData.updatedAt || 0;
        
        if (cloudUpdatedAt > localUpdatedAt && !isSyncing) {
          isSyncing = true;
          console.log(`Cloud database is newer (${cloudUpdatedAt} > ${localUpdatedAt}). Syncing...`);
          
          // Write to localstorage cache
          if (cloudData.companies) localStorage.setItem('bp_companies', JSON.stringify(cloudData.companies));
          if (cloudData.shareholders) localStorage.setItem('bp_shareholders', JSON.stringify(cloudData.shareholders));
          if (cloudData.banks) localStorage.setItem('bp_banks', JSON.stringify(cloudData.banks));
          if (cloudData.chartOfAccounts) localStorage.setItem('bp_chart_of_accounts', JSON.stringify(cloudData.chartOfAccounts));
          if (cloudData.shareholderLedger) localStorage.setItem('bp_shareholder_ledger', JSON.stringify(cloudData.shareholderLedger));
          if (cloudData.incomes) localStorage.setItem('bp_incomes', JSON.stringify(cloudData.incomes));
          if (cloudData.expenses) localStorage.setItem('bp_expenses', JSON.stringify(cloudData.expenses));
          if (cloudData.loans) localStorage.setItem('bp_loans', JSON.stringify(cloudData.loans));
          if (cloudData.bankTransactions) localStorage.setItem('bp_bank_transactions', JSON.stringify(cloudData.bankTransactions));
          if (cloudData.bankReconciliations) localStorage.setItem('bp_bank_reconciliations', JSON.stringify(cloudData.bankReconciliations));
          if (cloudData.fixedAssets) localStorage.setItem('bp_fixed_assets', JSON.stringify(cloudData.fixedAssets));
          if (cloudData.gasInventoryPeriods) localStorage.setItem('bp_gas_inventory_periods', JSON.stringify(cloudData.gasInventoryPeriods));
          if (cloudData.customers) localStorage.setItem('bp_customers', JSON.stringify(cloudData.customers));
          if (cloudData.suppliers) localStorage.setItem('bp_suppliers', JSON.stringify(cloudData.suppliers));
          if (cloudData.logs) localStorage.setItem('bp_logs', JSON.stringify(cloudData.logs));
          
          localStorage.setItem('bp_cloud_updated_at', String(cloudUpdatedAt));
          isSyncing = false;
          
          if (onSync) {
            onSync(cloudData.updatedBy || '其他使用者');
          }
        }
      }
    }, (error) => {
      console.error("Firebase Sync Listener Error: ", error);
    });

    return true;
  } catch (e) {
    console.error("Firebase Initialization Failed: ", e);
    return false;
  }
};

export const syncLocalToCloud = async (operatorName = '系統') => {
  const config = getFirebaseConfig();
  if (!config || !config.projectId || !config.apiKey) {
    return false;
  }

  if (!db) {
    const connected = initFirebase();
    if (!connected) return false;
  }
  
  if (isSyncing) return false;
  
  isSyncing = true;

  try {
    const updatedAt = new Date().getTime();
    
    // Read from localstorage
    const readLocal = (key) => {
      const d = localStorage.getItem(key);
      return d ? JSON.parse(d) : [];
    };

    const payload = {
      companies: readLocal('bp_companies'),
      shareholders: readLocal('bp_shareholders'),
      banks: readLocal('bp_banks'),
      chartOfAccounts: readLocal('bp_chart_of_accounts'),
      shareholderLedger: readLocal('bp_shareholder_ledger'),
      incomes: readLocal('bp_incomes'),
      expenses: readLocal('bp_expenses'),
      loans: readLocal('bp_loans'),
      bankTransactions: readLocal('bp_bank_transactions'),
      bankReconciliations: readLocal('bp_bank_reconciliations'),
      fixedAssets: readLocal('bp_fixed_assets'),
      gasInventoryPeriods: readLocal('bp_gas_inventory_periods'),
      customers: readLocal('bp_customers'),
      suppliers: readLocal('bp_suppliers'),
      logs: readLocal('bp_logs'),
      updatedAt,
      updatedBy: operatorName
    };

    const docRef = doc(db, 'projects', config.projectId);
    await setDoc(docRef, payload, { merge: true });
    
    localStorage.setItem('bp_cloud_updated_at', String(updatedAt));
    console.log('Successfully synced local database to Firebase cloud!');
    isSyncing = false;
    return true;
  } catch (e) {
    console.error('Failed to sync to Firebase Firestore: ', e);
    isSyncing = false;
    return false;
  }
};

export const disconnectFirebase = () => {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  app = null;
  db = null;
  saveFirebaseConfig(null);
  localStorage.removeItem('bp_cloud_updated_at');
};
