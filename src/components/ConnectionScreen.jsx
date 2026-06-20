import React, { useState, useEffect } from 'react';

export default function ConnectionScreen({ onConnectSuccess }) {
  // Saved profiles list
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  
  // Tabs and filters
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Bulk Import modal
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  
  // Manual add form
  const [portalUrl, setPortalUrl] = useState('');
  const [mac, setMac] = useState('00:1A:79:');
  const [manualExpiry, setManualExpiry] = useState('');
  const [manualChannels, setManualChannels] = useState('');
  
  // Connection steps & loaders
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [steps, setSteps] = useState([]);
  const [connectingProfileId, setConnectingProfileId] = useState(null);
  
  // Testing engine states
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [testProgress, setTestProgress] = useState({ current: 0, total: 0 });
  const [testScope, setTestScope] = useState('all');

  // Search and Sort states
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('none'); // 'none', 'expiry', 'channels'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc', 'desc'

  // Load profiles from LocalStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('helix_iptv_profiles');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setProfiles(parsed);
        }
      } catch (e) {
        console.error('Failed to parse saved profiles:', e);
      }
    }
  }, []);

  // Save profiles helper
  const saveProfilesToStorage = (updatedList) => {
    setProfiles(updatedList);
    localStorage.setItem('helix_iptv_profiles', JSON.stringify(updatedList));
  };

  // Evaluate date expiration
  const checkDateExpiry = (dateStr) => {
    if (!dateStr || dateStr === 'Unknown' || dateStr === 'N/A') return 'unknown';
    try {
      const cleanDateStr = dateStr.replace(/,\s*\d+:\d+\s*(am|pm)/i, ''); // Strip time strings
      const expDate = new Date(cleanDateStr);
      if (isNaN(expDate.getTime())) return 'unknown';

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      expDate.setHours(0, 0, 0, 0);

      if (expDate < today) {
        return 'expired';
      }
      return 'active';
    } catch (e) {
      return 'unknown';
    }
  };

  // Bulk Import text parser
  const handleBulkImport = () => {
    if (!bulkText.trim()) return;

    // Splits into blocks that start with Portal:
    const entries = bulkText.split(/(?=Portal\s*:)/i);
    const parsedList = [];
    let importCount = 0;

    entries.forEach(entry => {
      entry = entry.trim();
      if (!entry) return;

      const portalMatch = entry.match(/Portal\s*:\s*(https?:\/\/[^\s\n]+)/i);
      const macMatch = entry.match(/MAC\s*(Addr)?\s*:\s*([0-9A-Fa-f]{2}[:-][0-9A-Fa-f]{2}[:-][0-9A-Fa-f]{2}[:-][0-9A-Fa-f]{2}[:-][0-9A-Fa-f]{2}[:-][0-9A-Fa-f]{2})/i);
      const expMatch = entry.match(/Exp\s*(date)?\s*:\s*([^\n]+)/i);
      const chanMatch = entry.match(/Channels\s*:\s*(\d+)/i);

      if (portalMatch && macMatch) {
        const pUrl = portalMatch[1].trim();
        const pMac = macMatch[2].trim();
        const pId = btoa(`${pUrl}|${pMac}`);
        const pExp = expMatch ? expMatch[2].trim() : 'Unknown';
        
        // Evaluate initial expired status if date is in past
        const initialStatus = checkDateExpiry(pExp) === 'expired' ? 'expired' : 'unknown';

        parsedList.push({
          id: pId,
          portalUrl: pUrl,
          mac: pMac,
          expDate: pExp,
          channelsCount: chanMatch ? chanMatch[1].trim() : 'Unknown',
          status: initialStatus,
          errorMessage: initialStatus === 'expired' ? 'Profile is expired according to import details.' : '',
          lastChecked: ''
        });
        importCount++;
      }
    });

    if (parsedList.length > 0) {
      // Append unique items, avoiding duplicates
      const existingIds = new Set(profiles.map(p => p.id));
      const filteredNew = parsedList.filter(p => !existingIds.has(p.id));
      
      const newList = [...profiles, ...filteredNew];
      saveProfilesToStorage(newList);
      alert(`Imported ${filteredNew.length} new profiles successfully! (Skipped ${parsedList.length - filteredNew.length} duplicates)`);
    } else {
      alert('Failed to parse any valid profiles. Check format: Portal, MAC Addr, Exp date, Channels.');
    }

    setBulkText('');
    setShowBulkModal(false);
  };

  // Manual Profile Save & Connect
  const handleSaveManual = (e) => {
    e.preventDefault();
    if (!portalUrl.trim() || !mac.trim()) {
      alert('Please enter Portal URL and MAC Address.');
      return;
    }

    const cleanMac = mac.trim();
    if (!/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(cleanMac)) {
      alert('Please enter a valid MAC Address (e.g., 00:1A:79:7D:CD:70).');
      return;
    }

    const cleanUrl = portalUrl.trim();
    const pId = btoa(`${cleanUrl}|${cleanMac}`);

    // Check for duplicates
    if (profiles.some(p => p.id === pId)) {
      alert('This profile already exists in the list.');
      return;
    }

    const initialStatus = checkDateExpiry(manualExpiry) === 'expired' ? 'expired' : 'unknown';

    const newProfile = {
      id: pId,
      portalUrl: cleanUrl,
      mac: cleanMac,
      expDate: manualExpiry.trim() || 'Unknown',
      channelsCount: manualChannels.trim() || 'Unknown',
      status: initialStatus,
      errorMessage: initialStatus === 'expired' ? 'Profile expired.' : '',
      lastChecked: ''
    };

    saveProfilesToStorage([...profiles, newProfile]);
    setSelectedProfile(newProfile);
    
    // Reset form
    setPortalUrl('');
    setMac('00:1A:79:');
    setManualExpiry('');
    setManualChannels('');
  };

  // Delete profile
  const handleDeleteProfile = (id, e) => {
    e.stopPropagation();
    const updated = profiles.filter(p => p.id !== id);
    saveProfilesToStorage(updated);
    if (selectedProfile?.id === id) {
      setSelectedProfile(null);
    }
  };

  // Clean Dead & Expired
  const handleCleanDead = () => {
    if (window.confirm('Delete all Dead and Expired profiles from the list?')) {
      const updated = profiles.filter(p => p.status !== 'dead' && p.status !== 'expired');
      saveProfilesToStorage(updated);
      if (selectedProfile && (selectedProfile.status === 'dead' || selectedProfile.status === 'expired')) {
        setSelectedProfile(null);
      }
    }
  };

  // Test All saved profiles sequentially
  const handleTestAll = async (scope = 'all') => {
    if (isTestingAll || profiles.length === 0) return;

    // Filter profiles that we should test based on the scope
    const targetProfiles = profiles.filter(p => {
      if (scope === 'unknown') return p.status === 'unknown';
      if (scope === 'dead') return p.status === 'dead';
      return true; // 'all'
    });

    if (targetProfiles.length === 0) {
      alert(`No profiles with status "${scope}" found to test.`);
      return;
    }

    setIsTestingAll(true);
    setTestProgress({ current: 0, total: targetProfiles.length });

    const updated = [...profiles];
    let processedCount = 0;

    for (let i = 0; i < updated.length; i++) {
      const p = updated[i];
      
      // Check if this profile should be tested under the selected scope
      const shouldTest = (scope === 'all') || 
                         (scope === 'unknown' && p.status === 'unknown') || 
                         (scope === 'dead' && p.status === 'dead');

      if (!shouldTest) continue;

      updated[i] = { ...p, status: 'checking' };
      setProfiles([...updated]);
      
      processedCount++;
      setTestProgress({ current: processedCount, total: targetProfiles.length });

      try {
        // Evaluate expiration date locally first
        const dateStatus = checkDateExpiry(p.expDate);
        if (dateStatus === 'expired') {
          updated[i] = {
            ...p,
            status: 'expired',
            errorMessage: 'Profile has expired based on expiration date details.',
            lastChecked: new Date().toLocaleString()
          };
          continue;
        }

        const res = await fetch('/api/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ portalUrl: p.portalUrl, mac: p.mac })
        });

        const data = await res.json();
        if (res.ok) {
          updated[i] = {
            ...p,
            status: 'active',
            errorMessage: '',
            lastChecked: new Date().toLocaleString()
          };
        } else {
          updated[i] = {
            ...p,
            status: 'dead',
            errorMessage: data.error || 'Authentication rejected by portal.',
            lastChecked: new Date().toLocaleString()
          };
        }
      } catch (err) {
        updated[i] = {
          ...p,
          status: 'dead',
          errorMessage: 'Unable to reach portal server. Timeout or DNS resolution failed.',
          lastChecked: new Date().toLocaleString()
        };
      }

      setProfiles([...updated]);
      localStorage.setItem('helix_iptv_profiles', JSON.stringify(updated));
    }

    setIsTestingAll(false);
  };

  // Step helper for connection logs
  const updateStep = (text, status) => {
    setSteps(prev => {
      const filtered = prev.filter(s => s.text !== text);
      return [...filtered, { text, status }];
    });
  };

  // Initiate Stalker Connection flow on selected profile
  const handleConnectProfile = async (profile) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setConnectingProfileId(profile.id);
    setSteps([]);

    try {
      updateStep('Detecting portal URL configurations...', 'loading');
      const response = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalUrl: profile.portalUrl, mac: profile.mac })
      });

      const data = await response.json();

      if (!response.ok) {
        updateStep('Detecting portal URL configurations...', 'error');
        throw new Error(data.error || 'Failed to authenticate Stalker connection.');
      }

      updateStep('Detecting portal URL configurations...', 'done');
      updateStep('Performing Stalker Handshake...', 'loading');
      await new Promise(r => setTimeout(r, 600));
      updateStep('Performing Stalker Handshake...', 'done');
      
      updateStep('Validating MAC and generating Session Token...', 'loading');
      await new Promise(r => setTimeout(r, 600));
      updateStep('Validating MAC and generating Session Token...', 'done');
      
      updateStep('Authenticating Box profile...', 'loading');
      await new Promise(r => setTimeout(r, 500));
      updateStep('Authenticating Box profile...', 'done');

      // Update local storage checking timestamp & active status
      const updatedList = profiles.map(p => {
        if (p.id === profile.id) {
          return { ...p, status: 'active', errorMessage: '', lastChecked: new Date().toLocaleString() };
        }
        return p;
      });
      saveProfilesToStorage(updatedList);

      setTimeout(() => {
        onConnectSuccess({
          portalUrl: data.resolvedUrl || profile.portalUrl,
          mac: data.mac,
          token: data.token,
          isMock: data.isMock,
          profile: data.profile
        });
      }, 500);

    } catch (err) {
      console.error(err);
      setError(err.message);
      
      // Update local storage dead status
      const updatedList = profiles.map(p => {
        if (p.id === profile.id) {
          return { ...p, status: 'dead', errorMessage: err.message, lastChecked: new Date().toLocaleString() };
        }
        return p;
      });
      saveProfilesToStorage(updatedList);
    } finally {
      setLoading(false);
      setConnectingProfileId(null);
    }
  };

  const loadMockMode = () => {
    const mockProfile = {
      portalUrl: 'http://mock.iptv',
      mac: '00:1A:79:7D:CD:70'
    };
    handleConnectProfile(mockProfile);
  };

  // Helper to parse expiry date for sorting
  const getExpiryTimestamp = (dateStr) => {
    if (!dateStr || dateStr === 'Unknown' || dateStr === 'N/A') return 0;
    try {
      const cleanDateStr = dateStr.replace(/,\s*\d+:\d+\s*(am|pm)/i, '');
      const d = new Date(cleanDateStr);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    } catch (e) {
      return 0;
    }
  };

  // Helper to parse channel count for sorting
  const getChannelsNumber = (countStr) => {
    if (!countStr || countStr === 'Unknown' || countStr === 'N/A') return 0;
    const num = parseInt(countStr, 10);
    return isNaN(num) ? 0 : num;
  };

  // Filter and sort profiles based on active filters, search query, and sorting criteria
  const processedProfiles = profiles
    .filter(p => {
      // 1. Status Filter
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      // 2. Search query (by portal URL or MAC)
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const urlMatch = p.portalUrl && p.portalUrl.toLowerCase().includes(query);
        const macMatch = p.mac && p.mac.toLowerCase().includes(query);
        return urlMatch || macMatch;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'none') return 0;

      let valA = 0;
      let valB = 0;

      if (sortBy === 'expiry') {
        valA = getExpiryTimestamp(a.expDate);
        valB = getExpiryTimestamp(b.expDate);
        
        if (valA === 0 && valB !== 0) return 1;
        if (valB === 0 && valA !== 0) return -1;
      } else if (sortBy === 'channels') {
        valA = getChannelsNumber(a.channelsCount);
        valB = getChannelsNumber(b.channelsCount);

        if (valA === 0 && valB !== 0) return 1;
        if (valB === 0 && valA !== 0) return -1;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'var(--accent-primary)'; // Greenish/Neon Cyan
      case 'checking': return '#00d2ff'; // Blue
      case 'expired': return '#ffaa00'; // Orange
      case 'dead': return '#ff4b4b'; // Red
      default: return 'var(--text-muted)'; // Grey
    }
  };

  return (
    <div style={dashboardContainerStyle}>
      <div style={innerGridStyle}>
        
        {/* LEFT COLUMN: Profile Manager list */}
        <div className="glass-panel" style={leftPanelStyle}>
          <div style={headerSectionStyle}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1.4rem', color: 'var(--text-primary)' }}>Stalker Profile Manager</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Bulk import, verify expiration dates, and test connections.
              </p>
            </div>
            
            <div style={actionButtonsGroupStyle}>
              <button 
                className="btn-primary" 
                style={importButtonStyle} 
                onClick={() => setShowBulkModal(true)}
              >
                📥 Bulk Import
              </button>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <select 
                  value={testScope} 
                  onChange={(e) => setTestScope(e.target.value)}
                  style={testSelectStyle}
                  disabled={isTestingAll}
                >
                  <option value="all">Test All</option>
                  <option value="unknown">Test Unknowns</option>
                  <option value="dead">Test Deads</option>
                </select>
                <button 
                  className="btn-secondary" 
                  style={testButtonStyle} 
                  onClick={() => handleTestAll(testScope)}
                  disabled={isTestingAll || profiles.length === 0}
                >
                  {isTestingAll ? `Testing (${testProgress.current}/${testProgress.total})` : '🔍 Run'}
                </button>
              </div>
              <button 
                className="btn-secondary" 
                style={cleanButtonStyle} 
                onClick={handleCleanDead}
                disabled={profiles.length === 0}
              >
                🗑 Clean Dead
              </button>
            </div>
          </div>

          {/* Tester status progress bar */}
          {isTestingAll && (
            <div style={progressBarContainerStyle}>
              <div 
                style={{ 
                  ...progressBarStyle, 
                  width: `${(testProgress.current / testProgress.total) * 100}%` 
                }} 
              />
            </div>
          )}

          {/* Quick Filters */}
          <div style={filterBarStyle}>
            {['all', 'active', 'expired', 'dead', 'unknown'].map(filterName => {
              const count = profiles.filter(p => filterName === 'all' ? true : p.status === filterName).length;
              return (
                <button
                  key={filterName}
                  style={{
                    ...filterTabButtonStyle,
                    borderColor: statusFilter === filterName ? getStatusColor(filterName) : 'transparent',
                    color: statusFilter === filterName ? 'var(--text-primary)' : 'var(--text-muted)'
                  }}
                  onClick={() => setStatusFilter(filterName)}
                >
                  <span style={{ textTransform: 'capitalize' }}>{filterName}</span>
                  <span style={{ 
                    marginLeft: '6px', 
                    fontSize: '0.75rem', 
                    padding: '2px 6px', 
                    borderRadius: '10px', 
                    backgroundColor: 'rgba(255,255,255,0.06)' 
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search and Sort Controls */}
          <div style={searchSortBarStyle}>
            <input
              type="text"
              className="input-field"
              style={searchFieldStyle}
              placeholder="🔍 Search portal URL or MAC..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            
            <div style={sortControlsStyle}>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={sortSelectStyle}
              >
                <option value="none">Sort: Default</option>
                <option value="expiry">Sort: Expiry Date</option>
                <option value="channels">Sort: Channels</option>
              </select>

              {sortBy !== 'none' && (
                <button
                  className="btn-secondary"
                  style={sortOrderButtonStyle}
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  title={sortOrder === 'asc' ? 'Sort Ascending' : 'Sort Descending'}
                >
                  {sortOrder === 'asc' ? '▲ Asc' : '▼ Desc'}
                </button>
              )}
            </div>
          </div>

          {/* Profiles List */}
          <div style={profilesScrollStyle}>
            {processedProfiles.length === 0 ? (
              <div style={emptyStateStyle}>
                <p>No profiles found matching filter.</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  Paste credentials in bulk using the import button above or fill out the manual form.
                </p>
              </div>
            ) : (
              processedProfiles.map(p => {
                const isSelected = selectedProfile?.id === p.id;
                const statusColor = getStatusColor(p.status);
                
                return (
                  <div
                    key={p.id}
                    className="glass-panel-interactive"
                    style={{
                      ...profileRowStyle,
                      borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-glass)',
                      boxShadow: isSelected ? '0 0 10px var(--accent-glow)' : 'none'
                    }}
                    onClick={() => setSelectedProfile(p)}
                  >
                    {/* Status circle indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span 
                        style={{ 
                          width: '10px', 
                          height: '10px', 
                          borderRadius: '50%', 
                          backgroundColor: statusColor,
                          boxShadow: `0 0 8px ${statusColor}`,
                          flexShrink: 0
                        }} 
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={rowUrlStyle}>{p.portalUrl}</span>
                        <span style={rowMacStyle}>MAC: {p.mac}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                      <div style={metaStatsStyle}>
                        <span>📅 {p.expDate}</span>
                        <span>📺 {p.channelsCount} ch</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          className="btn-primary"
                          style={rowPlayButtonStyle}
                          title="Connect to this portal"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProfile(p);
                            handleConnectProfile(p);
                          }}
                        >
                          ▶
                        </button>
                        <button
                          className="btn-secondary"
                          style={rowDeleteButtonStyle}
                          title="Delete profile"
                          onClick={(e) => handleDeleteProfile(p.id, e)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Details / Manual Add / Loading logs */}
        <div className="glass-panel" style={rightPanelStyle}>
          {loading ? (
            /* Connection Progress Display */
            <div style={logsContainerStyle}>
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div className="spinner" style={{ width: '48px', height: '48px', margin: '0 auto 16px auto', borderWidth: '4px' }} />
                <h3 style={{ fontFamily: 'var(--font-title)', fontSize: '1.2rem', color: 'var(--text-primary)' }}>Establishing Tunnel</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  Connecting to Portal: {selectedProfile?.portalUrl}
                </p>
              </div>

              <div style={logsListStyle}>
                {steps.map((step, idx) => (
                  <div key={idx} style={logRowStyle}>
                    {step.status === 'loading' && <div className="spinner" style={{ width: '16px', height: '16px' }} />}
                    {step.status === 'done' && <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>✓</span>}
                    {step.status === 'error' && <span style={{ color: '#ff4b4b', fontWeight: 'bold' }}>✕</span>}
                    <span style={{ color: step.status === 'done' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {step.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : selectedProfile ? (
            /* Detailed View of Selected Profile */
            <div style={detailsViewStyle}>
              <div style={detailsHeaderStyle}>
                <h3 style={{ fontFamily: 'var(--font-title)', fontSize: '1.3rem' }}>Profile details</h3>
                <span 
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    color: getStatusColor(selectedProfile.status),
                    border: `1px solid ${getStatusColor(selectedProfile.status)}`
                  }}
                >
                  {selectedProfile.status.toUpperCase()}
                </span>
              </div>

              <div style={detailsGridStyle}>
                <div style={detailsItemStyle}>
                  <label style={detailsLabelStyle}>Portal Endpoint</label>
                  <span style={detailsValueStyle}>{selectedProfile.portalUrl}</span>
                </div>

                <div style={detailsItemStyle}>
                  <label style={detailsLabelStyle}>MAC Address</label>
                  <span style={{ ...detailsValueStyle, fontFamily: 'monospace' }}>{selectedProfile.mac}</span>
                </div>

                <div style={detailsItemStyle}>
                  <label style={detailsLabelStyle}>Exp date</label>
                  <span style={detailsValueStyle}>{selectedProfile.expDate}</span>
                </div>

                <div style={detailsItemStyle}>
                  <label style={detailsLabelStyle}>Reported Channels</label>
                  <span style={detailsValueStyle}>{selectedProfile.channelsCount}</span>
                </div>

                {selectedProfile.lastChecked && (
                  <div style={detailsItemStyle}>
                    <label style={detailsLabelStyle}>Last connection check</label>
                    <span style={detailsValueStyle}>{selectedProfile.lastChecked}</span>
                  </div>
                )}

                {selectedProfile.errorMessage && (
                  <div style={{ ...detailsItemStyle, gridColumn: 'span 2' }}>
                    <label style={{ ...detailsLabelStyle, color: '#ff4b4b' }}>Diagnostics Failure</label>
                    <p style={detailsErrorTextStyle}>{selectedProfile.errorMessage}</p>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid var(--border-glass)' }}>
                <button 
                  className="btn-primary" 
                  style={{ width: '100%', padding: '14px' }} 
                  onClick={() => handleConnectProfile(selectedProfile)}
                >
                  ▶ CONNECT TO PORTAL
                </button>
                <button 
                  className="btn-secondary" 
                  style={{ width: '100%', padding: '12px' }} 
                  onClick={() => setSelectedProfile(null)}
                >
                  Back to Add Profile Form
                </button>
              </div>
            </div>
          ) : (
            /* Manual Form View (Default view) */
            <div style={manualFormContainerStyle}>
              <h3 style={{ fontFamily: 'var(--font-title)', fontSize: '1.2rem', marginBottom: '20px', color: 'var(--text-primary)' }}>
                Add Custom Stalker Profile
              </h3>

              {error && (
                <div style={formErrorStyle}>
                  <strong>Connection Failure</strong>
                  <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>{error}</p>
                </div>
              )}

              <form onSubmit={handleSaveManual} style={manualFormStyle}>
                <div>
                  <label style={manualLabelStyle}>PORTAL ENDPOINT URL</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="http://procdnnet.eu:80/c/"
                    value={portalUrl}
                    onChange={(e) => setPortalUrl(e.target.value)}
                  />
                </div>

                <div>
                  <label style={manualLabelStyle}>MAC ADDRESS (00:1A:79 format)</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="00:1A:79:00:00:00"
                    value={mac}
                    onChange={(e) => setMac(e.target.value)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={manualLabelStyle}>EXPIRATION DATE</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="August 12, 2026"
                      value={manualExpiry}
                      onChange={(e) => setManualExpiry(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={manualLabelStyle}>CHANNELS NUMBER</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="3960"
                      value={manualChannels}
                      onChange={(e) => setManualChannels(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                  <button type="submit" className="btn-primary" style={{ flex: 1, padding: '12px' }}>
                    Save to List
                  </button>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    style={{ flex: 1, padding: '12px' }}
                    onClick={() => {
                      if (!portalUrl.trim() || !mac.trim()) {
                        alert('Enter details to connect.');
                        return;
                      }
                      handleConnectProfile({ portalUrl, mac });
                    }}
                  >
                    Quick Connect
                  </button>
                </div>

                <div style={dividerContainerStyle}>
                  <span style={dividerTextStyle}>TEST SIMULATION</span>
                </div>

                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={loadMockMode}
                  style={{ padding: '12px', borderColor: 'rgba(0, 240, 255, 0.25)' }}
                >
                  ⚡ Start Offline IPTV Simulator (Mock Mode)
                </button>
              </form>
            </div>
          )}
        </div>

      </div>

      {/* BULK IMPORT MODAL OVERLAY */}
      {showBulkModal && (
        <div style={modalOverlayStyle}>
          <div className="glass-panel" style={modalCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontFamily: 'var(--font-title)', fontSize: '1.2rem' }}>Bulk Import Stalker Profiles</h3>
              <button style={modalCloseButtonStyle} onClick={() => setShowBulkModal(false)}>✕</button>
            </div>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: '1.4' }}>
              Paste text containing one or more credentials. The parser automatically extracts the repeating block sections.
            </p>

            <textarea
              style={textareaStyle}
              placeholder={`Portal  :  http://procdnnet.eu:80/c\nMAC Addr:  00:1A:79:7D:68:44\nExp date:  August 12, 2026, 12:00 am\nChannels:  3960\n\nPortal  :  http://procdnnet.eu:80/c\nMAC Addr:  00:1A:79:0D:A1:97\n...`}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" style={{ padding: '10px 20px' }} onClick={() => setShowBulkModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" style={{ padding: '10px 24px' }} onClick={handleBulkImport}>
                Import Profiles
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// INLINE STYLES FOR THE DASHBOARD
// -------------------------------------------------------------
const dashboardContainerStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100vh',
  width: '100vw',
  padding: '30px',
  backgroundColor: '#050508'
};

const innerGridStyle = {
  display: 'grid',
  gridTemplateColumns: '1.5fr 1fr',
  gap: '30px',
  width: '100%',
  maxWidth: '1200px',
  height: '85vh'
};

const leftPanelStyle = {
  display: 'flex',
  flexDirection: 'column',
  padding: '30px',
  overflow: 'hidden'
};

const rightPanelStyle = {
  display: 'flex',
  flexDirection: 'column',
  padding: '30px',
  justifyContent: 'center',
  overflowY: 'auto'
};

const headerSectionStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  borderBottom: '1px solid var(--border-glass)',
  paddingBottom: '20px',
  flexShrink: 0
};

const actionButtonsGroupStyle = {
  display: 'flex',
  gap: '10px'
};

const importButtonStyle = {
  fontSize: '0.85rem',
  padding: '8px 14px'
};

const testButtonStyle = {
  fontSize: '0.85rem',
  padding: '8px 14px'
};

const testSelectStyle = {
  background: 'rgba(25, 27, 38, 0.85)',
  border: '1px solid var(--border-glass)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  padding: '8px 10px',
  cursor: 'pointer',
  outline: 'none',
  transition: 'var(--transition-smooth)'
};

const cleanButtonStyle = {
  fontSize: '0.85rem',
  padding: '8px 14px',
  color: '#ff4b4b',
  borderColor: 'rgba(255, 75, 75, 0.15)'
};

const filterBarStyle = {
  display: 'flex',
  gap: '12px',
  margin: '15px 0',
  flexShrink: 0,
  overflowX: 'auto',
  paddingBottom: '5px'
};

const filterTabButtonStyle = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid transparent',
  borderBottomWidth: '2px',
  padding: '6px 12px',
  borderRadius: '6px',
  fontSize: '0.8rem',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  transition: 'var(--transition-smooth)'
};

const profilesScrollStyle = {
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  paddingRight: '5px'
};

const profileRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 20px',
  borderRadius: '12px',
  cursor: 'pointer',
  border: '1px solid',
  transition: 'var(--transition-smooth)'
};

const rowUrlStyle = {
  fontSize: '0.9rem',
  fontWeight: '500',
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '240px'
};

const rowMacStyle = {
  fontSize: '0.75rem',
  color: 'var(--text-muted)',
  fontFamily: 'monospace'
};

const metaStatsStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: '4px',
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  textAlign: 'right'
};

const rowPlayButtonStyle = {
  padding: '6px 10px',
  fontSize: '0.8rem',
  borderRadius: '6px'
};

const rowDeleteButtonStyle = {
  padding: '6px 10px',
  fontSize: '0.8rem',
  borderRadius: '6px',
  color: '#ff4b4b',
  border: '1px solid rgba(255, 75, 75, 0.1)'
};

const emptyStateStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  textAlign: 'center',
  color: 'var(--text-secondary)',
  padding: '40px'
};

const manualFormContainerStyle = {
  width: '100%'
};

const manualFormStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '18px'
};

const manualLabelStyle = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: '600',
  color: 'var(--text-secondary)',
  marginBottom: '6px',
  letterSpacing: '0.5px'
};

const formErrorStyle = {
  background: 'rgba(239, 68, 68, 0.08)',
  border: '1px solid rgba(239, 68, 68, 0.15)',
  color: '#f87171',
  padding: '14px',
  borderRadius: '8px',
  marginBottom: '16px'
};

const dividerContainerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '10px 0',
  position: 'relative'
};

const dividerTextStyle = {
  background: '#090a0f',
  padding: '0 10px',
  color: 'var(--text-muted)',
  fontSize: '0.7rem',
  fontWeight: 'bold',
  letterSpacing: '1px'
};

const detailsViewStyle = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%'
};

const detailsHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid var(--border-glass)',
  paddingBottom: '16px',
  marginBottom: '20px'
};

const detailsGridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '20px',
  marginBottom: '20px'
};

const detailsItemStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px'
};

const detailsLabelStyle = {
  fontSize: '0.75rem',
  color: 'var(--text-muted)',
  fontWeight: '700',
  textTransform: 'uppercase',
  letterSpacing: '0.5px'
};

const detailsValueStyle = {
  fontSize: '0.9rem',
  color: 'var(--text-primary)',
  wordBreak: 'break-all'
};

const detailsErrorTextStyle = {
  fontSize: '0.8rem',
  color: '#ff8888',
  backgroundColor: 'rgba(255, 75, 75, 0.05)',
  padding: '10px',
  borderRadius: '6px',
  border: '1px solid rgba(255, 75, 75, 0.15)',
  lineHeight: '1.4'
};

const logsContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  padding: '10px 0'
};

const logsListStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  width: '100%',
  alignItems: 'flex-start',
  paddingLeft: '10px'
};

const logRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  fontSize: '0.9rem'
};

const progressBarContainerStyle = {
  width: '100%',
  height: '4px',
  backgroundColor: 'rgba(255, 255, 255, 0.06)',
  borderRadius: '2px',
  overflow: 'hidden',
  margin: '10px 0',
  flexShrink: 0
};

const progressBarStyle = {
  height: '100%',
  backgroundColor: 'var(--accent-primary)',
  transition: 'width 0.3s ease'
};

const modalOverlayStyle = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(5, 5, 8, 0.85)',
  zIndex: 99999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px'
};

const modalCardStyle = {
  width: '100%',
  maxWidth: '560px',
  padding: '30px',
  position: 'relative'
};

const modalCloseButtonStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  fontSize: '1.1rem',
  cursor: 'pointer'
};

const textareaStyle = {
  width: '100%',
  height: '220px',
  backgroundColor: 'rgba(0,0,0,0.3)',
  border: '1px solid var(--border-glass)',
  borderRadius: '8px',
  padding: '12px',
  color: 'var(--text-primary)',
  fontFamily: 'monospace',
  fontSize: '0.8rem',
  lineHeight: '1.5',
  resize: 'none',
  outline: 'none'
};

const searchSortBarStyle = {
  display: 'flex',
  gap: '12px',
  marginBottom: '15px',
  flexShrink: 0,
  alignItems: 'center',
  justifyContent: 'space-between'
};

const searchFieldStyle = {
  flex: 1,
  padding: '10px 14px',
  fontSize: '0.85rem'
};

const sortControlsStyle = {
  display: 'flex',
  gap: '8px',
  alignItems: 'center'
};

const sortSelectStyle = {
  background: 'rgba(25, 27, 38, 0.85)',
  border: '1px solid var(--border-glass)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  padding: '10px 12px',
  cursor: 'pointer',
  outline: 'none',
  transition: 'var(--transition-smooth)'
};

const sortOrderButtonStyle = {
  padding: '10px 12px',
  fontSize: '0.85rem',
  borderRadius: '8px',
  whiteSpace: 'nowrap'
};
