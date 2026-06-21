import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import ConnectionScreen from './components/ConnectionScreen';
import LiveTVTab from './components/LiveTVTab';
import MoviesTab from './components/MoviesTab';
import SeriesTab from './components/SeriesTab';
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import GlobalSearch from './components/GlobalSearch';

export default function App() {
  const [connection, setConnection] = useState(null); // stores { portalUrl, mac, token, isMock, profile }
  const [activeTab, setActiveTab] = useState('live'); // live, movies, series, settings
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [globalPlayItem, setGlobalPlayItem] = useState(null); // { type: 'vod'|'series'|'live', item: object }
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('helix_iptv_token');
    if (token) {
      fetch('/api/auth/verify', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setUser(data.user);
        } else {
          localStorage.removeItem('helix_iptv_token');
        }
      })
      .catch(() => localStorage.removeItem('helix_iptv_token'))
      .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('helix_iptv_token');
    setUser(null);
    setConnection(null);
    navigate('/login');
  };

  const handleDisconnect = () => {
    setConnection(null);
    setActiveTab('live');
  };

  if (loading) return <div className="spinner" style={{ margin: 'auto', display: 'block', position: 'absolute', top: '50%', left: '50%' }}/>;

  return (
    <Routes>
      <Route path="/login" element={!user ? <LoginScreen onLoginSuccess={setUser} /> : <Navigate to="/" />} />
      <Route path="/admin" element={user?.role === 'admin' ? <AdminDashboard onLogout={handleLogout} /> : <Navigate to="/" />} />
      <Route path="/" element={
        !user ? <Navigate to="/login" /> :
        !connection ? (
          <div style={{ position: 'relative' }}>
            <button className="btn-secondary" onClick={handleLogout} style={{ position: 'absolute', top: 20, right: 20, zIndex: 100 }}>Logout</button>
            <ConnectionScreen onConnectSuccess={setConnection} />
          </div>
        ) : (
    <div className="app-grid">
      {/* 1. Left Navigation Bar */}
      <nav className="glass-panel" style={navStyle}>
        <div style={logoWrapperStyle}>
          <svg style={{ width: '28px', height: '28px', color: 'var(--accent-primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>

        <div style={navListStyle}>
          <button
            className={`nav-item ${activeTab === 'live' ? 'active' : ''}`}
            onClick={() => setActiveTab('live')}
            style={navItemButtonStyle}
          >
            <svg viewBox="0 0 24 24">
              <path d="M21 6H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7.5v-3c0-.83.67-1.5 1.5-1.5h5c.83 0 1.5.67 1.5 1.5v3c0 .83-.67 1.5-1.5 1.5h-5c-.83 0-1.5-.67-1.5-1.5zm-5 1.5H4v-1h2v1zm0-2H4v-1h2v1zm0-2H4V9h2v1z"/>
            </svg>
            Live TV
          </button>

          <button
            className={`nav-item ${activeTab === 'movies' ? 'active' : ''}`}
            onClick={() => setActiveTab('movies')}
            style={navItemButtonStyle}
          >
            <svg viewBox="0 0 24 24">
              <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
            </svg>
            Movies
          </button>

          <button
            className={`nav-item ${activeTab === 'series' ? 'active' : ''}`}
            onClick={() => setActiveTab('series')}
            style={navItemButtonStyle}
          >
            <svg viewBox="0 0 24 24">
              <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/>
            </svg>
            Series
          </button>

          <button
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            style={navItemButtonStyle}
          >
            <svg viewBox="0 0 24 24">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
            Settings
          </button>
          
          <button
            className="nav-item"
            onClick={handleDisconnect}
            style={{
              ...navItemButtonStyle,
              marginTop: 'auto',
              color: '#ff4b4b',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Switch IPTV Portal / Logout"
          >
            <svg viewBox="0 0 24 24" style={{ fill: '#ff4b4b', width: '22px', height: '22px' }}>
              <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
            </svg>
            Switch
          </button>
        </div>
      </nav>

      {/* 2. Main Tab View Area */}
      <main className="app-content" style={{ display: 'flex', flexDirection: 'column' }}>
        
        {/* Top Header Bar for Global Search */}
        <div style={{ padding: '15px 30px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', borderBottom: '1px solid var(--border-glass)' }}>
          <GlobalSearch 
            connection={connection}
            onPlayChannel={(c) => { setActiveTab('live'); setGlobalPlayItem({ type: 'live', item: c }); }}
            onPlayMovie={(m) => { setActiveTab('movies'); setGlobalPlayItem({ type: 'vod', item: m }); }}
            onPlaySeries={(s) => { setActiveTab('series'); setGlobalPlayItem({ type: 'series', item: s }); }}
          />
        </div>

        <div style={{ flex: 1, padding: '20px', overflow: 'hidden' }}>
          {activeTab === 'live' && <LiveTVTab connection={connection} globalPlayItem={globalPlayItem} clearGlobalPlayItem={() => setGlobalPlayItem(null)} />}
          {activeTab === 'movies' && <MoviesTab connection={connection} globalPlayItem={globalPlayItem} clearGlobalPlayItem={() => setGlobalPlayItem(null)} />}
          {activeTab === 'series' && <SeriesTab connection={connection} globalPlayItem={globalPlayItem} clearGlobalPlayItem={() => setGlobalPlayItem(null)} />}
          {activeTab === 'settings' && (
          <div style={settingsContainerStyle}>
            <div className="glass-panel" style={settingsCardStyle}>
              <h2 style={settingsTitleStyle}>Portal Connection Profile</h2>
              
              <div style={profileGridStyle}>
                <div style={profileItemStyle}>
                  <span style={profileLabelStyle}>PORTAL URL</span>
                  <span style={profileValueStyle}>{connection.portalUrl}</span>
                </div>

                <div style={profileItemStyle}>
                  <span style={profileLabelStyle}>MAC ADDRESS</span>
                  <span style={profileValueStyle}>{connection.mac}</span>
                </div>

                <div style={profileItemStyle}>
                  <span style={profileLabelStyle}>CONNECTION TYPE</span>
                  <span style={{...profileValueStyle, color: connection.isMock ? 'var(--accent-secondary)' : 'var(--accent-primary)'}}>
                    {connection.isMock ? 'DEMO SIMULATOR' : 'STALKER API MIDDLEWARE'}
                  </span>
                </div>

                <div style={profileItemStyle}>
                  <span style={profileLabelStyle}>STB MODEL</span>
                  <span style={profileValueStyle}>{connection.profile?.model || 'MAG250 Emulator'}</span>
                </div>

                <div style={profileItemStyle}>
                  <span style={profileLabelStyle}>SESSION TOKEN</span>
                  <span style={{...profileValueStyle, fontFamily: 'monospace', fontSize: '0.8rem'}}>{connection.token}</span>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '24px', marginTop: '10px' }}>
                <button className="btn-primary" style={disconnectButtonStyle} onClick={handleDisconnect}>
                  DISCONNECT PORTAL
                </button>
              </div>
            </div>
          </div>
          )}
        </div>
      </main>
    </div>
        )
      } />
    </Routes>
  );
}

// -------------------------------------------------------------
// INLINE STYLES
// -------------------------------------------------------------
const navStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '30px 0',
  borderRadius: '0 24px 24px 0',
  borderLeft: 'none',
  height: '100vh',
  width: '80px',
  zIndex: 10
};

const logoWrapperStyle = {
  marginBottom: '50px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const navListStyle = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  gap: '12px'
};

const navItemButtonStyle = {
  background: 'none',
  border: 'none',
  width: '100%',
  fontSize: '0.7rem',
  fontWeight: '600',
  letterSpacing: '0.5px'
};

const settingsContainerStyle = {
  display: 'flex',
  justifyContent: 'center',
  paddingTop: '40px'
};

const settingsCardStyle = {
  width: '100%',
  maxWidth: '600px',
  padding: '40px',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px'
};

const settingsTitleStyle = {
  fontFamily: 'var(--font-title)',
  fontSize: '1.4rem',
  fontWeight: '600',
  color: 'var(--text-primary)',
  borderBottom: '1px solid var(--border-glass)',
  paddingBottom: '16px'
};

const profileGridStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px'
};

const profileItemStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px'
};

const profileLabelStyle = {
  fontSize: '0.75rem',
  fontWeight: '700',
  color: 'var(--text-muted)',
  letterSpacing: '1px'
};

const profileValueStyle = {
  fontSize: '0.95rem',
  color: 'var(--text-primary)',
  wordBreak: 'break-all'
};

const disconnectButtonStyle = {
  background: 'linear-gradient(135deg, #ff4b4b 0%, #c10000 100%)',
  boxShadow: '0 4px 15px rgba(255, 75, 75, 0.25)',
  color: '#ffffff',
  padding: '12px 24px'
};
