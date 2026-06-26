import React, { useEffect, useState, useRef } from 'react';
import VideoPlayer from './VideoPlayer';
import * as ReactWindow from 'react-window';
const Grid = ReactWindow.FixedSizeGrid;
import * as AutoSizerModule from 'react-virtualized-auto-sizer';
const AutoSizer = AutoSizerModule.default || AutoSizerModule.AutoSizer || AutoSizerModule;

export default function MoviesTab({ connection, globalPlayItem, clearGlobalPlayItem }) {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [movies, setMovies] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [catSearchQuery, setCatSearchQuery] = useState('');
  const [activeMovie, setActiveMovie] = useState(null);
  const [resolvedStreamUrl, setResolvedStreamUrl] = useState('');

  // Handle global play item
  useEffect(() => {
    if (globalPlayItem && globalPlayItem.type === 'vod' && globalPlayItem.item) {
      handleSelectMovie(globalPlayItem.item);
      clearGlobalPlayItem();
    }
  }, [globalPlayItem]);
  
  // Favorites state
  const [favorites, setFavorites] = useState([]);

  // Pagination and Theater Mode state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showTheaterMode, setShowTheaterMode] = useState(false);
  const sentinelRef = React.useRef(null);
  const scrollContainerRef = React.useRef(null);
  const isFetchingRef = React.useRef(false);

  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingMovies, setLoadingMovies] = useState(false);
  const [resolvingLink, setResolvingLink] = useState(false);
  const [playingMovie, setPlayingMovie] = useState(null);
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

  // Fetch Categories
  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch(`/api/vod/categories?mac=${encodeURIComponent(connection.mac)}`);
        const data = await res.json();
        
        const rawCats = data.js || [];
        setCategories([
          { id: 'all', title: 'All Movies' },
          { id: 'favorites', title: '★ Favorites' },
          ...rawCats
        ]);
      } catch (err) {
        console.error('Failed to load VOD categories:', err);
      } finally {
        setLoadingCats(false);
      }
    }
    fetchCategories();
  }, [connection]);

  // Reset page when category changes
  useEffect(() => {
    setMovies([]);
    setPage(1);
    setHasMore(true);
  }, [selectedCategory]);

  // Fetch Movies
  useEffect(() => {
    let active = true;
    async function fetchMovies() {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      if (page === 1) {
        setLoadingMovies(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      try {
        const catQuery = (selectedCategory === 'all' || selectedCategory === 'favorites') ? '0' : selectedCategory;
        const res = await fetch(`/api/vod/movies?mac=${encodeURIComponent(connection.mac)}&category=${encodeURIComponent(catQuery)}&page=${page}`);
        const data = await res.json();

        if (!active) return;

        const rawMovies = data.js?.data || data.js || [];
        const items = Array.isArray(rawMovies) ? rawMovies : [];
        
        const normalized = items.map(m => {
          const portalBase = (connection.portalUrl || '').replace(/\/c\/$/, '').replace(/\/$/, '');
          const imgUrl = m.screenshot_uri || m.poster || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&h=600&fit=crop';
          const resolvedImg = imgUrl.startsWith('http') ? imgUrl : `${portalBase}/${imgUrl.replace(/^\//, '')}`;
          
          return {
            id: m.id,
            name: m.name || m.title || 'Untitled Movie',
            category_id: m.category_id,
            screenshot_uri: resolvedImg,
            cmd: m.cmd || m.link || '',
            director: m.director || 'N/A',
            year: m.year || 'N/A',
            rating: m.rating || m.rating_imdb || 'N/A',
            description: m.description || m.plot || 'No synopsis available.'
          };
        });
        
        if (page === 1) {
          setMovies(normalized);
        } else {
          setMovies(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const uniqueNew = normalized.filter(n => !existingIds.has(n.id));
            return [...prev, ...uniqueNew];
          });
        }

        if (normalized.length < 14) {
          setHasMore(false);
        }
      } catch (err) {
        console.error('Failed to fetch movies:', err);
        if (page === 1) {
          setError('Failed to load movies. Ensure connection is active.');
        } else {
          setHasMore(false);
        }
      } finally {
        isFetchingRef.current = false;
        if (active) {
          setLoadingMovies(false);
          setLoadingMore(false);
        }
      }
    }
    fetchMovies();

    return () => {
      active = false;
    };
  }, [connection, selectedCategory, page]);

  // Intersection observer for infinite scroll is replaced by Grid's onItemsRendered or custom scrolling,
  // but to keep it simple with grid and existing sentinel logic, we can still use sentinel if AutoSizer allows.
  // Actually, since Grid handles its own scroll, we should hook into Grid's onItemsRendered.

  // Handle movie selection for details modal
  const handleSelectMovie = async (movie) => {
    setActiveMovie(movie);
  };

  const handlePlayMovie = async (movie) => {
    setPlayingMovie(movie);
    setShowTheaterMode(true);
    setResolvedStreamUrl('');
    setResolvingLink(true);
    setError(null);

    try {
      const res = await fetch('/api/create_link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mac: connection.mac,
          cmd: movie.cmd,
          type: 'vod'
        })
      });

      const data = await res.json();
      let playUrl = data.js?.cmd || data.js || '';

      if (!playUrl) {
        throw new Error('Server returned empty VOD playback link');
      }

      if (connection.isMock && data.js?.realUrl) {
        setResolvedStreamUrl(data.js.realUrl);
      } else {
        setResolvedStreamUrl(playUrl);
      }
    } catch (err) {
      console.error(err);
      setError(`Failed to resolve playback for: ${movie.name}`);
    } finally {
      setResolvingLink(false);
    }
  };

  // Filter categories by sidebar search query
  const filteredCategories = categories.filter(cat => 
    cat.title?.toLowerCase().includes(catSearchQuery.toLowerCase()) || cat.id === 'all' || cat.id === 'favorites'
  );

  const filteredMovies = movies.filter(m => {
    if (selectedCategory === 'favorites' && !favorites.includes(m.id)) {
      return false;
    }
    return m.name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div style={containerStyle}>
      {/* Tab Header */}
      <div style={headerStyle}>
        <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1.5rem' }}>Video On Demand</h2>
        <input
          type="text"
          className="input-field"
          style={{ maxWidth: '300px' }}
          placeholder="Search movies..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div style={layoutGridStyle}>
        {/* Sidebar Categories */}
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

        {/* Movies Grid */}
        <div style={contentStyle}>
          {loadingMovies && page === 1 ? (
            <div style={loadingContainerStyle}>
              <div className="spinner" style={{ width: '40px', height: '40px' }} />
              <p style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>Loading movies...</p>
            </div>
          ) : filteredMovies.length === 0 ? (
            <div style={infoBoxStyle}>
              <p style={{ color: 'var(--text-muted)' }}>
                {selectedCategory === 'favorites' 
                  ? 'No movies saved to Favorites yet. Click the star on any movie to add it!' 
                  : 'No movies found in this category.'}
              </p>
            </div>
          ) : (
            <div style={{ flex: 1, width: '100%', height: '100%' }}>
              <AutoSizer>
                {({ height, width }) => {
                  const COLUMN_WIDTH = 180 + 15; // card + gap
                  const ROW_HEIGHT = 280 + 15;
                  const columnCount = Math.max(1, Math.floor(width / COLUMN_WIDTH));
                  const rowCount = Math.ceil(filteredMovies.length / columnCount) + (hasMore ? 1 : 0); // extra row for spinner
                  
                  return (
                    <Grid
                      columnCount={columnCount}
                      columnWidth={COLUMN_WIDTH}
                      height={height}
                      rowCount={rowCount}
                      rowHeight={ROW_HEIGHT}
                      width={width}
                      onItemsRendered={({ visibleRowStopIndex }) => {
                        if (hasMore && !loadingMore && visibleRowStopIndex >= rowCount - 2) {
                          setPage(prev => prev + 1);
                        }
                      }}
                    >
                      {({ columnIndex, rowIndex, style }) => {
                        const index = rowIndex * columnCount + columnIndex;
                        
                        if (hasMore && rowIndex === rowCount - 1) {
                          if (columnIndex === 0) {
                            return (
                              <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', width: width }}>
                                <div className="spinner" style={{ width: '30px', height: '30px' }} />
                              </div>
                            );
                          }
                          return null;
                        }

                        if (index >= filteredMovies.length) return null;
                        
                        const movie = filteredMovies[index];
                        const isFav = favorites.includes(movie.id);

                        return (
                          <div style={{ ...style, padding: '7.5px' }}>
                            <div 
                              className="glass-panel-interactive"
                              style={{ ...movieCardStyle, position: 'relative', width: '100%', height: '100%', margin: 0 }}
                              onClick={() => handleSelectMovie(movie)}
                            >
                              {/* Floating Star Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavorite(movie.id);
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

                              <img src={movie.screenshot_uri} alt={movie.name} style={posterStyle} />
                              <div style={movieOverlayStyle}>
                                <span style={yearTagStyle}>{movie.year}</span>
                                <h4 style={movieTitleStyle}>{movie.name}</h4>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    </Grid>
                  );
                }}
              </AutoSizer>
            </div>
          )}
        </div>
      </div>

      {/* Movie Details Modal */}
      {activeMovie && (
        <div style={modalOverlayStyle}>
          <div 
            className="glass-panel" 
            style={{ 
              ...modalCardStyle, 
              backgroundImage: 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          >
            <button style={closeButtonStyle} onClick={() => {
              setActiveMovie(null);
              setPlayingMovie(null);
              setResolvedStreamUrl('');
            }}>✕</button>

            <div style={modalContentGridStyle}>
              {/* Left Column: Image Poster */}
              <div style={modalMediaStyle}>
                <img src={activeMovie.screenshot_uri} alt={activeMovie.name} style={modalPosterStyle} />
              </div>

              {/* Right Column: Info */}
              <div style={modalDetailsStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1.8rem', color: 'var(--text-primary)', margin: 0 }}>
                    {activeMovie.name}
                  </h2>
                  <button
                    onClick={() => toggleFavorite(activeMovie.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: favorites.includes(activeMovie.id) ? '#ffcc00' : 'rgba(255,255,255,0.3)',
                      fontSize: '1.5rem',
                      cursor: 'pointer',
                      textShadow: favorites.includes(activeMovie.id) ? '0 0 8px rgba(255,204,0,0.6)' : 'none',
                      transition: 'color 0.2s',
                      padding: 0
                    }}
                    title={favorites.includes(activeMovie.id) ? 'Remove from Favorites' : 'Add to Favorites'}
                  >
                    ★
                  </button>
                </div>
                
                <div style={metaContainerStyle}>
                  <span style={{...metaItemStyle, color: '#f5c518', fontWeight: 'bold'}}>
                    ★ {activeMovie.rating}
                  </span>
                  <span style={metaItemStyle}>{activeMovie.year}</span>
                  <span style={metaItemStyle}>Dir: {activeMovie.director}</span>
                </div>

                <p style={descriptionStyle}>{activeMovie.description}</p>

                <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
                  <button 
                    className="btn-primary" 
                    style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px' }}
                    onClick={() => handlePlayMovie(activeMovie)}
                  >
                    <span style={{ fontSize: '1.1rem' }}>▶</span> WATCH NOW
                  </button>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Theater Mode Video Overlay */}
      {showTheaterMode && activeMovie && (
        <div style={theaterOverlayStyle}>
          <div style={theaterHeaderStyle}>
            <button 
              className="btn-secondary"
              style={theaterCloseButtonStyle} 
              onClick={() => {
                setShowTheaterMode(false);
                setPlayingMovie(null);
                setResolvedStreamUrl('');
              }}
            >
              ✕ Back to Details
            </button>
            <span style={{ fontSize: '1.2rem', fontWeight: 'bold', fontFamily: 'var(--font-title)', color: '#fff' }}>
              Theater Mode • {activeMovie.name}
            </span>
          </div>
          <div style={theaterPlayerStyle}>
            {resolvingLink ? (
              <div style={theaterPlaceholderStyle}>
                <div className="spinner" style={{ width: '40px', height: '40px', borderWidth: '3px' }} />
                <p style={{ marginTop: '15px', color: 'var(--text-secondary)' }}>Preparing video player...</p>
              </div>
            ) : resolvedStreamUrl ? (
              <VideoPlayer
                streamUrl={resolvedStreamUrl}
                title={activeMovie.name}
                mac={connection.mac}
                streamId={activeMovie.id}
                token={connection.token}
                portalUrl={connection.portalUrl}
                isLive={false}
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

const movieCardStyle = {
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

const yearTagStyle = {
  fontSize: '0.7rem',
  color: 'var(--accent-primary)',
  fontWeight: 'bold'
};

const movieTitleStyle = {
  fontSize: '0.85rem',
  fontWeight: '500',
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
  gridTemplateColumns: '400px 1fr',
  gap: '30px',
  alignItems: 'start'
};

const modalMediaStyle = {
  width: '100%',
  borderRadius: '12px',
  overflow: 'hidden',
  aspectRatio: '16/9',
  backgroundColor: 'rgba(0,0,0,0.3)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center'
};

const modalPosterStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'contain'
};

const modalDetailsStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px'
};

const metaContainerStyle = {
  display: 'flex',
  gap: '16px',
  fontSize: '0.85rem',
  color: 'var(--accent-primary)',
  fontWeight: '600'
};

const metaItemStyle = {
  background: 'rgba(0, 240, 255, 0.05)',
  padding: '4px 10px',
  borderRadius: '4px',
  border: '1px solid rgba(0, 240, 255, 0.15)'
};

const descriptionStyle = {
  fontSize: '0.95rem',
  lineHeight: '1.6',
  color: 'var(--text-secondary)'
};

const playerPlaceholderStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '225px',
  background: '#000',
  width: '100%'
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
