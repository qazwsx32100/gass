import React, { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import { ArrowLeft, LogOut, Menu, X } from 'lucide-react';
import { initializeDB, cleanupInactiveCompanies, getCompanies, getShareholders, getAdminDisplayName, getCurrentDevice, verifyLogin, updatePassword, USER_ROLES, createDailyBackupIfNeeded } from './db/storage';
import { clearCloudSessionToken, getCloudSessionToken, getLastCloudSyncError, initSupabaseSync, isSupabaseConnected, loginViaCloud, syncLocalToSupabase } from './db/supabaseService';
import { getAllowedTabsForUser } from './utils/permissions';
import { setMonitoringContext, setMonitoringUser } from './monitoring';

const pageLoaders = {
  dashboard: () => import('./pages/DashboardView'),
  inputs: () => import('./pages/InputsView'),
  reports: () => import('./pages/ReportsView'),
  settings: () => import('./pages/SettingsView'),
  firebase: () => import('./pages/FirebaseView'),
  cylinders: () => import('./pages/CylindersView'),
  shareholderZone: () => import('./pages/ShareholderZoneView'),
  auditZone: () => import('./pages/AuditZoneView')
};

const DashboardView = lazy(pageLoaders.dashboard);
const InputsView = lazy(pageLoaders.inputs);
const ReportsView = lazy(pageLoaders.reports);
const SettingsView = lazy(pageLoaders.settings);
const FirebaseView = lazy(pageLoaders.firebase);
const CylindersView = lazy(pageLoaders.cylinders);
const ShareholderZoneView = lazy(pageLoaders.shareholderZone);
const AuditZoneView = lazy(pageLoaders.auditZone);

const currentTaiwanPeriod = (() => {
  const value = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit'
  }).format(new Date());
  const [year, month] = value.split('/');
  return { year: Number.parseInt(year, 10) || 2026, month: month || '07' };
})();

const PageLoading = () => (
  <div role="status" aria-live="polite" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 700 }}>
    正在載入功能...
  </div>
);

function App() {
  const [dbVersion, setDbVersion] = useState(0); // Trigger state refreshes across components
  const [activeTab, setActiveTab] = useState('dashboard');
  const [tabHistory, setTabHistory] = useState(['dashboard']);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    setTabHistory(prev => {
      if (prev[prev.length - 1] === activeTab) return prev;
      return [...prev, activeTab].slice(-50);
    });
  }, [activeTab]);

  const handleGoBack = () => {
    if (tabHistory.length > 1) {
      const newHistory = [...tabHistory];
      newHistory.pop();
      const prevTab = newHistory[newHistory.length - 1];
      setActiveTab(prevTab);
      setTabHistory(newHistory);
      setIsMobileNavOpen(false);
    }
  };

  const handleSelectTab = (tab) => {
    setActiveTab(tab);
    setIsMobileNavOpen(false);
  };

  useEffect(() => {
    if (!isMobileNavOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsMobileNavOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isMobileNavOpen]);
  
  // Login Authentication States
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [currentUser, setCurrentUser] = useState(null); // { id, name, email }
  
  // Login Form States
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Password Change Modal States
  const [isChangePwdOpen, setIsChangePwdOpen] = useState(false);
  const [isForcePasswordChange, setIsForcePasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Period / Company Selector States
  const [currentCompanyId, setCurrentCompanyId] = useState('COMP001');
  const [currentYear, setCurrentYear] = useState(currentTaiwanPeriod.year);
  const [currentMonth, setCurrentMonth] = useState(currentTaiwanPeriod.month);
  const [toasts, setToasts] = useState([]);
  const [isDataReady, setIsDataReady] = useState(false);

  // Initialize DB on mount
  useEffect(() => {
    let cancelled = false;

    const migrateAccountCounterparts = () => {
      const coaKey = 'bp_chart_of_accounts';
      const coaStr = localStorage.getItem(coaKey);
      if (!coaStr) return false;

      try {
        const coa = JSON.parse(coaStr);
        let changed = false;
        if (!coa.some(account => account.code === '4104')) {
          coa.push({ code: '4104', name: '爐具/零件銷貨收入', type: 'revenue', desc: '商品出貨收入' });
          changed = true;
        }
        const existingCodes = new Set(coa.map(account => account.code));
        coa
          .filter(account => account.code.startsWith('5102') && account.code !== '5102')
          .forEach(account => {
            const targetCode = `4104${account.code.slice(4)}`;
            if (existingCodes.has(targetCode)) return;
            coa.push({
              code: targetCode,
              name: account.name,
              type: 'revenue',
              desc: account.desc || '',
              subGroup: account.subGroup || ''
            });
            existingCodes.add(targetCode);
            changed = true;
          });
        if (changed) localStorage.setItem(coaKey, JSON.stringify(coa));
        return changed;
      } catch (error) {
        console.error('Account migration failed', error);
        return false;
      }
    };

    const clearLegacyIncome = () => {
      const migrationKey = 'bp_mock_cleared_v4_cloud';
      if (localStorage.getItem(migrationKey)) return false;

      let changed = false;
      try {
        const incomeKey = 'bp_incomes';
        const incomes = JSON.parse(localStorage.getItem(incomeKey) || '[]');
        const filtered = incomes.filter(item => item.id !== 'REV202607001');
        changed = filtered.length !== incomes.length;
        if (changed) localStorage.setItem(incomeKey, JSON.stringify(filtered));
      } catch (error) {
        console.error('Legacy income cleanup failed', error);
      } finally {
        localStorage.setItem(migrationKey, 'true');
      }
      return changed;
    };

    const boot = async () => {
      initializeDB();
      cleanupInactiveCompanies();
      const rememberedEmail = localStorage.getItem('bp_last_login_email') || '';
      const savedSession = localStorage.getItem('bp_login_session');
      if (rememberedEmail) {
        setLoginEmail(rememberedEmail);
      }

      let restoredSession = null;
      if (savedSession) {
        try {
          const session = JSON.parse(savedSession);
          if (session?.user?.id && session?.role) {
            restoredSession = session;
          }
        } catch {
          localStorage.removeItem('bp_login_session');
        }
      }

      const cloudConnected = isSupabaseConnected();
      if (restoredSession && cloudConnected && !getCloudSessionToken()) {
        localStorage.removeItem('bp_login_session');
        restoredSession = null;
      }
      if (!restoredSession) clearCloudSessionToken();

      // Clear one-time verification tokens from the address bar.
      const params = new URLSearchParams(window.location.search);
      const verifyEmailToken = params.get('verifyEmailToken');
      if (verifyEmailToken) {
        window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
      }

      setDbVersion(prev => prev + 1);

      if (!cloudConnected) {
        if (restoredSession) {
          setIsLoggedIn(true);
          setUserRole(restoredSession.role);
          setCurrentUser(restoredSession.user);
          if (restoredSession.user.requiresPasswordChange) {
            setIsForcePasswordChange(true);
            setIsChangePwdOpen(true);
          }
        }
        const { initFirebase } = await import('./db/firebaseService');
        if (cancelled) return;
        initFirebase((updatedBy) => {
          if (cancelled) return;
          showToast(`☁️ 偵測到雲端資料更新（來自：${updatedBy}），已即時同步畫面。`, 'info');
          setDbVersion(prev => prev + 1);
        });
        setIsDataReady(true);
        if (restoredSession && migrateAccountCounterparts()) setDbVersion(prev => prev + 1);
        return;
      }

      if (!restoredSession) {
        setIsDataReady(true);
        return;
      }

      const validatedSession = await initSupabaseSync((updatedBy) => {
        if (cancelled) return;
        showToast(`☁️ 偵測到雲端資料更新（來自：${updatedBy}），已同步畫面。`, 'info');
        setDbVersion(prev => prev + 1);
      });
      if (cancelled) return;

      if (!validatedSession) {
        localStorage.removeItem('bp_login_session');
        clearCloudSessionToken();
        setIsLoggedIn(false);
        setUserRole('');
        setCurrentUser(null);
        setIsDataReady(true);
        const error = getLastCloudSyncError();
        showToast(error?.error || '雲端登入已失效，請重新登入。', 'error');
        setDbVersion(prev => prev + 1);
        return;
      }

      const verifiedRole = validatedSession.role || restoredSession.role;
      const verifiedUser = {
        ...restoredSession.user,
        ...(validatedSession === true ? {} : validatedSession),
        role: verifiedRole
      };
      setIsLoggedIn(true);
      setUserRole(verifiedRole);
      setCurrentUser(verifiedUser);
      setIsDataReady(true);
      localStorage.setItem('bp_login_session', JSON.stringify({ role: verifiedRole, user: verifiedUser }));
      if (verifiedUser.requiresPasswordChange) {
        setIsForcePasswordChange(true);
        setIsChangePwdOpen(true);
      }

      const needsMaintenanceSync = [
        clearLegacyIncome(),
        migrateAccountCounterparts(),
        createDailyBackupIfNeeded('系統每日備份')
      ].some(Boolean);
      if (needsMaintenanceSync) await syncLocalToSupabase('系統啟動維護');
      if (!cancelled) setDbVersion(prev => prev + 1);
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleDataChanged = () => {
      setDbVersion(prev => prev + 1);
    };
    window.addEventListener('bp_data_changed', handleDataChanged);
    return () => window.removeEventListener('bp_data_changed', handleDataChanged);
  }, []);

  // Toast Helper
  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const handleDataChange = async () => {
    setDbVersion(prev => prev + 1);
    createDailyBackupIfNeeded(currentUser?.name || '系統');
    const supabaseSynced = isSupabaseConnected()
      ? await syncLocalToSupabase(currentUser?.name || '系統')
      : true;
    if (!supabaseSynced) {
      const error = getLastCloudSyncError();
      showToast(error?.error || '資料尚未同步到雲端，請稍後再試。', 'error');
    }
    return supabaseSynced;
  };

  // Shareholders & Companies Lookups
  const lookupSnapshot = useMemo(() => ({
    version: dbVersion,
    shareholders: getShareholders(),
    companies: getCompanies()
  }), [dbVersion]);
  const shareholders = lookupSnapshot.shareholders;
  const allCompanies = lookupSnapshot.companies;

  // Determine allowed companies based on logged-in user permissions
  const allowedCompanies = useMemo(() => {
    if (!isLoggedIn || !currentUser) return [];
    if (userRole === USER_ROLES.ADMIN) {
      return allCompanies;
    }
    // If shareholder, find allowed companies mapping
    const sh = shareholders.find(s => s.id === currentUser.id);
    if (!sh || !sh.allowedCompanies) {
      return allCompanies.filter(c => c.id === 'COMP001'); // Default fallback
    }
    return allCompanies.filter(c => sh.allowedCompanies.includes(c.id));
  }, [isLoggedIn, userRole, currentUser, allCompanies, shareholders]);

  // Determine allowed tabs based on permissions
  const allowedTabs = useMemo(() => {
    if (!isLoggedIn || !currentUser) return [];
    const latestUser = userRole === USER_ROLES.ADMIN
      ? currentUser
      : shareholders.find(s => s.id === currentUser.id) || currentUser;
    return getAllowedTabsForUser(userRole, latestUser);
  }, [isLoggedIn, userRole, currentUser, shareholders]);

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    const commonTabs = ['reports', 'inputs', 'cylinders']
      .filter(tab => allowedTabs.includes(tab));
    const preload = () => commonTabs.forEach(tab => pageLoaders[tab]());

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(preload, { timeout: 2000 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(preload, 500);
    return () => window.clearTimeout(timeoutId);
  }, [isLoggedIn, allowedTabs]);

  useEffect(() => {
    if (!isLoggedIn || !currentUser || userRole !== USER_ROLES.ADMIN) return;
    const adminName = getAdminDisplayName();
    if (!adminName || currentUser.name === adminName) return;

    const updatedUser = { ...currentUser, name: adminName };
    setCurrentUser(updatedUser);
    localStorage.setItem('bp_login_session', JSON.stringify({ role: userRole, user: updatedUser }));
  }, [isLoggedIn, userRole, currentUser, dbVersion]);

  // Auto-redirect allowed company and tab
  useEffect(() => {
    if (isLoggedIn && allowedCompanies.length > 0) {
      const isAllowed = allowedCompanies.some(c => c.id === currentCompanyId);
      if (!isAllowed) {
        setCurrentCompanyId(allowedCompanies[0].id);
      }
    }
    if (isLoggedIn && allowedTabs.length > 0) {
      const isTabAllowed = allowedTabs.includes(activeTab);
      if (!isTabAllowed) {
        setActiveTab(allowedTabs[0]);
      }
    }
  }, [isLoggedIn, allowedCompanies, allowedTabs, currentCompanyId, activeTab]);

  const activeCompany = useMemo(() => {
    return allCompanies.find(c => c.id === currentCompanyId) || allowedCompanies[0] || allCompanies[0];
  }, [currentCompanyId, allCompanies, allowedCompanies]);

  useEffect(() => {
    setMonitoringUser(isLoggedIn && currentUser?.id
      ? { id: currentUser.id, role: userRole }
      : null);
  }, [isLoggedIn, currentUser?.id, userRole]);

  useEffect(() => {
    setMonitoringContext({
      companyId: currentCompanyId || 'unknown',
      activeTab: activeTab || 'unknown'
    });
  }, [currentCompanyId, activeTab]);

  // Handle Login Submission
  const handleLogin = async (e) => {
    e.preventDefault();
    const result = isSupabaseConnected()
      ? await loginViaCloud({ email: loginEmail, password: loginPassword, device: getCurrentDevice() })
      : verifyLogin(loginEmail, loginPassword);
    if (result.success) {
      setIsLoggedIn(true);
      setUserRole(result.role);
      setCurrentUser(result.user);
      setLoginError('');
      setLoginPassword('');
      localStorage.setItem('bp_last_login_email', result.user.email || loginEmail);
      localStorage.setItem('bp_login_session', JSON.stringify({ role: result.role, user: result.user }));
      if (result.user.requiresPasswordChange) {
        setIsForcePasswordChange(true);
        setIsChangePwdOpen(true);
      }
      if (isSupabaseConnected()) {
        await initSupabaseSync((updatedBy) => {
          showToast(`☁️ 偵測到雲端資料更新（來自：${updatedBy}），已同步畫面。`, 'info');
          setDbVersion(prev => prev + 1);
        });
      }
      showToast(`👋 歡迎回來，${result.user.name}！系統已成功載入您的權限。`, 'success');
    } else {
      setLoginError(result.error);
      showToast('❌ 登入失敗！請確認帳號密碼。', 'error');
    }
  };

  // Handle Logout
  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserRole('');
    setCurrentUser(null);
    setIsForcePasswordChange(false);
    setIsChangePwdOpen(false);
    setActiveTab('dashboard');
    setTabHistory(['dashboard']);
    localStorage.removeItem('bp_login_session');
    clearCloudSessionToken();
    showToast('🚪 您已安全登出系統。', 'info');
  };

  // Handle Password Change
  const handleChangePassword = (e) => {
    e.preventDefault();
    if (newPassword.length < 4) {
      showToast('❌ 密碼長度至少需要 4 位數！', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('❌ 兩次輸入的密碼不一致！', 'error');
      return;
    }

    const success = updatePassword(currentUser.id, newPassword);
    if (success) {
      setIsChangePwdOpen(false);
      setIsForcePasswordChange(false);
      const updatedUser = { ...currentUser, requiresPasswordChange: false };
      setCurrentUser(updatedUser);
      localStorage.setItem('bp_login_session', JSON.stringify({ role: userRole, user: updatedUser }));
      setNewPassword('');
      setConfirmPassword('');
      handleDataChange();
      showToast('🔒 密碼變更成功！請記住您的新密碼。', 'success');
    } else {
      showToast('❌ 密碼變更失敗，找不到使用者！', 'error');
    }
  };

  if (!isDataReady) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontWeight: 700
      }}>
        正在載入雲端資料...
      </div>
    );
  }

  // If not logged in, show Login Screen (TaskAmigo Theme)
  if (!isLoggedIn) {
    return (
      <div className="login-page" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#e8f8f5', // TaskAmigo Background color
        fontFamily: 'var(--font-sans)',
        color: 'var(--text-primary)'
      }}>
        <div className="login-card" style={{
          width: '90%',
          maxWidth: '440px',
          backgroundColor: '#ffffff',
          border: '2px solid rgba(5, 178, 165, 0.2)',
          borderRadius: '24px',
          padding: '40px',
          textAlign: 'center',
          boxShadow: 'var(--shadow-lg)'
        }}>
          <img 
            src="/logo.jpg" 
            alt="盛隆瓦斯 Logo" 
            style={{
              width: '100px',
              height: '100px',
              borderRadius: '24px',
              objectFit: 'cover',
              margin: '0 auto 20px auto',
              display: 'block',
              boxShadow: '0 6px 16px rgba(0, 0, 0, 0.1)'
            }} 
          />
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#05b2a5', marginBottom: '28px', letterSpacing: '-0.5px' }}>
            朝有錢人邁進
          </h2>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
            <div className="form-group">
              <label className="form-label" style={{ color: '#05b2a5' }}>登入帳號 (電子信箱)</label>
              <input
                type="email"
                required
                placeholder="email@example.com"
                className="form-control"
                style={{ borderRadius: '12px' }}
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '8px' }}>
              <label className="form-label" style={{ color: '#05b2a5' }}>登入密碼</label>
              <input
                type="password"
                required
                placeholder="請輸入密碼"
                className="form-control"
                style={{ borderRadius: '12px' }}
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                * 股東初始密碼為您的身分證號碼後 4 碼。
              </span>
            </div>

            {loginError && (
              <div style={{ color: 'var(--accent-red)', fontSize: '0.8rem', fontWeight: '600', backgroundColor: 'rgba(239, 68, 68, 0.08)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                ⚠️ {loginError}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ padding: '12px', borderRadius: '12px', fontSize: '1rem', marginTop: '12px' }}>
              驗證身分並登入 ERP
            </button>
          </form>

        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <button
        type="button"
        className={`sidebar-backdrop ${isMobileNavOpen ? 'visible' : ''}`}
        aria-label="關閉功能選單"
        aria-hidden={!isMobileNavOpen}
        tabIndex={isMobileNavOpen ? 0 : -1}
        onClick={() => setIsMobileNavOpen(false)}
      />

      {/* Sidebar navigation */}
      <aside className={`sidebar ${isMobileNavOpen ? 'mobile-open' : ''}`} aria-label="主要功能選單">
        <div className="sidebar-logo">
          <img 
            src="/logo.jpg" 
            alt="Logo" 
            style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '10px', 
              objectFit: 'cover',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)'
            }} 
          />
          <div>
            <div className="sidebar-logo-text" style={{ fontSize: '1.05rem', fontWeight: '800', letterSpacing: '-0.3px' }}>盛隆瓦斯</div>
            <div className="sidebar-logo-sub" style={{ fontSize: '0.72rem' }}>營運管理系統 v1.0</div>
          </div>
          <button
            type="button"
            className="mobile-nav-close"
            aria-label="關閉功能選單"
            title="關閉功能選單"
            onClick={() => setIsMobileNavOpen(false)}
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        <div className="sidebar-nav">
          <span className="sidebar-nav-heading">📊 營業分析</span>
          {allowedTabs.includes('dashboard') && (
            <button className={`sidebar-link ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => handleSelectTab('dashboard')}>
              <span className="sidebar-link-icon">📈</span>
              營運總覽
            </button>
          )}
          {allowedTabs.includes('reports') && (
            <button className={`sidebar-link ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => handleSelectTab('reports')}>
              <span className="sidebar-link-icon">📊</span>
              財務報表
            </button>
          )}

          {allowedTabs.includes('inputs') && (
            <>
              <span className="sidebar-nav-heading">📥 帳務管理</span>
              <button className={`sidebar-link ${activeTab === 'inputs' ? 'active' : ''}`} onClick={() => handleSelectTab('inputs')}>
                <span className="sidebar-link-icon">📝</span>
                日常金流
              </button>
              <button className={`sidebar-link ${activeTab === 'cylinders' ? 'active' : ''}`} onClick={() => handleSelectTab('cylinders')}>
                <span className="sidebar-link-icon">🍼</span>
                鋼瓶狀態
              </button>
            </>
          )}
          {allowedTabs.includes('shareholderZone') && (
            <>
              <span className="sidebar-nav-heading">👑 股東權益</span>
              <button className={`sidebar-link ${activeTab === 'shareholderZone' ? 'active' : ''}`} onClick={() => handleSelectTab('shareholderZone')}>
                <span className="sidebar-link-icon">👑</span>
                股東專區
              </button>
            </>
          )}
          {allowedTabs.includes('auditZone') && (
            <>
              <span className="sidebar-nav-heading">🔍 系統稽核</span>
              <button className={`sidebar-link ${activeTab === 'auditZone' ? 'active' : ''}`} onClick={() => handleSelectTab('auditZone')}>
                <span className="sidebar-link-icon">🔍</span>
                查核專區
              </button>
            </>
          )}
          
          {allowedTabs.includes('settings') && (
            <>
              <span className="sidebar-nav-heading">⚙️ 設定與名冊</span>
              <button className={`sidebar-link ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => handleSelectTab('settings')}>
                <span className="sidebar-link-icon">👤</span>
                {userRole === USER_ROLES.ADMIN ? '基本資料設定' : '股東基本資料'}
              </button>
            </>
          )}

          {userRole === USER_ROLES.ADMIN && allowedTabs.includes('firebase') && (
            <>
              <span className="sidebar-nav-heading">🌐 雲端同步</span>
              <button className={`sidebar-link ${activeTab === 'firebase' ? 'active' : ''}`} onClick={() => handleSelectTab('firebase')}>
                <span className="sidebar-link-icon">🌐</span>
                雲端同步分享
              </button>
            </>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <div className="user-badge" onClick={() => setIsChangePwdOpen(true)} style={{ cursor: 'pointer' }} title="點擊修改密碼">
            <div className="user-avatar">
              {currentUser.name.substring(0, 1)}
            </div>
            <div className="user-info">
              <span className="user-name">{currentUser.name}</span>
              <span className="user-role" style={{ color: 'var(--accent-blue)', textDecoration: 'underline', fontSize: '0.7rem' }}>
                ✏️ 修改密碼
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="main-wrapper">
        <header className="header">
          {/* Company switcher */}
          <div className="header-primary">
            <button
              type="button"
              className="mobile-nav-trigger"
              aria-label="開啟功能選單"
              aria-expanded={isMobileNavOpen}
              title="功能選單"
              onClick={() => setIsMobileNavOpen(true)}
            >
              <Menu size={23} aria-hidden="true" />
            </button>
            {tabHistory.length > 1 && (
              <button 
                onClick={handleGoBack}
                className="btn btn-secondary btn-sm header-back-button"
              >
                <ArrowLeft size={17} aria-hidden="true" />
                <span>回上一頁</span>
              </button>
            )}
            <div className="header-title-section">
              <span className="header-title">{activeCompany?.name || '公司'}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {activeCompany?.desc || '營運報表系統'}
              </span>
            </div>

            {allowedCompanies.length > 1 && (
              <select
                className="select-dropdown header-company-select"
                aria-label="切換公司"
                value={currentCompanyId}
                onChange={e => {
                  setCurrentCompanyId(e.target.value);
                  showToast(`🏢 已切換至授權公司：${allCompanies.find(c => c.id === e.target.value)?.name}`, 'info');
                }}
              >
                {allowedCompanies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Period selector & Login badge at right end (matching TaskAmigo mockup) */}
          <div className="header-controls">
            {/* 1. Period selects */}
            <div className="header-period-control">
              <span className="header-period-label">會計期間：</span>
              <select
                className="select-dropdown"
                aria-label="會計年度"
                style={{ padding: '6px 10px' }}
                value={currentYear}
                onChange={e => {
                  setCurrentYear(parseInt(e.target.value, 10));
                }}
              >
                <option value="2025">2025 年</option>
                <option value="2026">2026 年</option>
                <option value="2027">2027 年</option>
              </select>

              <select
                className="select-dropdown"
                aria-label="會計月份"
                style={{ padding: '6px 10px' }}
                value={currentMonth}
                onChange={e => {
                  setCurrentMonth(e.target.value);
                }}
              >
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                  <option key={m} value={m}>{m} 月</option>
                ))}
              </select>
            </div>

            <div className="header-divider" />

            {/* 2. User info & Logout button */}
            <div className="header-user-actions">
              <span className="header-user-name">
                {currentUser.name}
              </span>
              
              <button 
                onClick={handleLogout} 
                className="btn btn-secondary btn-sm header-logout-button"
                title="登出"
              >
                <LogOut size={17} aria-hidden="true" />
                <span>登出</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page rendering */}
        <main className="page-container">
          <Suspense fallback={<PageLoading />}>
          {activeTab === 'dashboard' && (
            <DashboardView
              companyId={currentCompanyId}
              year={currentYear}
              month={currentMonth}
              triggerRefresh={dbVersion}
              userRole={userRole}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'inputs' && (
            <InputsView
              companyId={currentCompanyId}
              triggerRefresh={dbVersion}
              onDataChange={handleDataChange}
              operatorName={currentUser.name}
              currentUser={currentUser}
              userRole={userRole}
            />
          )}

          {activeTab === 'cylinders' && (
            <CylindersView
              companyId={currentCompanyId}
              triggerRefresh={dbVersion}
              onDataChange={handleDataChange}
              operatorName={currentUser?.name}
              currentUser={currentUser}
              userRole={userRole}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              companyId={currentCompanyId}
              year={currentYear}
              month={currentMonth}
              triggerRefresh={dbVersion}
              showToast={showToast}
              userRole={userRole}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              triggerRefresh={dbVersion}
              onDataChange={handleDataChange}
              showToast={showToast}
              isAdmin={userRole === USER_ROLES.ADMIN}
              userRole={userRole}
            />
          )}

          {activeTab === 'shareholderZone' && (
            <ShareholderZoneView
              companyId={currentCompanyId}
              year={currentYear}
              month={currentMonth}
              triggerRefresh={dbVersion}
              onDataChange={handleDataChange}
              operatorName={currentUser?.name}
              currentUser={currentUser}
              userRole={userRole}
              showToast={showToast}
            />
          )}

          {activeTab === 'auditZone' && (
            <AuditZoneView
              companyId={currentCompanyId}
              year={currentYear}
              month={currentMonth}
              triggerRefresh={dbVersion}
              onDataChange={handleDataChange}
              operatorName={currentUser?.name}
              currentUser={currentUser}
              userRole={userRole}
              showToast={showToast}
            />
          )}

          {activeTab === 'firebase' && userRole === USER_ROLES.ADMIN && (
            <FirebaseView
              showToast={showToast}
            />
          )}
          </Suspense>
        </main>
      </div>

      {/* Change Password Modal */}
      {isChangePwdOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <span className="modal-title">{isForcePasswordChange ? '🔒 首次登入請先修改密碼' : '🔒 修改個人登入密碼'}</span>
              {!isForcePasswordChange && (
                <button type="button" className="modal-close" onClick={() => setIsChangePwdOpen(false)}>×</button>
              )}
            </div>

            <form onSubmit={handleChangePassword}>
              <div className="modal-body">
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  帳號：<strong>{currentUser.email}</strong>
                  {isForcePasswordChange && (
                    <div className="alert-box warning" style={{ marginTop: '12px' }}>
                      此帳號仍使用初始密碼，請先設定新密碼後再使用系統。
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">輸入新密碼</label>
                  <input 
                    type="password" 
                    required 
                    placeholder="請輸入新密碼" 
                    className="form-control" 
                    value={newPassword} 
                    onChange={e => setNewPassword(e.target.value)} 
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">再次確認密碼</label>
                  <input 
                    type="password" 
                    required 
                    placeholder="再次確認新密碼" 
                    className="form-control" 
                    value={confirmPassword} 
                    onChange={e => setConfirmPassword(e.target.value)} 
                  />
                </div>
              </div>

              <div className="modal-footer">
                {!isForcePasswordChange && (
                  <button type="button" className="btn btn-secondary" onClick={() => setIsChangePwdOpen(false)}>
                    取消
                  </button>
                )}
                <button type="submit" className="btn btn-primary">
                  💾 儲存新密碼
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Alert Portal */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type === 'error' ? 'alert-box error' : toast.type === 'warning' ? 'alert-box warning' : 'toast'}`} style={{ margin: 0, border: '2px solid rgba(5, 178, 165, 0.15)', color: 'var(--text-primary)', backgroundColor: '#fff' }}>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
