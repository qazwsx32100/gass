import React, { useState } from 'react';
import ReportsView from './ReportsView';
import SettingsView from './SettingsView';
import { canViewAuditLogs } from '../utils/permissions';

export default function AuditZoneView({
  companyId,
  year,
  month,
  triggerRefresh,
  onDataChange,
  userRole,
  showToast
}) {
  const showAuditLogs = canViewAuditLogs(userRole);
  
  // Tab can be 'check' (查帳檢核) or 'log' (操作日誌)
  const [activeTab, setActiveTab] = useState('check');
  
  const isAdmin = userRole === 'admin';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header card with styling */}
      <div className="card no-print" style={{ marginBottom: 0 }}>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🔍 系統查核專區
          </h2>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            本專區供管理人員查帳、檢核傳票合規性，以及追蹤與審查系統的操作歷史紀錄（日誌）。
          </p>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="card no-print" style={{ marginBottom: 0 }}>
        <div className="card-header" style={{ borderBottom: 'none', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button 
              className={`tab-btn ${activeTab === 'check' ? 'active' : ''}`} 
              onClick={() => setActiveTab('check')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
            >
              📋 系統查帳檢核
            </button>
            {showAuditLogs && isAdmin && (
              <button 
                className={`tab-btn ${activeTab === 'log' ? 'active' : ''}`} 
                onClick={() => setActiveTab('log')}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
              >
                📜 操作審查日誌
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div style={{ width: '100%' }}>
        {activeTab === 'check' && (
          <ReportsView
            companyId={companyId}
            year={year}
            month={month}
            triggerRefresh={triggerRefresh}
            showToast={showToast}
            userRole={userRole}
            restrictToAudit={true}
          />
        )}
        
        {activeTab === 'log' && showAuditLogs && isAdmin && (
          <SettingsView
            triggerRefresh={triggerRefresh}
            onDataChange={onDataChange}
            showToast={showToast}
            isAdmin={isAdmin}
            userRole={userRole}
            restrictToAudit={true}
          />
        )}
      </div>
    </div>
  );
}
