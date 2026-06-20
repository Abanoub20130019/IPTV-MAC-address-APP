import React, { useEffect, useState } from 'react';
import VideoPlayer from './VideoPlayer';

export default function LiveTVTab({ connection }) {
  const [genres, setGenres] = useState([]);
  const [channels, setChannels] = useState([]);
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [genreSearchQuery, setGenreSearchQuery] = useState('');
  const [activeChannel, setActiveChannel] = useState(null);
  const [resolvedStreamUrl, setResolvedStreamUrl] = useState('');
  
  // Favorites state
  const [favorites, setFavorites] = useState([]);

  // Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = React.useRef(null);
  const scrollContainerRef = React.useRef(null);
  const isFetchingRef = React.useRef(false);

  const [loadingGenres, setLoadingGenres] = useState(true);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [resolvingLink, setResolvingLink] = useState(false);
  const [error, setError] = useState(null);

  // Load favorites from local storage
  useEffect(() => {
    const saved = localStorage.getItem('helix_iptv_favorites');
    if (saved) {
      try {
        setFavorites(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse favorites:', e);
      }
    }
  }, []);

  const toggleFavorite = (id) => {
    const updated = favorites.includes(id)
      ? favorites.filter(favId => favId !== id)
      : [...favorites, id];
    setFavorites(updated);
    localStorage.setItem('helix_iptv_favorites', JSON.stringify(updated));
  };

  // Fetch Genres (Categories)
  useEffect(() => {
    async function fetchGenres() {
      try {
        const res = await fetch(`/api/genres?mac=${encodeURIComponent(connection.mac)}`);
        const data = await res.json();
        
        const rawGenres = data.js || [];
        setGenres([
          { id: 'all', title: 'All Channels' },
          { id: 'favorites', title: '★ Favorites' },
          ...rawGenres
        ]);
      } catch (err) {
        console.error('Failed to fetch genres:', err);
      } finally {
        setLoadingGenres(false);
      }
    }
    fetchGenres();
  }, [connection]);

  // Reset page when genre changes
  useEffect(() => {
    setChannels([]);
    setPage(1);
    setHasMore(true);
  }, [selectedGenre]);

  useEffect(() => {
    let active = true;
    async function fetchChannels() {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      if (page === 1) {
        setLoadingChannels(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      try {
        const genreQuery = (selectedGenre === 'all' || selectedGenre === 'favorites') ? '0' : selectedGenre;
        const res = await fetch(`/api/channels?mac=${encodeURIComponent(connection.mac)}&genre=${encodeURIComponent(genreQuery)}&page=${page}`);
        const data = await res.json();
        
        if (!active) return;

        const rawChannels = data.js?.data || data.js || [];
        const items = Array.isArray(rawChannels) ? rawChannels : [];
        
        const totalItems = data.js?.total_items ? parseInt(data.js.total_items) : null;

        if (page === 1) {
          setChannels(items);
          if (totalItems !== null && !isNaN(totalItems)) {
            if (items.length >= totalItems || items.length === 0) {
              setHasMore(false);
            }
          } else {
            if (items.length < 14 || items.length === 0) {
              setHasMore(false);
            }
          }
          // Auto-play first channel if none selected
          if (items.length > 0 && !activeChannel && selectedGenre !== 'favorites') {
            playChannel(items[0]);
          }
        } else {
          setChannels(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const uniqueNew = items.filter(n => !existingIds.has(n.id));
            const updated = [...prev, ...uniqueNew];
            if (totalItems !== null && !isNaN(totalItems)) {
              if (updated.length >= totalItems || items.length === 0) {
                setHasMore(false);
              }
            } else {
              if (items.length < 14 || items.length === 0) {
                setHasMore(false);
              }
            }
            return updated;
          });
        }
      } catch (err) {
        console.error('Failed to fetch channels:', err);
        if (page === 1) {
          setError('Failed to load channels. Ensure the portal is online.');
        } else {
          setHasMore(false);
        }
      } finally {
        isFetchingRef.current = false;
        if (active) {
          setLoadingChannels(false);
          setLoadingMore(false);
        }
      }
    }
    fetchChannels();

    return () => {
      active = false;
    };
  }, [connection, selectedGenre, page]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (loadingChannels || loadingMore || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setPage(prev => prev + 1);
      }
    }, { 
      root: scrollContainerRef.current,
      threshold: 0.1 
    });

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => observer.disconnect();
  }, [loadingChannels, loadingMore, hasMore]);

  // Handle Play Link Resolution
  const playChannel = async (channel) => {
    setActiveChannel(channel);
    setResolvedStreamUrl('');
    setResolvingLink(true);
    setError(null);

    try {
      const res = await fetch('/api/create_link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mac: connection.mac,
          cmd: channel.cmd,
          type: 'itv'
        })
      });

      const data = await res.json();
      let playUrl = data.js?.cmd || data.js || '';
      
      if (!playUrl) {
        throw new Error('Server returned empty playback command');
      }

      if (connection.isMock && data.js?.realUrl) {
        setResolvedStreamUrl(data.js.realUrl);
      } else {
        setResolvedStreamUrl(playUrl);
      }
    } catch (err) {
      console.error('Error creating play link:', err);
      setError(`Failed to resolve play link for channel "${channel.name}".`);
    } finally {
      setResolvingLink(false);
    }
  };

  // Filter genres by search query
  const filteredGenres = genres.filter(g => 
    g.title?.toLowerCase().includes(genreSearchQuery.toLowerCase()) || g.id === 'all' || g.id === 'favorites'
  );

  // Filter channels by category & search query
  const filteredChannels = channels.filter(channel => {
    if (selectedGenre === 'favorites' && !favorites.includes(channel.id)) {
      return false;
    }
    const nameMatch = channel.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const numMatch = channel.number?.toString().includes(searchQuery);
    return nameMatch || numMatch;
  });

  return (
    <div style={gridStyle}>
      {/* 1. Genres Sidebar */}
      <div className="glass-panel" style={sidebarStyle}>
        <h3 style={sidebarTitleStyle}>Genres</h3>
        
        <div className="category-search-wrapper">
          <input
            type="text"
            className="input-field"
            placeholder="Search categories..."
            value={genreSearchQuery}
            onChange={(e) => setGenreSearchQuery(e.target.value)}
          />
        </div>

        {loadingGenres ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
            <div className="spinner" />
          </div>
        ) : (
          <div style={sidebarListStyle}>
            {filteredGenres.map(g => (
              <button
                key={g.id}
                style={{
                  ...genreButtonStyle,
                  background: selectedGenre === g.id ? 'var(--accent-glow)' : 'transparent',
                  color: selectedGenre === g.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  borderColor: selectedGenre === g.id ? 'rgba(0, 240, 255, 0.4)' : 'transparent'
                }}
                onClick={() => setSelectedGenre(g.id)}
              >
                {g.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. Channels List Grid */}
      <div style={channelsContainerStyle}>
        {/* Search Header */}
        <div style={searchHeaderStyle}>
          <input
            type="text"
            className="input-field"
            placeholder="Search channels by name or number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {loadingChannels ? (
          <div style={loadingOverlayStyle}>
            <div className="spinner" style={{ width: '40px', height: '40px' }} />
            <p style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>Fetching Channel List...</p>
          </div>
        ) : error && channels.length === 0 ? (
          <div style={infoBoxStyle}>
            <p style={{ color: '#ff4b4b' }}>{error}</p>
          </div>
        ) : filteredChannels.length === 0 ? (
          <div style={infoBoxStyle}>
            <p style={{ color: 'var(--text-muted)' }}>
              {selectedGenre === 'favorites' 
                ? 'No channels saved to Favorites yet. Click the star on any channel card to add it!' 
                : `No channels found matching "${searchQuery}"`}
            </p>
          </div>
        ) : (
          <div style={channelsGridStyle} ref={scrollContainerRef}>
            {filteredChannels.map(ch => {
              const isFav = favorites.includes(ch.id);
              return (
                <div
                  key={ch.id}
                  className="glass-panel-interactive"
                  style={{
                    ...channelCardStyle,
                    borderColor: activeChannel?.id === ch.id ? 'var(--accent-primary)' : 'var(--border-glass)',
                    boxShadow: activeChannel?.id === ch.id ? '0 0 12px var(--accent-glow)' : 'none',
                    position: 'relative'
                  }}
                  onClick={() => playChannel(ch)}
                >
                  {/* Floating Star Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(ch.id);
                    }}
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      background: 'none',
                      border: 'none',
                      color: isFav ? '#ffcc00' : 'rgba(255,255,255,0.2)',
                      fontSize: '1rem',
                      cursor: 'pointer',
                      zIndex: 5,
                      textShadow: isFav ? '0 0 8px rgba(255,204,0,0.6)' : 'none',
                      transition: 'color 0.2s'
                    }}
                    title={isFav ? 'Remove from Favorites' : 'Add to Favorites'}
                  >
                    ★
                  </button>

                  <div style={logoWrapperStyle}>
                    {ch.logo ? (
                      <img src={ch.logo} alt={ch.name} style={channelLogoStyle} onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }} />
                    ) : null}
                    <div style={{...fallbackLogoStyle, display: ch.logo ? 'none' : 'flex'}}>
                      {ch.name?.substring(0, 2).toUpperCase()}
                    </div>
                  </div>
                  <div style={channelDetailsStyle}>
                    <span style={channelNumberStyle}>CH {ch.number || ch.id?.substring(0,3)}</span>
                    <h4 style={channelNameStyle}>{ch.name}</h4>
                  </div>
                </div>
              )
            })}

            {hasMore && (
              <div ref={sentinelRef} style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '15px 0' }}>
                <div className="spinner" style={{ width: '28px', height: '28px' }} />
                <span style={{ marginLeft: '10px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading more channels...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Player Section */}
      <div style={playerSectionStyle}>
        {activeChannel ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
            <div style={{ flex: 1, minHeight: '300px' }}>
              {resolvingLink ? (
                <div style={playerLoadingStyle} className="glass-panel">
                  <div className="spinner" style={{ width: '36px', height: '36px' }} />
                  <p style={{ marginTop: '12px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Resolving channel stream...
                  </p>
                </div>
              ) : resolvedStreamUrl ? (
                <VideoPlayer
                  streamUrl={resolvedStreamUrl}
                  title={activeChannel.name}
                  mac={connection.mac}
                  streamId={activeChannel.id}
                  token={connection.token}
                  portalUrl={connection.portalUrl}
                  isLive={true}
                />
              ) : (
                <div style={playerLoadingStyle} className="glass-panel">
                  <p style={{ color: '#ff4b4b' }}>Unable to load channel stream.</p>
                </div>
              )}
            </div>

            {/* EPG / Channel Banner */}
            <div className="glass-panel" style={epgContainerStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ ...logoWrapperStyle, width: '48px', height: '48px' }}>
                  {activeChannel.logo ? (
                    <img src={activeChannel.logo} alt={activeChannel.name} style={channelLogoStyle} />
                  ) : (
                    <div style={fallbackLogoStyle}>{activeChannel.name?.substring(0, 2).toUpperCase()}</div>
                  )}
                </div>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-title)', fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                    {activeChannel.name}
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Live TV Broadcast • CH {activeChannel.number || activeChannel.id}
                  </span>
                </div>
              </div>

              <div style={epgContentStyle}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ELECTRONIC PROGRAM GUIDE (EPG)</span>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  No program guide information available for this channel.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div style={noChannelStyle} className="glass-panel">
            <svg style={{ width: '64px', height: '64px', color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p style={{ marginTop: '16px', color: 'var(--text-secondary)', fontWeight: '500' }}>
              Select a channel from the grid to start watching
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// INLINE STYLES
// -------------------------------------------------------------
const gridStyle = {
  display: 'grid',
  gridTemplateColumns: '240px 1fr 400px',
  gap: '24px',
  height: 'calc(100vh - 100px)',
  width: '100%',
  overflow: 'hidden'
};

const sidebarStyle = {
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflowY: 'auto'
};

const sidebarTitleStyle = {
  fontFamily: 'var(--font-title)',
  fontSize: '1.1rem',
  fontWeight: '600',
  marginBottom: '16px',
  letterSpacing: '0.5px',
  color: 'var(--text-primary)',
  textTransform: 'uppercase'
};

const sidebarListStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
};

const genreButtonStyle = {
  width: '100%',
  padding: '12px 16px',
  textAlign: 'left',
  border: '1px solid transparent',
  borderRadius: '8px',
  fontSize: '0.9rem',
  cursor: 'pointer',
  transition: 'var(--transition-smooth)'
};

const channelsContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
  height: '100%',
  overflow: 'hidden'
};

const searchHeaderStyle = {
  flexShrink: 0
};

const channelsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: '16px',
  overflowY: 'auto',
  paddingBottom: '20px',
  height: '100%'
};

const channelCardStyle = {
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
  textAlign: 'center',
  height: '140px',
  justifyContent: 'center'
};

const logoWrapperStyle = {
  width: '42px',
  height: '42px',
  borderRadius: '8px',
  overflow: 'hidden',
  backgroundColor: 'rgba(0,0,0,0.2)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid rgba(255,255,255,0.05)',
  flexShrink: 0
};

const channelLogoStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'contain'
};

const fallbackLogoStyle = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.85rem',
  fontWeight: 'bold',
  color: 'var(--accent-primary)',
  background: 'rgba(0, 240, 255, 0.05)'
};

const channelDetailsStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  width: '100%'
};

const channelNumberStyle = {
  fontSize: '0.7rem',
  color: 'var(--accent-primary)',
  fontWeight: 'bold',
  letterSpacing: '0.5px'
};

const channelNameStyle = {
  fontSize: '0.85rem',
  fontWeight: '500',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  color: 'var(--text-primary)'
};

const playerSectionStyle = {
  height: '100%',
  overflowY: 'auto'
};

const noChannelStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '350px',
  textAlign: 'center',
  padding: '24px'
};

const playerLoadingStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '225px',
  backgroundColor: '#000'
};

const loadingOverlayStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%'
};

const infoBoxStyle = {
  textAlign: 'center',
  padding: '40px',
  fontSize: '0.95rem'
};

const epgContainerStyle = {
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px'
};

const epgContentStyle = {
  background: 'rgba(0, 0, 0, 0.2)',
  padding: '14px',
  borderRadius: '8px',
  border: '1px solid rgba(255, 255, 255, 0.03)'
};
