import React, { useState, useEffect, useRef } from 'react';
import { getTMDBImageUrl } from '../utils/tmdb';

export default function GlobalSearch({ connection, onPlayChannel, onPlayMovie, onPlaySeries }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState({ channels: [], movies: [], series: [] });
  const [loading, setLoading] = useState(false);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = async (searchTerm) => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      setResults({ channels: [], movies: [], series: [] });
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const pChannels = fetch(`/api/channels?mac=${encodeURIComponent(connection.mac)}&search=${encodeURIComponent(searchTerm)}`).then(r => r.json());
      const pMovies = fetch(`/api/vod/movies?mac=${encodeURIComponent(connection.mac)}&search=${encodeURIComponent(searchTerm)}`).then(r => r.json());
      const pSeries = fetch(`/api/series/list?mac=${encodeURIComponent(connection.mac)}&search=${encodeURIComponent(searchTerm)}`).then(r => r.json());
      
      const [channelsRes, moviesRes, seriesRes] = await Promise.all([pChannels, pMovies, pSeries]);
      
      const cData = Array.isArray(channelsRes.js?.data) ? channelsRes.js.data : (Array.isArray(channelsRes.js) ? channelsRes.js : []);
      const mData = Array.isArray(moviesRes.js?.data) ? moviesRes.js.data : (Array.isArray(moviesRes.js) ? moviesRes.js : []);
      const sData = Array.isArray(seriesRes.js?.data) ? seriesRes.js.data : (Array.isArray(seriesRes.js) ? seriesRes.js : []);

      setResults({
        channels: cData.slice(0, 5).map(c => ({ ...c, type: 'live', name: c.name, img: c.logo })),
        movies: mData.slice(0, 5).map(m => ({ ...m, type: 'vod', name: m.name, img: m.screenshot_uri || m.poster, cmd: m.cmd })),
        series: sData.slice(0, 5).map(s => ({ ...s, type: 'series', name: s.name, img: s.screenshot_uri || s.poster }))
      });
      setIsOpen(true);
    } catch (err) {
      console.error('Global search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setIsOpen(true);
    
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSearch(val);
    }, 500);
  };

  return (
    <div style={containerStyle} ref={searchRef}>
      <div style={inputWrapperStyle}>
        <svg style={iconStyle} viewBox="0 0 24 24">
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <input 
          type="text" 
          value={query} 
          onChange={handleInputChange} 
          onFocus={() => { if(query.trim().length >= 2) setIsOpen(true); }}
          placeholder="Search movies, series, channels..." 
          style={inputStyle} 
        />
        {loading && <div className="spinner" style={{ width: '16px', height: '16px', right: '15px', position: 'absolute' }} />}
      </div>

      {isOpen && query.trim().length >= 2 && (
        <div className="glass-panel" style={dropdownStyle}>
          {results.channels.length === 0 && results.movies.length === 0 && results.series.length === 0 && !loading && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No results found</div>
          )}
          
          {results.channels.length > 0 && (
            <div style={sectionStyle}>
              <h4 style={sectionTitleStyle}>Live TV Channels</h4>
              {results.channels.map(c => (
                <div key={`live-${c.id}`} style={itemStyle} onClick={() => { setIsOpen(false); onPlayChannel(c); }}>
                  <img src={c.img || 'https://via.placeholder.com/40x40?text=TV'} alt={c.name} style={imgStyle} />
                  <span>{c.name}</span>
                </div>
              ))}
            </div>
          )}

          {results.movies.length > 0 && (
            <div style={sectionStyle}>
              <h4 style={sectionTitleStyle}>Movies</h4>
              {results.movies.map(m => (
                <div key={`vod-${m.id}`} style={itemStyle} onClick={() => { setIsOpen(false); onPlayMovie(m); }}>
                  <img src={m.img || 'https://via.placeholder.com/40x60?text=M'} alt={m.name} style={{...imgStyle, height: '45px', width: '30px', borderRadius: '4px'}} />
                  <span>{m.name}</span>
                </div>
              ))}
            </div>
          )}

          {results.series.length > 0 && (
            <div style={sectionStyle}>
              <h4 style={sectionTitleStyle}>TV Series</h4>
              {results.series.map(s => (
                <div key={`series-${s.id}`} style={itemStyle} onClick={() => { setIsOpen(false); onPlaySeries(s); }}>
                  <img src={s.img || 'https://via.placeholder.com/40x60?text=S'} alt={s.name} style={{...imgStyle, height: '45px', width: '30px', borderRadius: '4px'}} />
                  <span>{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const containerStyle = {
  position: 'relative',
  width: '100%',
  maxWidth: '400px',
  zIndex: 1000
};

const inputWrapperStyle = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  width: '100%'
};

const iconStyle = {
  position: 'absolute',
  left: '12px',
  width: '20px',
  height: '20px',
  fill: 'var(--text-secondary)'
};

const inputStyle = {
  width: '100%',
  padding: '12px 40px 12px 40px',
  borderRadius: '20px',
  border: '1px solid var(--border-glass)',
  background: 'rgba(20, 20, 25, 0.6)',
  color: 'var(--text-primary)',
  fontSize: '0.95rem',
  outline: 'none',
  transition: 'border 0.2s',
  backdropFilter: 'blur(10px)'
};

const dropdownStyle = {
  position: 'absolute',
  top: 'calc(100% + 10px)',
  left: 0,
  right: 0,
  maxHeight: '400px',
  overflowY: 'auto',
  borderRadius: '12px',
  padding: '10px 0',
  boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
  border: '1px solid var(--border-glass)',
  background: 'rgba(15, 15, 20, 0.95)',
};

const sectionStyle = {
  marginBottom: '10px'
};

const sectionTitleStyle = {
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  color: 'var(--accent-primary)',
  margin: '0 15px 5px',
  letterSpacing: '1px'
};

const itemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '8px 15px',
  cursor: 'pointer',
  transition: 'background 0.2s',
  color: 'var(--text-primary)',
  fontSize: '0.9rem'
};

const imgStyle = {
  width: '30px',
  height: '30px',
  borderRadius: '50%',
  objectFit: 'cover'
};
