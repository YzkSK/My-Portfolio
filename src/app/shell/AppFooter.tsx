const APP_VERSION = '1.2.0';

function getDevice(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac/.test(ua)) return 'Mac';
  return 'Unknown';
}

export const AppFooter = () => (
  <footer style={{ position: 'fixed', bottom: 0, left: 0, right: 0, textAlign: 'center', padding: '10px 16px', fontSize: 11, color: 'var(--app-text-muted)', borderTop: '1px solid var(--app-border)', background: 'var(--app-bg-card)', zIndex: 50 }}>
    {getDevice()} &nbsp;·&nbsp; v{APP_VERSION}
  </footer>
);
