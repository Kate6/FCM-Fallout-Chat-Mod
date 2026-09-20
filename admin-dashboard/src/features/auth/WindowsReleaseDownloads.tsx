import type { CSSProperties, MouseEvent } from 'react';

interface Props { version: string; installerUrl: string | null; portableUrl: string | null }

const buttonStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexShrink: 0,
  padding: '11px 28px', border: '1px solid #C8A840', background: 'rgba(200,168,64,0.16)',
  color: '#E6C45A', fontSize: '14px', fontWeight: 'bold', letterSpacing: '1.8px',
  textDecoration: 'none', textAlign: 'center', textShadow: '0 0 8px rgba(200,168,64,0.55)',
  boxShadow: '0 0 14px rgba(200,168,64,0.25), inset 0 0 10px rgba(200,168,64,0.08)',
  transition: 'background 0.15s, box-shadow 0.15s', fontFamily: 'inherit', whiteSpace: 'nowrap',
};

function hoverIn(event: MouseEvent<HTMLAnchorElement>) {
  event.currentTarget.style.background = 'rgba(200,168,64,0.28)';
  event.currentTarget.style.boxShadow = '0 0 22px rgba(200,168,64,0.4), inset 0 0 10px rgba(200,168,64,0.12)';
}
function hoverOut(event: MouseEvent<HTMLAnchorElement>) {
  event.currentTarget.style.background = 'rgba(200,168,64,0.16)';
  event.currentTarget.style.boxShadow = '0 0 14px rgba(200,168,64,0.25), inset 0 0 10px rgba(200,168,64,0.08)';
}

export function WindowsReleaseDownloads({ version, installerUrl, portableUrl }: Props) {
  const tag = version ? `v${version}` : '';
  const link = (url: string, label: string) => (
    <a href={url} download target="_blank" rel="noopener noreferrer" className="install-dl-btn" style={buttonStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
      ↓ DOWNLOAD {label} {tag}
    </a>
  );
  return <>
    <div className="install-dl-row" style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
      {installerUrl ? link(installerUrl, 'INSTALLER') : <span className="install-dl-btn" style={{ ...buttonStyle, opacity: 0.5, cursor: 'default' }}>↓ WINDOWS — UNAVAILABLE</span>}
      {portableUrl ? link(portableUrl, 'PORTABLE') : null}
    </div>
    {portableUrl ? <div style={{ fontSize: '12px', lineHeight: '1.6', color: 'rgba(200,168,64,0.55)', marginTop: '6px' }}>
      Portable needs no installation. Keep the executable and its entire adjacent <code>FCMData</code> folder together when moving or upgrading it.
    </div> : null}
  </>;
}
