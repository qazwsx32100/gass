import React from 'react';
import { captureClientException } from '../monitoring';

export default class AppErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    captureClientException(error, {
      tags: { source: 'react-error-boundary' },
      extra: { componentStack: info?.componentStack || '' }
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: '#f4fbfa' }}>
        <section role="alert" style={{ width: 'min(440px, 100%)', padding: '28px', background: '#fff', border: '1px solid #cfe8e4', borderRadius: '8px', textAlign: 'center' }}>
          <h1 style={{ margin: '0 0 12px', fontSize: '1.25rem', color: '#17324d' }}>系統暫時無法顯示</h1>
          <p style={{ margin: '0 0 20px', color: '#52677b', lineHeight: 1.6 }}>錯誤已自動回報，請重新整理後再試。</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            重新整理
          </button>
        </section>
      </main>
    );
  }
}
