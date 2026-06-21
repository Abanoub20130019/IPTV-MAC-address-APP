import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LoginScreen({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      localStorage.setItem('helix_iptv_token', data.token);
      onLoginSuccess(data.user);
      
      if (data.user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div className="glass-panel" style={cardStyle}>
        <div style={logoContainerStyle}>
          <div style={logoIconStyle}>▶</div>
          <h1 style={titleStyle}>IPTV Stream</h1>
        </div>

        <form onSubmit={handleLogin} style={formStyle}>
          {error && <div style={errorStyle}>{error}</div>}
          
          <div style={inputGroupStyle}>
            <label style={labelStyle}>Username</label>
            <input
              type="text"
              className="input-field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
            />
          </div>

          <div style={inputGroupStyle}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading} style={buttonStyle}>
            {loading ? <div className="spinner" style={{width: '20px', height: '20px', margin: 'auto'}} /> : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

const containerStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '100vh',
  padding: '20px',
  background: 'radial-gradient(circle at 50% 50%, rgba(30,33,48,0.8) 0%, rgba(10,11,16,1) 100%)'
};

const cardStyle = {
  width: '100%',
  maxWidth: '400px',
  padding: '40px 30px',
  display: 'flex',
  flexDirection: 'column',
  gap: '30px'
};

const logoContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '15px'
};

const logoIconStyle = {
  width: '60px',
  height: '60px',
  borderRadius: '50%',
  background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  fontSize: '24px',
  color: '#000',
  boxShadow: '0 0 30px rgba(0, 240, 255, 0.4)'
};

const titleStyle = {
  fontFamily: 'var(--font-title)',
  fontSize: '1.8rem',
  color: '#fff',
  margin: 0,
  letterSpacing: '1px'
};

const formStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px'
};

const inputGroupStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
};

const labelStyle = {
  fontSize: '0.9rem',
  color: 'var(--text-secondary)',
  fontWeight: '500'
};

const buttonStyle = {
  marginTop: '10px',
  width: '100%',
  padding: '14px',
  display: 'flex',
  justifyContent: 'center'
};

const errorStyle = {
  padding: '12px',
  background: 'rgba(255, 75, 75, 0.1)',
  border: '1px solid rgba(255, 75, 75, 0.3)',
  borderRadius: '8px',
  color: '#ff4b4b',
  fontSize: '0.9rem',
  textAlign: 'center'
};
