import React, { useState, useEffect, useMemo } from 'react';
import { initializeDB, getCompanies, getShareholders, getAdminDisplayName, getCurrentDevice, verifyLogin, updatePassword, USER_ROLES, createDailyBackupIfNeeded } from './db/storage';
import { initFirebase } from './db/firebaseService';
import { clearCloudSessionToken, getLastCloudSyncError, initSupabaseSync, isSupabaseConnected, loginViaCloud, syncLocalToSupabase } from './db/supabaseService';
import DashboardView from './pages/DashboardView';
import InputsView from './pages/InputsView';
import ReportsView from './pages/ReportsView';
import SettingsView from './pages/SettingsView';
import FirebaseView from './pages/FirebaseView';
import CylindersView from './pages/CylindersView';
import { getAllowedTabsForUser } from './utils/permissions';

function App() {
  const [dbVersion, setDbVersion] = useState(0); // Trigger state refreshes across components
  const [activeTab, setActiveTab] = useState('dashboard');
  
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
  // Get current Taiwan timezone year/month
  const twDateStr = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit'
  }).format(new Date()); // e.g. "2026/07"
  const [twYear, twMonth] = twDateStr.split('/');
  
  const [currentYear, setCurrentYear] = useState(parseInt(twYear, 10) || 2026);
  const [currentMonth, setCurrentMonth] = useState(twMonth || '07');
  const [toasts, setToasts] = useState([]);
  const [isDataReady, setIsDataReady] = useState(false);

  // Initialize DB on mount
  useEffect(() => {
    const boot = async () => {
      initializeDB();
      const rememberedEmail = localStorage.getItem('bp_last_login_email') || '';
      const savedSession = localStorage.getItem('bp_login_session');
      if (rememberedEmail) {
        setLoginEmail(rememberedEmail);
      }

      if (isSupabaseConnected()) {
        const connected = await initSupabaseSync((updatedBy) => {
          showToast(`☁️ 偵測到雲端資料更新（來自：${updatedBy}），已同步畫面。`, 'info');
          setDbVersion(prev => prev + 1);
        });
        if (connected) {
          // --- FRONTEND EMERGENCY CLEANUP FOR REV202607001 ---
          const incomeKey = 'bp_incomes';
          const incomesStr = localStorage.getItem(incomeKey);
          if (incomesStr && !localStorage.getItem('bp_mock_cleared_v4_cloud')) {
            try {
              const incomes = JSON.parse(incomesStr);
              if (incomes.some(item => item.id === 'REV202607001')) {
                const filtered = incomes.filter(item => item.id !== 'REV202607001');
                localStorage.setItem(incomeKey, JSON.stringify(filtered));
                // Sync back to Supabase
                await syncLocalToSupabase('系統醫生(清除廢單)');
                localStorage.setItem('bp_mock_cleared_v4_cloud', 'true');
                console.log("REV202607001 cleared from cloud successfully!");
              }
            } catch (err) {
              console.error(err);
            }
          }

          // Migrate 5102 accounts to 4104
          const migrateAccountCounterparts = async () => {
            const coaKey = 'bp_chart_of_accounts';
            const coaStr = localStorage.getItem(coaKey);
            if (coaStr) {
              try {
                const coa = JSON.parse(coaStr);
                let changed = false;
                if (!coa.some(a => a.code === '4104')) {
                  coa.push({ code: '4104', name: '爐具/零件銷貨收入', type: 'revenue', desc: '商品出貨收入' });
                  changed = true;
                }
                const sub5102 = coa.filter(a => a.code.startsWith('5102') && a.code !== '5102');
                sub5102.forEach(a => {
                  const suffix = a.code.replace('5102', '');
                  const targetCode = '4104' + suffix;
                  if (!coa.some(x => x.code === targetCode)) {
                    coa.push({
                      code: targetCode,
                      name: a.name,
                      type: 'revenue',
                      desc: a.desc || '',
                      subGroup: a.subGroup || ''
                    });
                    changed = true;
                  }
                });
                if (changed) {
                  localStorage.setItem(coaKey, JSON.stringify(coa));
                  await syncLocalToSupabase('系統管理員(建立對照收入科目)');
                  console.log("Existing 5102 accounts synced to 4104 on cloud successfully!");
                }
              } catch (err) {
                console.error(err);
              }
            }
          };
          await migrateAccountCounterparts();

          const backupCreated = createDailyBackupIfNeeded('系統每日備份');
          if (backupCreated) {
            await syncLocalToSupabase('系統每日備份');
          }
          setDbVersion(prev => prev + 1);
        }
      }

      if (savedSession) {
        try {
          const session = JSON.parse(savedSession);
          if (session?.user?.id && session?.role) {
            let sessionValid = true;
            if (isSupabaseConnected()) {
              sessionValid = await initSupabaseSync((updatedBy) => {
                showToast(`☁️ 偵測到雲端資料更新（來自：${updatedBy}），已同步畫面。`, 'info');
                setDbVersion(prev => prev + 1);
              });
            }

            if (sessionValid) {
              setIsLoggedIn(true);
              setUserRole(session.role);
              setCurrentUser(session.user);
              
              // Run migration for logged in users too
              const migrateAccountCounterparts = async () => {
                const coaKey = 'bp_chart_of_accounts';
                const coaStr = localStorage.getItem(coaKey);
                if (coaStr) {
                  try {
                    const coa = JSON.parse(coaStr);
                    let changed = false;
                    if (!coa.some(a => a.code === '4104')) {
                      coa.push({ code: '4104', name: '爐具/零件銷貨收入', type: 'revenue', desc: '商品出貨收入' });
                      changed = true;
                    }
                    const sub5102 = coa.filter(a => a.code.startsWith('5102') && a.code !== '5102');
                    sub5102.forEach(a => {
                      const suffix = a.code.replace('5102', '');
                      const targetCode = '4104' + suffix;
                      if (!coa.some(x => x.code === targetCode)) {
                        coa.push({
                          code: targetCode,
                          name: a.name,
                          type: 'revenue',
                          desc: a.desc || '',
                          subGroup: a.subGroup || ''
                        });
                        changed = true;
                      }
                    });
                    if (changed) {
                      localStorage.setItem(coaKey, JSON.stringify(coa));
                      await syncLocalToSupabase('系統管理員(建立對照收入科目)');
                      console.log("Existing 5102 accounts synced to 4104 on cloud successfully!");
                    }
                  } catch (err) {
                    console.error(err);
                  }
                }
              };
              await migrateAccountCounterparts();
            } else {
              localStorage.removeItem('bp_login_session');
              clearCloudSessionToken();
              const error = getLastCloudSyncError();
              showToast(error?.error || '雲端登入已失效，請重新登入。', 'error');
            }
          }
        } catch {}
      }

      // Clear one-time verification tokens from the address bar.
      const params = new URLSearchParams(window.location.search);
      const verifyEmailToken = params.get('verifyEmailToken');
      if (verifyEmailToken) {
        window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
      }

      setDbVersion(prev => prev + 1);

      if (!isSupabaseConnected()) {
        initFirebase((updatedBy) => {
          showToast(`☁️ 偵測到雲端資料更新（來自：${updatedBy}），已即時同步畫面。`, 'info');
          setDbVersion(prev => prev + 1);
        });
      }

      setIsDataReady(true);
    };

    boot();
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
  const shareholders = useMemo(() => getShareholders(), [dbVersion]);
  const allCompanies = useMemo(() => getCompanies(), [dbVersion]);

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
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#e8f8f5', // TaskAmigo Background color
        fontFamily: 'var(--font-sans)',
        color: 'var(--text-primary)'
      }}>
        <div style={{
          width: '90%',
          maxWidth: '440px',
          backgroundColor: '#ffffff',
          border: '2px solid rgba(5, 178, 165, 0.2)',
          borderRadius: '24px',
          padding: '40px',
          textAlign: 'center',
          boxShadow: 'var(--shadow-lg)'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'linear-gradient(135deg, #05b2a5, #10b981)',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            margin: '0 auto 20px auto',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(5, 178, 165, 0.25)'
          }}>
            🏦
          </div>
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
      {/* Sidebar navigation */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">BP</div>
          <div>
            <div className="sidebar-logo-text">BusinessPilot</div>
            <div className="sidebar-logo-sub">盛隆 ERP v1.0</div>
          </div>
        </div>

        <div className="sidebar-nav">
          <span className="sidebar-nav-heading">📊 營業分析</span>
          {allowedTabs.includes('dashboard') && (
            <button className={`sidebar-link ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
              <span className="sidebar-link-icon">📈</span>
              營運總覽
            </button>
          )}
          {allowedTabs.includes('reports') && (
            <button className={`sidebar-link ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
              <span className="sidebar-link-icon">📊</span>
              財務報表
            </button>
          )}

          {allowedTabs.includes('inputs') && (
            <>
              <span className="sidebar-nav-heading">📥 帳務管理</span>
              <button className={`sidebar-link ${activeTab === 'inputs' ? 'active' : ''}`} onClick={() => setActiveTab('inputs')}>
                <span className="sidebar-link-icon">📝</span>
                日常金流
              </button>
              <button className={`sidebar-link ${activeTab === 'cylinders' ? 'active' : ''}`} onClick={() => setActiveTab('cylinders')}>
                <span className="sidebar-link-icon">🍼</span>
                鋼瓶狀態
              </button>
            </>
          )}
          
          {allowedTabs.includes('settings') && (
            <>
              <span className="sidebar-nav-heading">⚙️ 設定與名冊</span>
              <button className={`sidebar-link ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
                <span className="sidebar-link-icon">👤</span>
                {userRole === USER_ROLES.ADMIN ? '基本資料設定' : '股東基本資料'}
              </button>
            </>
          )}

          {userRole === USER_ROLES.ADMIN && allowedTabs.includes('firebase') && (
            <>
              <span className="sidebar-nav-heading">🌐 雲端同步</span>
              <button className={`sidebar-link ${activeTab === 'firebase' ? 'active' : ''}`} onClick={() => setActiveTab('firebase')}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className="header-title-section">
              <span className="header-title">{activeCompany?.name || '公司'}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {activeCompany?.desc || '營運報表系統'}
              </span>
            </div>

            {allowedCompanies.length > 1 && (
              <select
                className="select-dropdown"
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '600' }}>會計期間：</span>
              <select
                className="select-dropdown"
                style={{ padding: '6px 10px' }}
                value={currentYear}
                onChange={e => {
                  setCurrentYear(parseInt(e.target.value, 10));
                  handleDataChange();
                }}
              >
                <option value="2025">2025 年</option>
                <option value="2026">2026 年</option>
                <option value="2027">2027 年</option>
              </select>

              <select
                className="select-dropdown"
                style={{ padding: '6px 10px' }}
                value={currentMonth}
                onChange={e => {
                  setCurrentMonth(e.target.value);
                  handleDataChange();
                }}
              >
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                  <option key={m} value={m}>{m} 月</option>
                ))}
              </select>
            </div>

            <div style={{ height: '24px', width: '2px', backgroundColor: 'var(--border-color)', margin: '0 8px' }}></div>

            {/* 2. User info & Logout button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                {currentUser.name}
              </span>
              
              <button 
                onClick={handleLogout} 
                className="btn btn-secondary btn-sm"
                style={{ 
                  borderRadius: '20px', 
                  borderColor: 'var(--accent-blue)', 
                  color: 'var(--accent-blue)',
                  backgroundColor: '#ffffff',
                  padding: '6px 14px',
                  fontWeight: '700'
                }}
              >
                登出 ➔
              </button>
            </div>
          </div>
        </header>

        {/* Page rendering */}
        <main className="page-container">
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

          {activeTab === 'firebase' && userRole === USER_ROLES.ADMIN && (
            <FirebaseView
              showToast={showToast}
            />
          )}
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
