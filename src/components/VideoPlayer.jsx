import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';

export default function VideoPlayer({ 
  streamUrl, 
  title, 
  mac, 
  streamId, 
  token, 
  portalUrl,
  isLive = true,
  onNextEpisode,
  onPrevEpisode,
  episodesList = [],
  activeEpisodeId = null,
  onEpisodeSelect,
  seriesInfo = null,
  channelsList = [],
  activeChannelId = null,
  onChannelSelect
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showStreamInfo, setShowStreamInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoPlay, setAutoPlay] = useState(() => {
    const saved = localStorage.getItem('helix_iptv_autoplay');
    return saved !== null ? saved === 'true' : true;
  });

  // HLS Tracks
  const [audioTracks, setAudioTracks] = useState([]);
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [activeAudio, setActiveAudio] = useState(-1);
  const [activeSubtitle, setActiveSubtitle] = useState(-1);
  
  // Phase 2 states
  const [playbackRate, setPlaybackRate] = useState(1);
  const [hlsLevels, setHlsLevels] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  
  // Drawer States
  const [showEpisodesDrawer, setShowEpisodesDrawer] = useState(false);
  
  // Timeline tracking states
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Phase 4 states
  const [resumeToast, setResumeToast] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  
  // Track player instances for cleanup
  const hlsRef = useRef(null);
  const mpegtsRef = useRef(null);
  const controlsTimeoutRef = useRef(null);

  // Parse and construct the structured URL requested by the user:
  // e.g. http://procdnnet.eu:80/play/live.php?mac=00:1A:79:7D:CD:70&stream=1294764&extension=ts&play_token=SiLuLzo3o5
  const getStructuredUrl = () => {
    if (!streamUrl) return '';
    if (streamUrl.includes('play/live.php')) return streamUrl;
    
    try {
      const hostUrl = new URL(streamUrl);
      const host = hostUrl.host;
      const cleanMac = mac || '00:1A:79:7D:CD:70';
      const cleanStreamId = streamId || '1294764';
      const cleanToken = token || 'SiLuLzo3o5';
      const ext = streamUrl.includes('m3u8') ? 'm3u8' : 'ts';
      return `${hostUrl.protocol}//${host}/play/live.php?mac=${cleanMac}&stream=${cleanStreamId}&extension=${ext}&play_token=${cleanToken}`;
    } catch (e) {
      return `http://procdnnet.eu:80/play/live.php?mac=${mac || '00:1A:79:7D:CD:70'}&stream=${streamId || '1294764'}&extension=ts&play_token=${token || 'SiLuLzo3o5'}`;
    }
  };

  const structuredUrl = getStructuredUrl();

  const nextEpRef = useRef(onNextEpisode);
  useEffect(() => {
    nextEpRef.current = onNextEpisode;
  }, [onNextEpisode]);

  // Load and play the stream
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    setError(null);
    setLoading(true);
    setIsPlaying(false);

    // Clean up previous instances first
    cleanupPlayers();

    // Time and duration tracking listeners
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      
      // Save VOD progress
      if (!isLive && streamId && video.duration > 0) {
        const ratio = video.currentTime / video.duration;
        if (ratio < 0.95 && video.currentTime > 5) {
          const savedProgress = localStorage.getItem('helix_iptv_progress') || '{}';
          try {
            const progressObj = JSON.parse(savedProgress);
            progressObj[streamId] = {
              time: video.currentTime,
              updatedAt: Date.now(),
              ...(seriesInfo || {})
            };
            localStorage.setItem('helix_iptv_progress', JSON.stringify(progressObj));
          } catch (e) {}
        } else if (ratio >= 0.95 || video.currentTime <= 5) {
          const savedProgress = localStorage.getItem('helix_iptv_progress') || '{}';
          try {
            const progressObj = JSON.parse(savedProgress);
            delete progressObj[streamId];
            localStorage.setItem('helix_iptv_progress', JSON.stringify(progressObj));
          } catch (e) {}
        }
      }
    };

    const handleDurationChange = () => {
      setDuration(video.duration || 0);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);

      // Auto-resume VOD progress
      if (!isLive && streamId) {
        const savedProgress = localStorage.getItem('helix_iptv_progress');
        if (savedProgress) {
          try {
            const progressObj = JSON.parse(savedProgress);
            const savedData = progressObj[streamId];
            const savedTime = typeof savedData === 'object' ? savedData.time : savedData;
            
            if (savedTime && savedTime > 5 && savedTime < video.duration - 5) {
              console.log(`Auto-resuming progress for stream ${streamId} at ${savedTime}s`);
              video.currentTime = savedTime;
              setCurrentTime(savedTime);
              setResumeToast(`Resumed from ${formatTime(savedTime)}`);
              setTimeout(() => setResumeToast(''), 4000);
            }
          } catch (e) {
            console.error('Failed to restore progress:', e);
          }
        }
      }
    };

    const handleEnded = () => {
      if (!isLive && nextEpRef.current && autoPlay) {
        nextEpRef.current();
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('ended', handleEnded);

    // Determine the source URL
    const isHttps = window.location.protocol === 'https:';
    const isStreamHttp = streamUrl.startsWith('http:');
    let playSource = streamUrl;
    
    if ((isHttps && isStreamHttp) || streamUrl.includes('procdnnet.eu') || streamUrl.includes('play/live.php')) {
      playSource = `${window.location.origin}/api/stream-proxy?url=${encodeURIComponent(streamUrl)}&mac=${encodeURIComponent(mac || '')}`;
    }

    console.log(`Playing stream: ${streamUrl} via source: ${playSource}`);

    // Select suitable streaming player engine
    if (streamUrl.includes('.m3u8') || streamUrl.includes('extension=m3u8')) {
      // Play HLS
      if (Hls.isSupported()) {
        const hls = new Hls({
          maxMaxBufferLength: 10,
          enableWorker: true
        });
        hlsRef.current = hls;
        hls.loadSource(playSource);
        hls.attachMedia(video);
        
        hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
          setLoading(false);
          setAudioTracks(hls.audioTracks || []);
          setSubtitleTracks(hls.subtitleTracks || []);
          setHlsLevels(data.levels || []);
          setActiveAudio(hls.audioTrack);
          setActiveSubtitle(hls.subtitleTrack);
          setCurrentLevel(hls.currentLevel);
          video.play().catch(handlePlayError);
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (e, data) => setCurrentLevel(data.level));
        hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (e, data) => setActiveAudio(data.id));
        hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (e, data) => setActiveSubtitle(data.id));

        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('HLS error:', data);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                const code = data.response?.code;
                if (code === 403) {
                  setError('Failed to fetch stream: Geo-blocked or blocked by your Internet Service Provider (ISP).');
                  setLoading(false);
                } else if (code === 456) {
                  setError('Failed to fetch stream (Error 456): Subscription limit exceeded, invalid play token, or MAC address blocked.');
                  setLoading(false);
                } else if (code === 429) {
                  setError('Failed to fetch stream (Error 429): Too many concurrent requests on portal. Please retry.');
                  setLoading(false);
                } else if (code && code > 0) {
                  setError(`Failed to fetch video stream. Portal returned HTTP ${code}.`);
                  setLoading(false);
                } else {
                  hls.startLoad();
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                setError('Playback failed. Please try reconnecting.');
                setLoading(false);
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playSource;
        video.addEventListener('loadedmetadata', () => {
          setLoading(false);
          video.play().catch(handlePlayError);
        });
      } else {
        setError('HLS playback is not supported in this browser.');
        setLoading(false);
      }
    } else if (streamUrl.includes('.ts') || streamUrl.includes('extension=ts') || streamUrl.includes('live.php')) {
      // Play MPEG-TS using mpegts.js
      if (mpegts.isSupported()) {
        try {
          const mpegPlayer = mpegts.createPlayer({
            type: 'mpegts',
            url: playSource,
            isLive: isLive,
            hasAudio: true,
            hasVideo: true
          }, {
            enableWorker: true,
            enableStashBuffer: true,
            stashInitialSize: isLive ? 1024 * 384 : 1024 * 1024,
            liveBufferLatencyChasing: false,
            liveSyncDuration: isLive ? 4.0 : 3.0,
            lazyLoadMaxKeepAliveDuration: 15
          });
          
          mpegtsRef.current = mpegPlayer;
          mpegPlayer.attachMediaElement(video);
          mpegPlayer.load();
          
          setLoading(false);
          mpegPlayer.play().catch(handlePlayError);

          mpegPlayer.on(mpegts.Events.ERROR, (type, detail, info) => {
            console.error('Mpegts Player Error:', type, detail, info);
            if (type === mpegts.ErrorTypes.NETWORK_ERROR) {
              const code = info?.code;
              if (code === 403) {
                setError('Failed to fetch stream: Geo-blocked or blocked by your Internet Service Provider (ISP).');
              } else if (code === 456) {
                setError('Failed to fetch stream (Error 456): Subscription limit exceeded, invalid play token, or MAC address blocked.');
              } else if (code === 429) {
                setError('Failed to fetch stream (Error 429): Too many concurrent requests on portal. Please retry.');
              } else if (code && code > 0) {
                setError(`Failed to fetch video stream. Portal returned HTTP ${code}.`);
              } else {
                setError('Failed to fetch video stream. Check connection.');
              }
            }
          });
        } catch (e) {
          setError(`Failed to initialize MPEG-TS player: ${e.message}`);
          setLoading(false);
        }
      } else {
        setError('MPEG-TS (.ts) streaming is not supported by your browser.');
        setLoading(false);
      }
    } else {
      video.src = playSource;
      video.load();
      video.play()
        .then(() => setLoading(false))
        .catch(handlePlayError);
    }

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('ended', handleEnded);
      cleanupPlayers();
    };
  }, [streamUrl]);

  const handlePlayError = (err) => {
    console.warn('Playback play request was interrupted:', err.message);
    setLoading(false);
  };

  const cleanupPlayers = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (mpegtsRef.current) {
      mpegtsRef.current.destroy();
      mpegtsRef.current = null;
    }
  };

  // Time scrubbing seeking helper
  const handleSeekChange = (e) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const skipTime = (amount) => {
    const video = videoRef.current;
    if (!video) return;
    
    let newTime = video.currentTime + amount;
    if (newTime < 0) newTime = 0;
    if (newTime > video.duration) newTime = video.duration;
    
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (secs) => {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Video control functions
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (videoRef.current) {
      videoRef.current.volume = v;
      videoRef.current.muted = v === 0;
      setIsMuted(v === 0);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      const muted = !isMuted;
      videoRef.current.muted = muted;
      setIsMuted(muted);
      if (!muted && volume === 0) {
        setVolume(0.5);
        videoRef.current.volume = 0.5;
      }
    }
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    if (!document.fullscreenElement) {
      if (container.requestFullscreen) {
        container.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
      } else if (video.webkitEnterFullscreen) {
        // iOS Safari fallback
        video.webkitEnterFullscreen();
        setIsFullscreen(true);
      } else if (video.requestFullscreen) {
        video.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
      }
    }
  };

  const togglePiP = async () => {
    try {
      if (videoRef.current !== document.pictureInPictureElement) {
        await videoRef.current?.requestPictureInPicture();
      } else {
        await document.exitPictureInPicture();
      }
    } catch (err) {
      console.error('PiP failed', err);
    }
  };

  const toggleAutoPlay = () => {
    const next = !autoPlay;
    setAutoPlay(next);
    localStorage.setItem('helix_iptv_autoplay', String(next));
  };

  const handleAudioSelect = (id) => {
    if (hlsRef.current) hlsRef.current.audioTrack = id;
    setActiveAudio(id);
  };

  const handleSubtitleSelect = (id) => {
    if (hlsRef.current) hlsRef.current.subtitleTrack = id;
    setActiveSubtitle(id);
  };

  const handleLevelSelect = (level) => {
    if (hlsRef.current) hlsRef.current.currentLevel = level;
    setCurrentLevel(level);
  };

  const changePlaybackRate = (rate) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  // Phase 2: Cast & AirPlay
  const handleAirPlay = () => {
    if (videoRef.current && videoRef.current.webkitShowPlaybackTargetPicker) {
      videoRef.current.webkitShowPlaybackTargetPicker();
    } else {
      alert("AirPlay is only supported on Safari / Apple devices.");
    }
  };

  const handleChromecast = () => {
    alert("Chromecast support will be integrated once the Google Cast SDK is loaded in index.html.");
  };

  const handleChannelZap = (direction) => {
    if (!isLive || !channelsList || channelsList.length === 0 || !activeChannelId || !onChannelSelect) return;
    const currentIndex = channelsList.findIndex(c => c.id === activeChannelId);
    if (currentIndex === -1) return;
    
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = channelsList.length - 1;
    if (nextIndex >= channelsList.length) nextIndex = 0;
    
    onChannelSelect(channelsList[nextIndex]);
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopyStatus('Copied!');
    setTimeout(() => setCopyStatus(''), 2000);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  // Handle Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
        return;
      }
      
      const key = e.key.toLowerCase();
      if (key === ' ' || key === 'spacebar') {
        e.preventDefault();
        togglePlay();
      } else if (key === 'f') {
        e.preventDefault();
        toggleFullscreen();
      } else if (key === 'm') {
        e.preventDefault();
        toggleMute();
      } else if (key === 'arrowleft') {
        if (!isLive) {
          e.preventDefault();
          skipTime(-10);
        }
      } else if (key === 'arrowright') {
        if (!isLive) {
          e.preventDefault();
          skipTime(10);
        }
      } else if (key === 'arrowup') {
        e.preventDefault();
        if (isLive && channelsList.length > 0) {
          handleChannelZap(-1); // Up = Previous Channel
        } else {
          handleVolumeChange({ target: { value: Math.min(1, volume + 0.1) } });
        }
      } else if (key === 'arrowdown') {
        e.preventDefault();
        if (isLive && channelsList.length > 0) {
          handleChannelZap(1); // Down = Next Channel
        } else {
          handleVolumeChange({ target: { value: Math.max(0, volume - 0.1) } });
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPlaying, isLive, volume, channelsList, activeChannelId]);

  // Construct local stream URL for copying to external players
  const getProxyStreamUrl = () => {
    const base = window.location.origin;
    return `${base}/api/stream-proxy?url=${encodeURIComponent(streamUrl)}&mac=${encodeURIComponent(mac || '')}`;
  };

  return (
    <div 
      ref={containerRef}
      className="video-player-container glass-panel"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        aspectRatio: '16/9'
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* Video Tag */}
      <video
        ref={videoRef}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
      />

      {/* Resume Progress Toast Badge */}
      {resumeToast && (
        <div style={resumeToastStyle} className="glass-panel">
          <span style={{ fontSize: '1.1rem', marginRight: '8px' }}>⏱</span>
          <span>{resumeToast}</span>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div style={overlayStyle}>
          <div className="spinner" style={{ width: '40px', height: '40px', borderWidth: '3px' }}></div>
          <p style={{ marginTop: '15px', color: 'var(--text-secondary)' }}>Loading Stream...</p>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div style={{ ...overlayStyle, background: 'rgba(10, 11, 16, 0.95)' }}>
          <svg style={{ width: '48px', height: '48px', color: 'var(--accent-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p style={{ marginTop: '15px', color: '#ff4b4b', fontWeight: 'bold' }}>{error}</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px', maxWidth: '80%', textAlign: 'center' }}>
            Check your MAC address permissions or check if the stream link is active.
          </p>
        </div>
      )}

      {/* Skip Intro Button */}
      {!isLive && currentTime > 5 && currentTime < 180 && (
        <button 
          onClick={() => skipTime(85)}
          style={skipIntroButtonStyle}
          className="glass-panel-interactive"
        >
          Skip Intro
        </button>
      )}

      {/* Custom Video Controls */}
      {showControls && (
        <div style={controlsContainerStyle}>
          {/* Interactive Scrubbing Timeline */}
          {!isLive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '0 5px' }}>
              <span style={{ fontSize: '0.75rem', color: '#fff', minWidth: '35px' }}>{formatTime(currentTime)}</span>
              <input
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={handleSeekChange}
                style={{
                  flex: 1,
                  height: '6px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  accentColor: 'var(--accent-primary)',
                  background: 'rgba(255, 255, 255, 0.2)'
                }}
              />
              <span style={{ fontSize: '0.75rem', color: '#fff', minWidth: '35px' }}>{formatTime(duration)}</span>
            </div>
          )}

          {/* Controls Bar */}
          <div style={controlsBarStyle}>
            {/* Left Controls */}
            <div style={controlSectionStyle}>
              <button onClick={togglePlay} style={controlButtonStyle} title={isPlaying ? 'Pause' : 'Play'}>
                {isPlaying ? (
                  <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                ) : (
                  <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>

              {/* VOD seeking buttons */}
              {!isLive && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button onClick={() => skipTime(-10)} style={controlButtonStyle} title="Rewind 10s">
                    <svg style={{ width: '20px', height: '20px' }} viewBox="0 0 24 24" fill="currentColor">
                      <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
                    </svg>
                    <span style={{ fontSize: '0.65rem', color: '#ccc', marginLeft: '-2px' }}>10s</span>
                  </button>
                  <button onClick={() => skipTime(10)} style={controlButtonStyle} title="Forward 10s">
                    <svg style={{ width: '20px', height: '20px' }} viewBox="0 0 24 24" fill="currentColor">
                      <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
                    </svg>
                    <span style={{ fontSize: '0.65rem', color: '#ccc', marginLeft: '-2px' }}>10s</span>
                  </button>
                  {onPrevEpisode && (
                    <button onClick={onPrevEpisode} style={{...controlButtonStyle, marginLeft: '5px'}} title="Previous Episode">
                      <svg style={{ width: '24px', height: '24px' }} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18 6l-8.5 6 8.5 6V6zM8 6v12h-2V6h2z"/>
                      </svg>
                    </button>
                  )}
                  {onNextEpisode && (
                    <button onClick={onNextEpisode} style={{...controlButtonStyle, marginLeft: '5px'}} title="Next Episode">
                      <svg style={{ width: '24px', height: '24px' }} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                      </svg>
                    </button>
                  )}
                </div>
              )}

              {/* Volume Slider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button onClick={toggleMute} style={controlButtonStyle}>
                  {isMuted ? (
                    <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM19 12c0 2.76-1.12 5.26-2.92 7.08l1.41 1.41C19.82 18.26 21 15.27 21 12s-1.18-6.26-3.51-8.49l-1.41 1.41C17.88 6.74 19 9.24 19 12zM3 9v6h4l5 5V4L7 9H3zM16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                    </svg>
                  ) : (
                    <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                    </svg>
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={handleVolumeChange}
                  style={volumeSliderStyle}
                />
              </div>

              {/* Stream Title */}
              <span style={titleStyle}>{title || 'IPTV Stream'}</span>
            </div>

            {/* Right Controls */}
            <div style={controlSectionStyle}>
              {/* Copy Stream / VLC Button */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                {copyStatus && (
                  <span style={{ position: 'absolute', right: '40px', bottom: '100%', whiteSpace: 'nowrap', background: 'var(--accent-primary)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', marginBottom: '10px' }}>
                    {copyStatus}
                  </span>
                )}
                <button 
                  onClick={async () => {
                    const url = getProxyStreamUrl();
                    try {
                      await navigator.clipboard.writeText(url);
                      setCopyStatus('Copied! Open VLC -> Network Stream');
                      setTimeout(() => setCopyStatus(''), 4000);
                    } catch (e) {
                      setCopyStatus('Failed to copy');
                    }
                  }} 
                  style={controlButtonStyle} 
                  title="Copy stream link to play in VLC (Fixes Audio issues for unsupported codecs like AC-3)"
                >
                  <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                  </svg>
                </button>
              </div>

              {!isLive && episodesList && episodesList.length > 0 && (
                <button 
                  onClick={() => setShowEpisodesDrawer(!showEpisodesDrawer)} 
                  style={{ ...controlButtonStyle, color: showEpisodesDrawer ? 'var(--accent-primary)' : '#fff' }}
                  title="Episodes"
                >
                  <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 10h12v4H4v-4zm0-6h16v4H4V4zm0 12h8v4H4v-4z"/>
                  </svg>
                </button>
              )}

              {/* Cast & AirPlay */}
              <button onClick={handleAirPlay} style={controlButtonStyle} title="AirPlay">
                <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 22h12l-6-6zM21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4v-2H3V5h18v12h-4v2h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
                </svg>
              </button>
              <button onClick={handleChromecast} style={controlButtonStyle} title="Chromecast">
                <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
                </svg>
              </button>

              {document.pictureInPictureEnabled && (
                <button onClick={togglePiP} style={controlButtonStyle} title="Picture in Picture">
                  <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.98h18v14.03z"/>
                  </svg>
                </button>
              )}

              <button 
                onClick={() => setShowSettings(!showSettings)} 
                style={{ ...controlButtonStyle, color: showSettings ? 'var(--accent-primary)' : '#fff' }}
                title="Settings"
              >
                <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
                </svg>
              </button>

              <button 
                onClick={() => setShowStreamInfo(!showStreamInfo)} 
                style={{
                  ...controlButtonStyle, 
                  color: showStreamInfo ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  border: '1px solid var(--border-glass)',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                URL INFO
              </button>

              <button onClick={toggleFullscreen} style={controlButtonStyle}>
                {isFullscreen ? (
                  <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                  </svg>
                ) : (
                  <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Dropdown Menu */}
      {showSettings && (
        <div style={settingsMenuOverlayStyle} className="glass-panel">
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#fff' }}>Settings</h4>
          </div>
          
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {/* Auto-Play Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Auto-Play Next Episode</span>
              <label className="toggle-switch">
                <input type="checkbox" checked={autoPlay} onChange={toggleAutoPlay} />
                <span className="slider round"></span>
              </label>
            </div>

            {/* Playback Speed */}
            {!isLive && (
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px', display: 'block' }}>Playback Speed</span>
                <select 
                  value={playbackRate} 
                  onChange={(e) => changePlaybackRate(parseFloat(e.target.value))}
                  style={settingsSelectStyle}
                >
                  <option value="0.5">0.5x</option>
                  <option value="1">1.0x (Normal)</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2.0x</option>
                </select>
              </div>
            )}

            {/* Quality Selector */}
            {hlsLevels.length > 0 && (
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px', display: 'block' }}>Quality</span>
                <select 
                  value={currentLevel} 
                  onChange={(e) => handleLevelSelect(parseInt(e.target.value))}
                  style={settingsSelectStyle}
                >
                  <option value="-1">Auto</option>
                  {hlsLevels.map((lvl, index) => (
                    <option key={index} value={index}>
                      {lvl.height ? `${lvl.height}p` : `Level ${index}`} ({Math.round(lvl.bitrate / 1000)} kbps)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Audio Tracks */}
            {audioTracks.length > 1 && (
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px', display: 'block' }}>Audio Track</span>
                <select 
                  value={activeAudio} 
                  onChange={(e) => handleAudioSelect(parseInt(e.target.value))}
                  style={settingsSelectStyle}
                >
                  {audioTracks.map(t => (
                    <option key={t.id} value={t.id}>{t.name || t.language || `Track ${t.id}`}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Subtitle Tracks */}
            {subtitleTracks.length > 0 && (
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px', display: 'block' }}>Subtitles</span>
                <select 
                  value={activeSubtitle} 
                  onChange={(e) => handleSubtitleSelect(parseInt(e.target.value))}
                  style={settingsSelectStyle}
                >
                  <option value="-1">Off</option>
                  {subtitleTracks.map(t => (
                    <option key={t.id} value={t.id}>{t.name || t.language || `Subtitle ${t.id}`}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Netflix-like Next Episode Overlay */}
      {!isLive && onNextEpisode && duration > 0 && currentTime > duration - 15 && (
        <div style={nextEpisodeOverlayStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '1rem' }}>Up Next</span>
            <button className="btn-primary" onClick={() => { if(nextEpRef.current) nextEpRef.current(); }} style={{ padding: '10px 20px', fontSize: '0.9rem' }}>
              ▶ Play Next Episode
            </button>
          </div>
          {autoPlay && (
            <div style={{ height: '4px', background: 'rgba(255,255,255,0.2)', width: '100%', marginTop: '10px', borderRadius: '2px', overflow: 'hidden' }}>
               <div style={{ height: '100%', background: 'var(--accent-primary)', width: `${((currentTime - (duration - 15)) / 15) * 100}%`, transition: 'width 1s linear' }} />
            </div>
          )}
        </div>
      )}

      {/* Episodes Drawer */}
      {showEpisodesDrawer && (
        <div style={episodesDrawerStyle} className="glass-panel">
          <div style={{ padding: '15px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, color: '#fff' }}>Episodes</h4>
            <button onClick={() => setShowEpisodesDrawer(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1, padding: '10px' }}>
            {episodesList.map(ep => (
              <div 
                key={ep.id}
                onClick={() => {
                  if (onEpisodeSelect) onEpisodeSelect(ep);
                  setShowEpisodesDrawer(false);
                }}
                style={{
                  padding: '10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  marginBottom: '8px',
                  background: activeEpisodeId === ep.id ? 'rgba(0, 240, 255, 0.1)' : 'transparent',
                  border: `1px solid ${activeEpisodeId === ep.id ? 'var(--accent-primary)' : 'transparent'}`,
                  transition: 'background 0.2s'
                }}
                className="episode-drawer-item"
              >
                <div style={{ fontSize: '0.85rem', color: activeEpisodeId === ep.id ? 'var(--accent-primary)' : '#fff', fontWeight: 'bold' }}>
                  {ep.episodeNumber}. {ep.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stream Info Overlay */}
      {showStreamInfo && (
        <div style={streamInfoOverlayStyle} className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h4 style={{ fontFamily: 'var(--font-title)', color: 'var(--accent-primary)', fontSize: '0.95rem' }}>Active Stream Structure</h4>
            <button 
              onClick={() => setShowStreamInfo(false)} 
              style={{ background: 'none', border: 'none', color: '#ff4b4b', cursor: 'pointer', fontSize: '0.9rem' }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
            
            <p style={{ marginBottom: '6px', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Required Playback Link Structure:</strong>
              <button 
                onClick={() => handleCopy(structuredUrl)}
                style={copyLinkButtonStyle}
              >
                {copyStatus || 'Copy'}
              </button>
            </p>
            <code style={codeBlockStyle}>{structuredUrl}</code>
            
            <p style={{ marginTop: '10px', marginBottom: '6px', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Source Resolved Link:</strong>
              <button 
                onClick={() => handleCopy(streamUrl)}
                style={copyLinkButtonStyle}
              >
                Copy
              </button>
            </p>
            <code style={{ ...codeBlockStyle, color: 'var(--accent-secondary)' }}>{streamUrl}</code>

            {/* External Players & Proxy Link copying */}
            <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <a 
                href={`vlc://${getProxyStreamUrl()}`}
                style={externalPlayerButtonStyle}
                title="Launch VLC media player natively"
              >
                🍊 Open in VLC Player (Proxied)
              </a>
              <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: '1.2' }}>
                *Note: "Open in VLC" requires the custom 'vlc://' protocol registered on your Windows system. If it does not launch, click "Copy Proxy Stream URL" below and paste it in VLC via Media &gt; Open Network Stream.
              </p>
              <button 
                onClick={() => handleCopy(getProxyStreamUrl())}
                style={{ ...externalPlayerButtonStyle, border: '1px dashed var(--accent-primary)', background: 'none', cursor: 'pointer' }}
                title="Copy the proxy URL to paste in PotPlayer or other desktop player"
              >
                🔗 Copy Proxy Stream URL
              </button>
            </div>
            
            <table style={{ width: '100%', marginTop: '15px', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={tdLabelStyle}>MAC Address:</td>
                  <td style={tdValueStyle}>{mac || 'None'}</td>
                </tr>
                <tr>
                  <td style={tdLabelStyle}>Stream ID:</td>
                  <td style={tdValueStyle}>{streamId || 'None'}</td>
                </tr>
                <tr>
                  <td style={tdLabelStyle}>Play Token:</td>
                  <td style={tdValueStyle}>{token || 'None'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// INLINE STYLES FOR THE VIDEO PLAYER
// -------------------------------------------------------------
const overlayStyle = {
  position: 'absolute',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(10, 11, 16, 0.8)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10
};

const controlsContainerStyle = {
  position: 'absolute',
  bottom: 0, left: 0, right: 0,
  background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 70%, transparent 100%)',
  padding: '15px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  zIndex: 5
};

const controlsBarStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const controlSectionStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px'
};

const controlButtonStyle = {
  background: 'none',
  border: 'none',
  color: '#ffffff',
  cursor: 'pointer',
  padding: '5px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'color 0.2s',
  outline: 'none'
};

const iconStyle = {
  width: '24px',
  height: '24px'
};

const titleStyle = {
  color: '#ffffff',
  fontSize: '0.9rem',
  fontWeight: '500',
  marginLeft: '10px',
  maxWidth: '220px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
};

const volumeSliderStyle = {
  width: '60px',
  cursor: 'pointer',
  accentColor: 'var(--accent-primary)'
};

const streamInfoOverlayStyle = {
  position: 'absolute',
  top: '20px',
  right: '20px',
  width: '320px',
  padding: '16px',
  background: 'rgba(10, 11, 16, 0.95)',
  border: '1px solid var(--border-glass)',
  borderRadius: '12px',
  zIndex: 15,
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
};

const codeBlockStyle = {
  display: 'block',
  background: 'rgba(0,0,0,0.4)',
  padding: '8px',
  borderRadius: '6px',
  fontFamily: 'monospace',
  fontSize: '0.65rem',
  marginTop: '4px',
  border: '1px solid rgba(255,255,255,0.05)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all'
};

const tdLabelStyle = {
  padding: '4px 0',
  color: 'var(--text-muted)',
  fontSize: '0.7rem'
};

const tdValueStyle = {
  padding: '4px 0',
  color: 'var(--text-primary)',
  textAlign: 'right',
  fontSize: '0.7rem',
  fontFamily: 'monospace'
};

const nextEpisodeOverlayStyle = {
  position: 'absolute',
  bottom: '90px',
  right: '30px',
  background: 'rgba(10, 11, 16, 0.9)',
  border: '1px solid var(--border-glass)',
  borderRadius: '8px',
  padding: '16px',
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  minWidth: '200px',
  boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
};

const settingsMenuOverlayStyle = {
  position: 'absolute',
  bottom: '70px',
  right: '20px',
  background: 'rgba(15, 17, 26, 0.95)',
  border: '1px solid var(--border-glass)',
  borderRadius: '12px',
  zIndex: 15,
  minWidth: '220px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
};

const settingsSelectStyle = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: '6px',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff',
  fontSize: '0.85rem',
  cursor: 'pointer'
};

const skipIntroButtonStyle = {
  position: 'absolute',
  bottom: '90px',
  right: '30px',
  padding: '10px 20px',
  background: 'rgba(0, 0, 0, 0.6)',
  border: '1px solid var(--border-glass)',
  borderRadius: '8px',
  color: '#fff',
  fontWeight: '600',
  fontSize: '0.9rem',
  cursor: 'pointer',
  zIndex: 10,
  backdropFilter: 'blur(10px)'
};

const episodesDrawerStyle = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  width: '300px',
  background: 'rgba(10, 11, 16, 0.95)',
  borderLeft: '1px solid var(--border-glass)',
  zIndex: 20,
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '-5px 0 20px rgba(0,0,0,0.5)'
};

const copyLinkButtonStyle = {
  background: 'rgba(0, 240, 255, 0.08)',
  border: '1px solid rgba(0, 240, 255, 0.2)',
  color: 'var(--accent-primary)',
  padding: '2px 8px',
  borderRadius: '4px',
  fontSize: '0.65rem',
  cursor: 'pointer',
  transition: 'all 0.2s'
};

const externalPlayerButtonStyle = {
  display: 'block',
  width: '100%',
  textAlign: 'center',
  padding: '8px 12px',
  backgroundColor: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '6px',
  color: '#ffffff',
  textDecoration: 'none',
  fontSize: '0.75rem',
  fontWeight: '500',
  transition: 'all 0.2s'
};

const resumeToastStyle = {
  position: 'absolute',
  top: '20px',
  left: '20px',
  padding: '10px 16px',
  backgroundColor: 'rgba(9, 10, 15, 0.9)',
  border: '1px solid var(--accent-primary)',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '0.85rem',
  fontWeight: '500',
  zIndex: 20,
  boxShadow: '0 0 12px var(--accent-glow)',
  display: 'flex',
  alignItems: 'center',
  pointerEvents: 'none'
};
