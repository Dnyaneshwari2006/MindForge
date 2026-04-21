import { useState, useRef, useEffect } from 'react';

const TRACKS = [
  {
    id: 'lofi',
    name: 'Lo-fi Beats',
    icon: '🎵',
    // Free lo-fi audio stream
    url: 'https://streams.ilovemusic.de/iloveradio17.mp3',
  },
  {
    id: 'rain',
    name: 'Rain Sounds',
    icon: '🌧️',
    url: 'https://rainymood.com/audio1112/0.m4a',
  },
  {
    id: 'whitenoise',
    name: 'White Noise',
    icon: '🌫️',
    // Generate white noise via oscillator (handled in code)
    url: null,
  },
  {
    id: 'fireplace',
    name: 'Fireplace',
    icon: '🔥',
    url: 'https://freesound.org/data/previews/369/369245_6829753-lq.mp3',
  },
];

export default function AmbientPlayer() {
  const saved = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('mf_ambient') || '{}') : {};
  const [activeTrack, setActiveTrack] = useState(saved.track || null);
  const [volume, setVolume] = useState(saved.volume ?? 0.5);
  const [isPlaying, setIsPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const audioRef = useRef(null);
  const noiseCtxRef = useRef(null);
  const noiseGainRef = useRef(null);

  // Save preferences
  useEffect(() => {
    localStorage.setItem('mf_ambient', JSON.stringify({ track: activeTrack, volume }));
  }, [activeTrack, volume]);

  function stopAll() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (noiseCtxRef.current) {
      noiseCtxRef.current.close();
      noiseCtxRef.current = null;
      noiseGainRef.current = null;
    }
    setIsPlaying(false);
  }

  function playWhiteNoise() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSize = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start();

    noiseCtxRef.current = ctx;
    noiseGainRef.current = gainNode;
  }

  function playTrack(trackId) {
    stopAll();
    const track = TRACKS.find((t) => t.id === trackId);
    if (!track) return;

    setActiveTrack(trackId);

    if (trackId === 'whitenoise') {
      playWhiteNoise();
    } else if (track.url) {
      const audio = new Audio(track.url);
      audio.loop = true;
      audio.volume = volume;
      audio.play().catch(() => {});
      audioRef.current = audio;
    }

    setIsPlaying(true);
  }

  function togglePlay() {
    if (isPlaying) {
      stopAll();
    } else if (activeTrack) {
      playTrack(activeTrack);
    }
  }

  function handleVolumeChange(e) {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
    if (noiseGainRef.current) noiseGainRef.current.gain.value = v;
  }

  const currentTrack = TRACKS.find((t) => t.id === activeTrack);

  return (
    <div className="px-6 pb-4">
      {/* Toggle bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-zinc-800/50"
        style={{ color: isPlaying ? 'var(--score-green)' : 'var(--text-tertiary)' }}
      >
        <span className="flex items-center gap-2">
          <span>{isPlaying ? '🔊' : '🔇'}</span>
          <span>{isPlaying && currentTrack ? currentTrack.name : 'Ambient Sounds'}</span>
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="mt-2 space-y-2 animate-fade-in">
          {/* Track buttons */}
          <div className="grid grid-cols-2 gap-1.5">
            {TRACKS.map((track) => (
              <button
                key={track.id}
                onClick={() => playTrack(track.id)}
                className={`text-[11px] font-medium py-2 px-2 rounded-md transition-all flex items-center gap-1.5 ${
                  activeTrack === track.id && isPlaying
                    ? 'bg-white text-black'
                    : 'bg-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800'
                }`}
              >
                <span>{track.icon}</span>
                <span className="truncate">{track.name}</span>
              </button>
            ))}
          </div>

          {/* Volume + controls */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={togglePlay}
              className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-zinc-800 border border-zinc-700"
            >
              {isPlaying ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolumeChange}
              className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
              style={{ background: `linear-gradient(to right, var(--text-secondary) ${volume * 100}%, var(--bg-secondary) ${volume * 100}%)` }}
            />
            <span className="text-[10px] tabular-nums w-6 text-right" style={{ color: 'var(--text-tertiary)' }}>
              {Math.round(volume * 100)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
