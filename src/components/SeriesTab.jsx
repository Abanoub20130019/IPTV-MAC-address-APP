import React, { useEffect, useState } from 'react';
import VideoPlayer from './VideoPlayer';

export default function SeriesTab({ connection }) {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [seriesList, setSeriesList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [catSearchQuery, setCatSearchQuery] = useState('');
  
  // Favorites state
  const [favorites, setFavorites] = useState([]);

  // Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = React.useRef(null);
  const scrollContainerRef = React.useRef(null);
  const isFetchingRef = React.useRef(false);
  
  // Selected Series, Seasons & Episodes state
  const [activeSeries, setActiveSeries] = useState(null);
  const [seasonsList, setSeasonsList] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [activeEpisode, setActiveEpisode] = useState(null);
  const [resolvedStreamUrl, setResolvedStreamUrl] = useState('');
  const [showTheaterMode, setShowTheaterMode] = useState(false);

  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
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

  // Fetch Series Categories
  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch(`/api/series/categories?mac=${encodeURIComponent(connection.mac)}`);
        const data = await res.json();
        
        const rawCats = data.js || [];
        setCategories([
          { id: 'all', title: 'All Series' },
          { id: 'favorites', title: '★ Favorites' },
          ...rawCats
        ]);
      } catch (err) {
        console.error('Failed to load series categories:', err);
      } finally {
        setLoadingCats(false);
      }
    }
    fetchCategories();
  }, [connection]);

  // Reset page when category changes
  useEffect(() => {
    setSeriesList([]);
    setPage(1);
    setHasMore(true);
  }, [selectedCategory]);

  // Fetch TV Series List
  useEffect(() => {
    let active = true;
    async function fetchSeries() {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      if (page === 1) {
        setLoadingSeries(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      try {
        const catQuery = (selectedCategory === 'all' || selectedCategory === 'favorites') ? '0' : selectedCategory;
        const res = await fetch(`/api/series/list?mac=${encodeURIComponent(connection.mac)}&category=${encodeURIComponent(catQuery)}&page=${page}`);
        const data = await res.json();

        if (!active) return;

        const rawList = data.js?.data || data.js || [];
        const items = Array.isArray(rawList) ? rawList : [];
        
        const normalized = items.map(s => ({
          id: s.video_id || s.id,
          name: s.name || s.title || 'Untitled Series',
          category_id: s.category_id,
          screenshot_uri: s.screenshot_uri || s.poster || 'https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?w=400&h=600&fit=crop',
          description: s.description || s.plot || 'No description available.'
        }));
        
        if (page === 1) {
          setSeriesList(normalized);
        } else {
          setSeriesList(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const uniqueNew = normalized.filter(n => !existingIds.has(n.id));
            return [...prev, ...uniqueNew];
          });
        }

        if (normalized.length < 14) {
          setHasMore(false);
        }
      } catch (err) {
        console.error('Failed to fetch series list:', err);
        if (page === 1) {
          setError('Failed to load series.');
        } else {
          setHasMore(false);
        }
      } finally {
        isFetchingRef.current = false;
        if (active) {
          setLoadingSeries(false);
          setLoadingMore(false);
        }
      }
    }
    fetchSeries();

    return () => {
      active = false;
    };
  }, [connection, selectedCategory, page]);

  // Intersection observer for series infinite scroll
  useEffect(() => {
    if (loadingSeries || loadingMore || !hasMore) return;
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
  }, [loadingSeries, loadingMore, hasMore]);

  // Fetch Seasons when Active Series is selected
  useEffect(() => {
    if (!activeSeries) return;

    async function fetchSeasons() {
      setLoadingEpisodes(true);
      setSeasonsList([]);
      setSelectedSeason(null);
      setEpisodes([]);
      setActiveEpisode(null);
      setResolvedStreamUrl('');

      try {
        const res = await fetch(`/api/series/seasons?mac=${encodeURIComponent(connection.mac)}&seriesId=${encodeURIComponent(activeSeries.id)}`);
        const data = await res.json();
        
        const rawSeasons = data.js || [];
        const items = Array.isArray(rawSeasons) ? rawSeasons : [];
        setSeasonsList(items);

        // Auto-select first season
        if (items.length > 0) {
          setSelectedSeason(items[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch seasons:', err);
      } finally {
        setLoadingEpisodes(false);
      }
    }

    fetchSeasons();
  }, [connection, activeSeries]);

  // Fetch Episodes when Selected Season changes
  useEffect(() => {
    if (!activeSeries || !selectedSeason) return;

    async function fetchEpisodes() {
      setLoadingEpisodes(true);
      setEpisodes([]);
      
      try {
        const res = await fetch(`/api/series/episodes?mac=${encodeURIComponent(connection.mac)}&seriesId=${encodeURIComponent(activeSeries.id)}&seasonId=${encodeURIComponent(selectedSeason)}`);
        const data = await res.json();
        
        const rawEps = data.js?.data || data.js || [];
        const items = Array.isArray(rawEps) ? rawEps : [];

        const normalized = items.map(ep => ({
          id: ep.id,
          name: ep.name || ep.title || `Episode ${ep.series_number || ep.series_num || ''}`,
          episodeNumber: ep.series_number || ep.episode_number || ep.series_num || ep.episode_num || '0',
          cmd: (ep.cmd || ep.link || '').replace(/^(ffmpeg|ffrt|direc|mpv|auto)\s+/, '').trim(),
          description: ep.description || ep.plot || 'No episode plot available.',
          screenshot_uri: ep.screenshot_uri || ep.poster || ''
        }));

        // Sort episodes numerically by episode number
        normalized.sort((a, b) => parseInt(a.episodeNumber) - parseInt(b.episodeNumber));
        setEpisodes(normalized);
      } catch (err) {
        console.error('Failed to fetch episodes:', err);
      } finally {
        setLoadingEpisodes(false);
      }
    }

    fetchEpisodes();
  }, [connection, activeSeries, selectedSeason]);

  const handlePlayEpisode = async (ep) => {
    setActiveEpisode(ep);
    setShowTheaterMode(true);
    setResolvedStreamUrl('');
    setResolvingLink(true);

    try {
      const res = await fetch('/api/create_link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mac: connection.mac,
          cmd: ep.cmd,
          type: 'vod',
          series: ep.episodeNumber // Stalker uses 'series' query parameter for episode number
        })
      });

      const data = await res.json();
      let playUrl = '';
      if (data.js && typeof data.js.cmd === 'string') {
        playUrl = data.js.cmd;
      } else if (typeof data.js === 'string') {
        playUrl = data.js;
      }
      if (!playUrl) {
        throw new Error('Server returned empty episode playback link');
      }

      if (connection.isMock && data.js?.realUrl) {
        setResolvedStreamUrl(data.js.realUrl);
      } else {
        setResolvedStreamUrl(playUrl);
      }
    } catch (err) {
      console.error(err);
      setError(`Failed to resolve play link for episode: ${ep.name}`);
    } finally {
      setResolvingLink(false);
    }
  };

  const handleNextEpisode = () => {
    if (!activeEpisode || !episodes) return;
    const currentIndex = episodes.findIndex(ep => ep.id === activeEpisode.id);
    if (currentIndex !== -1 && currentIndex < episodes.length - 1) {
      handlePlayEpisode(episodes[currentIndex + 1]);
    }
  };

  const handlePrevEpisode = () => {
    if (!activeEpisode || !episodes) return;
    const currentIndex = episodes.findIndex(ep => ep.id === activeEpisode.id);
    if (currentIndex > 0) {
      handlePlayEpisode(episodes[currentIndex - 1]);
    }
  };

  // Filter categories by sidebar search query
  const filteredCategories = categories.filter(cat => 
    cat.title?.toLowerCase().includes(catSearchQuery.toLowerCase()) || cat.id === 'all' || cat.id === 'favorites'
  );

  const filteredSeries = seriesList.filter(s => {
    if (selectedCategory === 'favorites' && !favorites.includes(s.id)) {
      return false;
    }
    return s.name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1.5rem' }}>TV Series & Seasons</h2>
        <input
          type="text"
          className="input-field"
          style={{ maxWidth: '300px' }}
          placeholder="Search TV series..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div style={layoutGridStyle}>
        {/* Sidebar categories */}
        <div className="glass-panel" style={sidebarStyle}>
          <h3 style={sidebarTitleStyle}>Categories</h3>
          
          <div className="category-search-wrapper">
            <input
              type="text"
              className="input-field"
              placeholder="Search categories..."
              value={catSearchQuery}
              onChange={(e) => setCatSearchQuery(e.target.value)}
            />
          </div>

          {loadingCats ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><div className="spinner" /></div>
          ) : (
            <div style={sidebarListStyle}>
              {filteredCategories.map(cat => (
                <button
                  key={cat.id}
                  style={{
                    ...catButtonStyle,
                    background: selectedCategory === cat.id ? 'var(--accent-glow)' : 'transparent',
                    color: selectedCategory === cat.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    borderColor: selectedCategory === cat.id ? 'rgba(0, 240, 255, 0.4)' : 'transparent'
                  }}
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  {cat.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content list */}
        <div style={contentStyle} ref={scrollContainerRef}>
          {loadingSeries && page === 1 ? (
            <div style={loadingContainerStyle}>
              <div className="spinner" style={{ width: '40px', height: '40px' }} />
              <p style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>Loading series...</p>
            </div>
          ) : filteredSeries.length === 0 ? (
            <div style={infoBoxStyle}>
              <p style={{ color: 'var(--text-muted)' }}>
                {selectedCategory === 'favorites'
                  ? 'No TV series saved to Favorites yet. Click the star on any series to add it!'
                  : 'No TV series found.'}
              </p>
            </div>
          ) : (
            <>
              <div style={gridStyle}>
                {filteredSeries.map(series => {
                  const isFav = favorites.includes(series.id);
                  return (
                    <div 
                      key={series.id} 
                      className="glass-panel-interactive"
                      style={{ ...seriesCardStyle, position: 'relative' }}
                      onClick={() => setActiveSeries(series)}
                    >
                      {/* Floating Star Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(series.id);
                        }}
                        style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          background: 'none',
                          border: 'none',
                          color: isFav ? '#ffcc00' : 'rgba(255,255,255,0.3)',
                          fontSize: '1.2rem',
                          cursor: 'pointer',
                          zIndex: 5,
                          textShadow: isFav ? '0 0 8px rgba(255,204,0,0.6)' : 'none',
                          transition: 'color 0.2s'
                        }}
                        title={isFav ? 'Remove from Favorites' : 'Add to Favorites'}
                      >
                        ★
                      </button>

                      <img src={series.screenshot_uri} alt={series.name} style={posterStyle} />
                      <div style={movieOverlayStyle}>
                        <h4 style={seriesTitleStyle}>{series.name}</h4>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Infinite scroll loader */}
              {hasMore && (
                <div ref={sentinelRef} className="load-more-container">
                  <div className="spinner" style={{ width: '30px', height: '30px' }} />
                  <span style={{ marginLeft: '10px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading more series...</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Series Episodes & Season Details Modal */}
      {activeSeries && (
        <div style={modalOverlayStyle}>
          <div className="glass-panel" style={modalCardStyle}>
            <button style={closeButtonStyle} onClick={() => {
              setActiveSeries(null);
              setSelectedSeason(null);
              setActiveEpisode(null);
              setResolvedStreamUrl('');
            }}>✕</button>

            <div style={modalContentGridStyle}>
              {/* Left Column: Image Poster */}
              <div style={modalMediaStyle}>
                <img src={activeSeries.screenshot_uri} alt={activeSeries.name} style={modalPosterStyle} />
              </div>

              {/* Right Column: Info & Seasons / Episodes list */}
              <div style={infoColStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1.6rem', color: 'var(--text-primary)', margin: 0 }}>
                    {activeSeries.name}
                  </h2>
                  <button
                    onClick={() => toggleFavorite(activeSeries.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: favorites.includes(activeSeries.id) ? '#ffcc00' : 'rgba(255,255,255,0.3)',
                      fontSize: '1.5rem',
                      cursor: 'pointer',
                      textShadow: favorites.includes(activeSeries.id) ? '0 0 8px rgba(255,204,0,0.6)' : 'none',
                      transition: 'color 0.2s',
                      padding: 0
                    }}
                    title={favorites.includes(activeSeries.id) ? 'Remove from Favorites' : 'Add to Favorites'}
                  >
                    ★
                  </button>
                </div>
                <p style={descriptionStyle}>{activeSeries.description}</p>

                {/* Season Tabs Selector */}
                {seasonsList.length > 0 && (
                  <div style={{ marginTop: '20px' }}>
                    <h4 style={subTitleStyle}>Seasons</h4>
                    <div style={seasonTabsStyle}>
                      {seasonsList.map(season => (
                        <button
                          key={season.id}
                          style={{
                            ...seasonTabButtonStyle,
                            background: selectedSeason === season.id ? 'var(--accent-glow)' : 'rgba(255,255,255,0.03)',
                            color: selectedSeason === season.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                            borderColor: selectedSeason === season.id ? 'var(--accent-primary)' : 'var(--border-glass)'
                          }}
                          onClick={() => {
                            setSelectedSeason(season.id);
                            setActiveEpisode(null);
                            setResolvedStreamUrl('');
                          }}
                        >
                          {season.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Episodes Checklist */}
                {selectedSeason && episodes.length > 0 && (
                  <div style={{ marginTop: '25px' }}>
                    <h4 style={subTitleStyle}>Episodes</h4>
                    <div style={episodesListStyle}>
                      {episodes.map(ep => (
                        <div
                          key={ep.id}
                          style={{
                            ...episodeItemStyle,
                            borderColor: activeEpisode?.id === ep.id ? 'var(--accent-primary)' : 'var(--border-glass)',
                            background: activeEpisode?.id === ep.id ? 'rgba(0, 240, 255, 0.02)' : 'transparent'
                          }}
                          onClick={() => handlePlayEpisode(ep)}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <span style={{ fontWeight: '500', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                              EP {ep.episodeNumber}. {ep.name}
                            </span>
                            <button 
                              className="btn-primary" 
                              style={epPlayButtonStyle}
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePlayEpisode(ep);
                              }}
                            >
                              Play
                            </button>
                          </div>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '6px' }}>{ep.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedSeason && episodes.length === 0 && !loadingEpisodes && (
                  <p style={{ color: 'var(--text-muted)', marginTop: '20px', fontSize: '0.9rem' }}>
                    No episodes found for this season.
                  </p>
                )}

                {loadingEpisodes && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px' }}>
                    <div className="spinner" />
                    <p style={{ marginTop: '10px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Loading episodes...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Theater Mode Video Overlay */}
      {showTheaterMode && activeSeries && activeEpisode && (
        <div style={theaterOverlayStyle}>
          <div style={theaterHeaderStyle}>
            <button 
              className="btn-secondary"
              style={theaterCloseButtonStyle} 
              onClick={() => {
                setShowTheaterMode(false);
                setActiveEpisode(null);
                setResolvedStreamUrl('');
              }}
            >
              ✕ Back to Series
            </button>
            <span style={{ fontSize: '1.2rem', fontWeight: 'bold', fontFamily: 'var(--font-title)', color: '#fff' }}>
              Theater Mode • {activeSeries.name} — {seasonsList.find(s => s.id === selectedSeason)?.name || `Season ${selectedSeason}`} Ep {activeEpisode.episodeNumber}: {activeEpisode.name}
            </span>
          </div>
          <div style={theaterPlayerStyle}>
            {resolvingLink ? (
              <div style={theaterPlaceholderStyle}>
                <div className="spinner" style={{ width: '40px', height: '40px', borderWidth: '3px' }} />
                <p style={{ marginTop: '15px', color: 'var(--text-secondary)' }}>Preparing stream link...</p>
              </div>
            ) : resolvedStreamUrl ? (
              <VideoPlayer
                streamUrl={resolvedStreamUrl}
                title={`${activeSeries.name} - Ep ${activeEpisode.episodeNumber}: ${activeEpisode.name}`}
                mac={connection.mac}
                streamId={activeEpisode.id}
                token={connection.token}
                portalUrl={connection.portalUrl}
                isLive={false}
                onNextEpisode={
                  episodes.findIndex(e => e.id === activeEpisode.id) < episodes.length - 1 
                  ? handleNextEpisode 
                  : null
                }
                onPrevEpisode={
                  episodes.findIndex(e => e.id === activeEpisode.id) > 0
                  ? handlePrevEpisode
                  : null
                }
              />
            ) : (
              <div style={theaterPlaceholderStyle}>
                <p style={{ color: '#ff4b4b', fontWeight: 'bold' }}>Playback error. Unable to load stream.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// INLINE STYLES
// -------------------------------------------------------------
const theaterOverlayStyle = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: '#050508',
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column'
};

const theaterHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '24px',
  padding: '16px 24px',
  backgroundColor: 'rgba(10, 11, 16, 0.95)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
};

const theaterCloseButtonStyle = {
  padding: '8px 16px',
  backgroundColor: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '0.85rem'
};

const theaterPlayerStyle = {
  flex: 1,
  width: '100vw',
  height: 'calc(100vh - 74px)',
  backgroundColor: '#000',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center'
};

const theaterPlaceholderStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-secondary)',
  height: '100%',
  width: '100%'
};

const containerStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
  height: '100%'
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingBottom: '10px',
  borderBottom: '1px solid var(--border-glass)',
  flexShrink: 0
};

const layoutGridStyle = {
  display: 'grid',
  gridTemplateColumns: '240px 1fr',
  gap: '24px',
  flex: 1,
  height: 'calc(100vh - 180px)',
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
  marginBottom: '16px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px'
};

const sidebarListStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
};

const catButtonStyle = {
  width: '100%',
  padding: '12px 16px',
  textAlign: 'left',
  border: '1px solid transparent',
  borderRadius: '8px',
  fontSize: '0.9rem',
  cursor: 'pointer',
  transition: 'var(--transition-smooth)'
};

const contentStyle = {
  overflowY: 'auto',
  height: '100%',
  paddingBottom: '30px'
};

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: '20px'
};

const seriesCardStyle = {
  overflow: 'hidden',
  height: '250px',
  position: 'relative'
};

const posterStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'cover'
};

const movieOverlayStyle = {
  position: 'absolute',
  bottom: 0, left: 0, right: 0,
  background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.3) 70%, transparent 100%)',
  padding: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px'
};

const seriesTitleStyle = {
  fontSize: '0.9rem',
  fontWeight: '600',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  color: 'var(--text-primary)'
};

const modalOverlayStyle = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(5, 5, 8, 0.85)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
  padding: '20px'
};

const modalCardStyle = {
  width: '100%',
  maxWidth: '900px',
  position: 'relative',
  padding: '40px',
  maxHeight: '90vh',
  overflowY: 'auto'
};

const closeButtonStyle = {
  position: 'absolute',
  top: '20px',
  right: '20px',
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  fontSize: '1.2rem',
  cursor: 'pointer',
  transition: 'color 0.2s'
};

const modalContentGridStyle = {
  display: 'grid',
  gridTemplateColumns: '300px 1fr',
  gap: '30px',
  alignItems: 'start'
};

const modalMediaStyle = {
  width: '100%',
  borderRadius: '12px',
  overflow: 'hidden',
  aspectRatio: '2/3',
  backgroundColor: 'rgba(0,0,0,0.3)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center'
};

const modalPosterStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'cover'
};

const infoColStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  maxHeight: '75vh',
  overflowY: 'auto',
  paddingRight: '15px'
};

const descriptionStyle = {
  fontSize: '0.9rem',
  lineHeight: '1.6',
  color: 'var(--text-secondary)'
};

const subTitleStyle = {
  fontFamily: 'var(--font-title)',
  fontSize: '1rem',
  marginBottom: '10px',
  color: 'var(--text-primary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px'
};

const seasonTabsStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap'
};

const seasonTabButtonStyle = {
  padding: '8px 16px',
  border: '1px solid',
  borderRadius: '6px',
  fontSize: '0.85rem',
  cursor: 'pointer',
  fontWeight: '500',
  transition: 'var(--transition-smooth)'
};

const episodesListStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px'
};

const episodeItemStyle = {
  padding: '14px',
  border: '1px solid',
  borderRadius: '8px',
  cursor: 'pointer',
  transition: 'var(--transition-smooth)'
};

const epPlayButtonStyle = {
  padding: '4px 12px',
  fontSize: '0.75rem',
  borderRadius: '4px'
};

const loadingContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '300px'
};

const infoBoxStyle = {
  textAlign: 'center',
  padding: '60px',
  color: 'var(--text-muted)'
};
