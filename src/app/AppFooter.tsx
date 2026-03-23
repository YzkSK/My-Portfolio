const APP_VERSION = '1.0.1';

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
  <footer style={{ textAlign: 'center', padding: '24px 16px 16px', fontSize: 11, color: '#555', borderTop: '1px solid #2e2e2e', marginTop: '3rem' }}>
    {getDevice()} &nbsp;·&nbsp; v{APP_VERSION}
  </footer>
);
