import React from 'react';
import { captureClientException } from '../monitoring';
import { getErrorReference, getSafeErrorSummary } from '../utils/errorDiagnostics';

export default class AppErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('AppErrorBoundary caught an exception:', error, info);
    captureClientException(error, {
      tags: { source: 'react-error-boundary' },
      extra: { componentStack: info?.componentStack || '' }
    });
  }

  handleReset = () => {
    // Strip URL parameters if any were causing issues
    if (window.location.search) {
      window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
    }
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleCleanRepair = () => {
    try {
      // Keep session if safe, clear transient query params
      window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
    } catch (e) {
      console.error(e);
    }
    window.location.href = window.location.origin + window.location.pathname;
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const errorSummary = getSafeErrorSummary(this.state.error);
    const errorReference = getErrorReference(this.state.error);

    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: '#f4fbfa' }}>
        <section role="alert" style={{ width: 'min(480px, 100%)', padding: '32px', background: '#fff', border: '1px solid #cfe8e4', borderRadius: '16px', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🛠️</div>
          <h1 style={{ margin: '0 0 12px', fontSize: '1.35rem', fontWeight: 800, color: '#17324d' }}>系統已安全防護並為您隔離錯誤</h1>
          <p style={{ margin: '0 0 20px', color: '#52677b', fontSize: '0.92rem', lineHeight: 1.6 }}>
            系統已自動捕獲異常並記錄修復報告。請點擊下方按鈕重新載入畫面。
          </p>
          <div style={{ margin: '0 0 20px', padding: '12px 14px', borderRadius: '10px', background: '#f5f8fa', color: '#334e68', textAlign: 'left', fontSize: '0.82rem', lineHeight: 1.55, overflowWrap: 'anywhere' }}>
            <div><strong>錯誤編號：</strong>{errorReference}</div>
            <div><strong>錯誤原因：</strong>{errorSummary}</div>
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={this.handleReset} style={{ padding: '10px 20px' }}>
              🔄 重新整理頁面
            </button>
            <button type="button" className="btn btn-secondary" onClick={this.handleCleanRepair} style={{ padding: '10px 20px' }}>
              ↩️ 返回系統首頁
            </button>
          </div>
        </section>
      </main>
    );
  }
}
