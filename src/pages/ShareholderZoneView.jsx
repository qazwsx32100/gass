import React, { useState } from 'react';
import InputsView from './InputsView';
import ReportsView from './ReportsView';
import SettingsView from './SettingsView';
import { canViewShareholderLedger, canViewShareholderReports, canViewShareholderInfo } from '../utils/permissions';

export default function ShareholderZoneView({
  companyId,
  year,
  month,
  triggerRefresh,
  onDataChange,
  operatorName,
  currentUser,
  userRole,
  showToast
}) {
  const showLedger = canViewShareholderLedger(userRole);
  const showReports = canViewShareholderReports(userRole);
  const showSettings = canViewShareholderInfo(userRole);
  
  // Set default sub-tab based on permissions
  const [activeTab, setActiveTab] = useState(() => {
    if (showLedger) return 'ledger';
    if (showReports) return 'reports';
    if (showSettings) return 'settings';
    return 'ledger';
  });

  const isAdmin = userRole === 'admin';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header card with styling */}
      <div className="card no-print" style={{ marginBottom: 0 }}>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            👑 股東專區
          </h2>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            此專區整合了所有股東與投資人相關的帳務登錄、權益分紅試算、權益變動表，以及股東基本資料與登入密碼安全設定。
          </p>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="card no-print" style={{ marginBottom: 0 }}>
        <div className="card-header" style={{ borderBottom: 'none', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {showLedger && (
              <button 
                className={`tab-btn ${activeTab === 'ledger' ? 'active' : ''}`} 
                onClick={() => setActiveTab('ledger')}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
              >
                📝 股東往來交易
              </button>
            )}
            {showReports && (
              <button 
                className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`} 
                onClick={() => setActiveTab('reports')}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
              >
                📊 股東分紅與權益
              </button>
            )}
            {showSettings && isAdmin && (
              <button 
                className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} 
                onClick={() => setActiveTab('settings')}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
              >
                ⚙️ 股東資料與安全
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div style={{ width: '100%' }}>
        {activeTab === 'ledger' && showLedger && (
          <InputsView
            companyId={companyId}
            triggerRefresh={triggerRefresh}
            onDataChange={onDataChange}
            operatorName={operatorName}
            currentUser={currentUser}
            userRole={userRole}
            restrictToShareholder={true}
          />
        )}
        
        {activeTab === 'reports' && showReports && (
          <ReportsView
            companyId={companyId}
            year={year}
            month={month}
            triggerRefresh={triggerRefresh}
            showToast={showToast}
            userRole={userRole}
            restrictToShareholder={true}
          />
        )}

        {activeTab === 'settings' && showSettings && isAdmin && (
          <SettingsView
            triggerRefresh={triggerRefresh}
            onDataChange={onDataChange}
            showToast={showToast}
            isAdmin={isAdmin}
            userRole={userRole}
            restrictToShareholder={true}
          />
        )}
      </div>
    </div>
  );
}
