import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AdminDashboard({ onLogout }) {
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [selectedUserId, setSelectedUserId] = useState('');
  const [newProfileName, setNewProfileName] = useState('');
  const [newMac, setNewMac] = useState('');
  const [newPortalUrl, setNewPortalUrl] = useState('');
  
  const navigate = useNavigate();

  const fetchAdminData = async () => {
    setLoading(true);
    const token = localStorage.getItem('helix_iptv_token');
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [usersRes, profilesRes] = await Promise.all([
        fetch('/api/admin/users', { headers }),
        fetch('/api/admin/profiles', { headers })
      ]);

      if (!usersRes.ok || !profilesRes.ok) throw new Error('Failed to fetch admin data (Unauthorized)');
      
      setUsers(await usersRes.json());
      setProfiles(await profilesRes.json());
    } catch (err) {
      setError(err.message);
      if (err.message.includes('Unauthorized')) navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('helix_iptv_token')}`
        },
        body: JSON.stringify({ username: newUsername, password: newPassword })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setNewUsername('');
      setNewPassword('');
      fetchAdminData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Delete this user and all their profiles?')) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('helix_iptv_token')}` }
      });
      if (!res.ok) throw new Error((await res.json()).error);
      fetchAdminData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreateProfile = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/profiles', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('helix_iptv_token')}`
        },
        body: JSON.stringify({ user_id: selectedUserId, profile_name: newProfileName, mac: newMac, portal_url: newPortalUrl })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setNewProfileName('');
      setNewMac('');
      setNewPortalUrl('');
      fetchAdminData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteProfile = async (id) => {
    try {
      const res = await fetch(`/api/admin/profiles/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('helix_iptv_token')}` }
      });
      if (!res.ok) throw new Error((await res.json()).error);
      fetchAdminData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteAllStreams = async () => {
    if (!window.confirm('WARNING: This will permanently delete ALL saved MAC addresses and servers for EVERY user. Are you sure?')) return;
    try {
      const res = await fetch('/api/admin/delete-all-profiles', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('helix_iptv_token')}` }
      });
      if (!res.ok) throw new Error((await res.json()).error);
      alert('All servers and MAC addresses have been deleted.');
      fetchAdminData();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div style={containerStyle}><div className="spinner" /></div>;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <h1 style={{ fontFamily: 'var(--font-title)', margin: 0 }}>Admin Dashboard</h1>
          <button className="btn-secondary" onClick={() => navigate('/')} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>View App</button>
        </div>
        <button className="btn-secondary" onClick={onLogout}>Logout</button>
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      <div style={gridContainerStyle}>
        {/* USERS SECTION */}
        <div className="glass-panel" style={cardStyle}>
          <h2>User Management</h2>
          
          <form onSubmit={handleCreateUser} style={formStyle}>
            <input className="input-field" type="text" placeholder="Username" value={newUsername} onChange={e => setNewUsername(e.target.value)} required />
            <input className="input-field" type="password" placeholder="Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
            <button className="btn-primary" type="submit">Create User</button>
          </form>

          <table style={tableStyle}>
            <thead><tr><th style={thStyle}>ID</th><th style={thStyle}>Username</th><th style={thStyle}>Role</th><th style={thStyle}>Actions</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                  <td style={tdStyle}>{u.id}</td>
                  <td style={tdStyle}>{u.username}</td>
                  <td style={tdStyle}>{u.role}</td>
                  <td style={tdStyle}>
                    {u.role !== 'admin' && (
                      <button onClick={() => handleDeleteUser(u.id)} style={deleteBtnStyle}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* PROFILES SECTION */}
        <div className="glass-panel" style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0 }}>Servers & MAC Addresses</h2>
            <button onClick={handleDeleteAllStreams} style={{ ...deleteBtnStyle, padding: '8px 16px' }}>Delete All Streams</button>
          </div>
          
          <form onSubmit={handleCreateProfile} style={formStyle}>
            <select className="input-field" value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} required>
              <option value="" disabled>Select User</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
            <input className="input-field" type="text" placeholder="Profile Name (e.g. Living Room)" value={newProfileName} onChange={e => setNewProfileName(e.target.value)} required />
            <input className="input-field" type="text" placeholder="MAC Address" value={newMac} onChange={e => setNewMac(e.target.value)} required />
            <input className="input-field" type="text" placeholder="Portal URL" value={newPortalUrl} onChange={e => setNewPortalUrl(e.target.value)} required />
            <button className="btn-primary" type="submit">Assign Server to User</button>
          </form>

          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead><tr><th style={thStyle}>User</th><th style={thStyle}>Profile Name</th><th style={thStyle}>MAC Address</th><th style={thStyle}>Portal URL</th><th style={thStyle}>Action</th></tr></thead>
              <tbody>
                {profiles.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                    <td style={tdStyle}>{p.user_name}</td>
                    <td style={tdStyle}>{p.profile_name}</td>
                    <td style={tdStyle}>{p.mac}</td>
                    <td style={tdStyle}>{p.portal_url}</td>
                    <td style={tdStyle}>
                      <button onClick={() => handleDeleteProfile(p.id)} style={deleteBtnStyle}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const containerStyle = {
  padding: '30px',
  minHeight: '100vh',
  background: 'var(--bg-primary)'
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '30px',
  paddingBottom: '20px',
  borderBottom: '1px solid var(--border-glass)'
};

const gridContainerStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
  gap: '30px',
  alignItems: 'start'
};

const cardStyle = {
  padding: '30px',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px'
};

const formStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '15px',
  marginBottom: '20px',
  padding: '20px',
  background: 'rgba(0,0,0,0.2)',
  borderRadius: '10px',
  border: '1px solid var(--border-glass)'
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.9rem'
};

const thStyle = {
  textAlign: 'left',
  padding: '12px',
  color: 'var(--text-secondary)',
  borderBottom: '2px solid var(--border-glass)'
};

const tdStyle = {
  padding: '12px',
  color: 'var(--text-primary)'
};

const deleteBtnStyle = {
  padding: '6px 12px',
  background: 'rgba(255, 75, 75, 0.1)',
  border: '1px solid rgba(255, 75, 75, 0.4)',
  color: '#ff4b4b',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '0.8rem'
};

const errorStyle = {
  padding: '15px',
  background: 'rgba(255, 75, 75, 0.1)',
  border: '1px solid rgba(255, 75, 75, 0.3)',
  borderRadius: '8px',
  color: '#ff4b4b',
  marginBottom: '20px'
};
