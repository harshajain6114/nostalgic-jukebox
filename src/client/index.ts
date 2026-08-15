import { sampleFromExchange, estimateOffset, elapsedAt, type OffsetSample } from '../../lib/sync/clock';

// Visual logging helper
function log(msg: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  console.log(`[${type}] ${msg}`);
  const logPanel = document.getElementById('log-panel');
  if (logPanel) {
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logPanel.appendChild(entry);
    logPanel.scrollTop = logPanel.scrollHeight;
  }
}

export class StationClient {
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private offsetMs = 0;
  private wsUrl: string;
  private theme: string;
  private reconnectAttempt = 0;
  private isExplicitlyClosed = false;

  // Active playback state
  private activeTrackUrl: string | null = null;
  private activeStartedAt: number | null = null;
  private playbackStartTimeLocal = 0;
  private playbackStartOffsetMs = 0;
  private trackDurationMs = 0;
  private animationFrameId: number | null = null;
  private abortController: AbortController | null = null;

  constructor(wsUrl: string, theme: string) {
    this.wsUrl = wsUrl;
    this.theme = theme;
    this.connect();
    this.startProgressLoop();
  }

  private connect() {
    this.isExplicitlyClosed = false;
    this.updateConnectionStatus('connecting', 'Connecting to socket...');
    this.ws = new WebSocket(this.wsUrl);
    this.wireSocket(this.ws);
  }

  private wireSocket(ws: WebSocket) {
    ws.onopen = async () => {
      this.reconnectAttempt = 0;
      this.updateConnectionStatus('connected', 'Syncing clock...');
      log(`Connected. Initiating clock sync with server...`, 'info');
      try {
        await this.syncClock(ws);
        this.updateConnectionStatus('synced', `Clock synced (offset: ${this.offsetMs}ms)`);
        log(`Clock synchronized. Offset estimated: ${this.offsetMs}ms`, 'success');
        
        // Join the station using the room name
        log(`Joining station "${this.theme}"...`, 'info');
        ws.send(JSON.stringify({ type: 'JOIN_STATION', theme: this.theme }));
      } catch (err) {
        log(`Clock sync failed: ${err}`, 'error');
        this.updateConnectionStatus('connected', 'Synced failed');
      }
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        this.handleMessage(msg);
      } catch (e) {
        log(`Failed to parse WebSocket message: ${e}`, 'error');
      }
    };

    ws.onclose = (ev) => {
      if (this.isExplicitlyClosed) {
        this.updateConnectionStatus('disconnected', 'Disconnected');
        log('Disconnected from station.', 'info');
        return;
      }
      this.updateConnectionStatus('disconnected', `Disconnected (Code: ${ev.code})`);
      log(`Connection lost. Attempting reconnect...`, 'warning');
      this.reconnectWithBackoff();
    };

    ws.onerror = () => {
      log('WebSocket error occurred', 'error');
    };
  }

  private async syncClock(ws: WebSocket) {
    const samples: OffsetSample[] = [];
    // We take 6 timing measurements for accurate jitter filtering
    for (let i = 0; i < 6; i++) {
      if (ws.readyState !== WebSocket.OPEN) {
        throw new Error('Connection closed during clock synchronization');
      }
      samples.push(await this.pingOnce(ws));
    }
    this.offsetMs = estimateOffset(samples);
  }

  private pingOnce(ws: WebSocket): Promise<OffsetSample> {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const timeoutId = setTimeout(() => {
        ws.removeEventListener('message', handler);
        reject(new Error('NTP ping request timed out'));
      }, 5000);

      const handler = (ev: MessageEvent) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'PONG_TIME') {
            const t3 = Date.now();
            clearTimeout(timeoutId);
            ws.removeEventListener('message', handler);
            resolve(sampleFromExchange({ t0, t1: msg.t1, t2: msg.t2, t3 }));
          }
        } catch {
          // Ignore parse errors from unrelated messages
        }
      };

      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ type: 'PING_TIME', t0 }));
    });
  }

  private stationNow(): number {
    return Date.now() + this.offsetMs;
  }

  private handleMessage(msg: any) {
    if (msg.type === 'STATION_STATE' || msg.type === 'TRACK_STARTED') {
      const { trackUrl, startedAt } = msg;

      if (!trackUrl || !startedAt) {
        log('Station is currently idle. Select a track to broadcast.', 'info');
        this.stopPlayback();
        return;
      }

      // Check if we are already playing this exact track
      if (this.source && this.activeTrackUrl === trackUrl && this.activeStartedAt === startedAt) {
        // We're already playing the correct track! Let's check drift.
        const expectedElapsed = elapsedAt(startedAt, this.stationNow());
        const currentElapsed = this.getCurrentPlaybackElapsedMs();
        const drift = Math.abs(currentElapsed - expectedElapsed);

        if (drift < 1000) {
          log(`Already in sync with station track (drift: ${drift.toFixed(0)}ms). Resuming smoothly.`, 'success');
          return;
        }
        log(`Drift detected (${drift.toFixed(0)}ms). Rescheduling playback to align.`, 'warning');
      }

      log(`Scheduling playback for track: ${trackUrl} (Started at server: ${startedAt})`, 'info');
      this.playFrom(trackUrl, startedAt);
    }
  }

  private async playFrom(trackUrl: string, startedAt: number) {
    // Cancel any ongoing fetch/decode operation
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    try {
      this.stopPlayback();
      
      this.updateTrackDisplay(`Loading track... ${trackUrl.split('/').pop()}`);
      
      const buffer = await this.loadTrack(trackUrl, signal);
      if (signal.aborted) return;

      this.trackDurationMs = buffer.duration * 1000;
      
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      // Resume context if suspended (common browser security policy)
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      const nowServer = this.stationNow();
      const elapsedMs = elapsedAt(startedAt, nowServer, this.trackDurationMs);
      
      if (elapsedMs >= this.trackDurationMs) {
        log('Station track has already finished playing.', 'warning');
        this.updateTrackDisplay('Idle (Track Finished)');
        return;
      }

      this.source = this.audioCtx.createBufferSource();
      this.source.buffer = buffer;
      this.source.connect(this.audioCtx.destination);

      this.activeTrackUrl = trackUrl;
      this.activeStartedAt = startedAt;

      // Handle past or future scheduling
      if (startedAt <= nowServer) {
        // Late joiner or reconnected mid-track
        const startOffsetSec = elapsedMs / 1000;
        this.playbackStartOffsetMs = elapsedMs;
        this.playbackStartTimeLocal = this.audioCtx.currentTime;
        
        this.source.start(this.audioCtx.currentTime, startOffsetSec);
        log(`Playback started mid-track at +${startOffsetSec.toFixed(2)}s / ${buffer.duration.toFixed(2)}s`, 'success');
      } else {
        // Future scheduled start
        const delayMs = startedAt - nowServer;
        const delaySec = delayMs / 1000;
        this.playbackStartOffsetMs = 0;
        this.playbackStartTimeLocal = this.audioCtx.currentTime + delaySec;

        this.source.start(this.playbackStartTimeLocal, 0);
        log(`Playback scheduled to start in ${delaySec.toFixed(2)} seconds`, 'info');
      }

      this.updateTrackDisplay(trackUrl.split('/').pop() || trackUrl);

      // Reset abort controller reference
      this.abortController = null;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        log('Audio load aborted (new track selected).', 'info');
      } else {
        log(`Error loading/playing audio: ${err.message || err}`, 'error');
        this.updateTrackDisplay('Error loading track');
      }
    }
  }

  private async loadTrack(url: string, signal: AbortSignal): Promise<AudioBuffer> {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    
    // Create localized audio context for decoding if standard one isn't initialized
    const ctx = this.audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!this.audioCtx) this.audioCtx = ctx;

    return await ctx.decodeAudioData(arrayBuffer);
  }

  private stopPlayback() {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        // Source may not have started yet
      }
      this.source.disconnect();
      this.source = null;
    }
    this.activeTrackUrl = null;
    this.activeStartedAt = null;
    this.playbackStartTimeLocal = 0;
    this.playbackStartOffsetMs = 0;
    this.trackDurationMs = 0;
    this.updateTrackDisplay('Idle');
  }

  private getCurrentPlaybackElapsedMs(): number {
    if (!this.audioCtx || !this.activeTrackUrl || this.playbackStartTimeLocal === 0) return 0;
    
    const localNow = this.audioCtx.currentTime;
    if (localNow < this.playbackStartTimeLocal) {
      // Future scheduled start, elapsed is 0
      return 0;
    }
    const elapsedSec = (localNow - this.playbackStartTimeLocal) + (this.playbackStartOffsetMs / 1000);
    return Math.min(elapsedSec * 1000, this.trackDurationMs);
  }

  public broadcastPlay(trackUrl: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      log(`Broadcasting play request for: ${trackUrl}`, 'info');
      this.ws.send(JSON.stringify({ type: 'PLAY_TRACK', trackUrl }));
    } else {
      log('Cannot broadcast play: WebSocket is disconnected.', 'error');
    }
  }

  public reSync() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.updateConnectionStatus('connecting', 'Syncing clock...');
      log('Manual clock re-sync requested...', 'info');
      this.syncClock(this.ws).then(() => {
        this.updateConnectionStatus('synced', `Clock synced (offset: ${this.offsetMs}ms)`);
        log(`Manual re-sync completed. Offset: ${this.offsetMs}ms`, 'success');
        this.ws?.send(JSON.stringify({ type: 'RESYNC_REQUEST' }));
      }).catch((e) => {
        log(`Manual clock sync failed: ${e}`, 'error');
      });
    }
  }

  public disconnectSocket() {
    this.isExplicitlyClosed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.stopPlayback();
  }

  private reconnectWithBackoff() {
    this.reconnectAttempt++;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 10_000);
    log(`Reconnecting in ${(delay / 1000).toFixed(0)}s (attempt ${this.reconnectAttempt})...`, 'warning');
    setTimeout(() => {
      if (this.isExplicitlyClosed) return;
      this.connect();
    }, delay);
  }

  private startProgressLoop() {
    const updateProgress = () => {
      const displaySyncedTime = document.getElementById('display-synced-time');
      const timeCurrent = document.getElementById('time-current');
      const timeTotal = document.getElementById('time-total');
      const progressFill = document.getElementById('progress-fill');

      if (displaySyncedTime) {
        const syncedServerTime = this.stationNow();
        displaySyncedTime.textContent = new Date(syncedServerTime).toLocaleTimeString() + `.${(syncedServerTime % 1000).toString().padStart(3, '0')}`;
      }

      if (this.activeTrackUrl && this.trackDurationMs > 0) {
        const elapsedMs = this.getCurrentPlaybackElapsedMs();
        
        const currentSec = Math.floor(elapsedMs / 1000);
        const totalSec = Math.floor(this.trackDurationMs / 1000);

        if (timeCurrent) {
          const mins = Math.floor(currentSec / 60).toString().padStart(2, '0');
          const secs = (currentSec % 60).toString().padStart(2, '0');
          timeCurrent.textContent = `${mins}:${secs}`;
        }
        if (timeTotal) {
          const mins = Math.floor(totalSec / 60).toString().padStart(2, '0');
          const secs = (totalSec % 60).toString().padStart(2, '0');
          timeTotal.textContent = `${mins}:${secs}`;
        }
        if (progressFill) {
          const pct = (elapsedMs / this.trackDurationMs) * 100;
          progressFill.style.width = `${pct}%`;
        }
      } else {
        if (timeCurrent) timeCurrent.textContent = '00:00';
        if (timeTotal) timeTotal.textContent = '00:00';
        if (progressFill) progressFill.style.width = '0%';
      }

      this.animationFrameId = requestAnimationFrame(updateProgress);
    };
    this.animationFrameId = requestAnimationFrame(updateProgress);
  }

  private updateConnectionStatus(status: 'connected' | 'connecting' | 'synced' | 'disconnected', details?: string) {
    const badge = document.getElementById('connection-badge');
    const displayOffset = document.getElementById('display-offset');
    
    if (badge) {
      badge.textContent = status;
      badge.className = 'badge';
      if (status === 'synced') badge.classList.add('badge-success');
      else if (status === 'connecting') badge.classList.add('badge-warning');
      else if (status === 'connected') badge.classList.add('badge-info');
      else badge.classList.add('badge-error');
    }

    if (displayOffset) {
      if (status === 'synced') {
        displayOffset.textContent = `${this.offsetMs >= 0 ? '+' : ''}${this.offsetMs} ms`;
      } else if (details) {
        displayOffset.textContent = details;
      }
    }
  }

  private updateTrackDisplay(text: string) {
    const display = document.getElementById('display-track');
    if (display) {
      display.textContent = text;
    }
  }

  public cleanup() {
    this.disconnectSocket();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }
}

// Service Worker Registration
async function registerServiceWorker() {
  const swBadge = document.getElementById('sw-badge');
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      log(`Service Worker registered successfully. Scope: ${reg.scope}`, 'success');
      if (swBadge) {
        swBadge.textContent = 'Active (Cached)';
        swBadge.className = 'badge badge-success';
      }
    } catch (err) {
      log(`Service Worker registration failed: ${err}`, 'error');
      if (swBadge) {
        swBadge.textContent = 'Failed';
        swBadge.className = 'badge badge-error';
      }
    }
  } else {
    log('Service Worker is not supported in this browser.', 'warning');
    if (swBadge) {
      swBadge.textContent = 'Not Supported';
      swBadge.className = 'badge badge-warning';
    }
  }
}

// App Initialization
let clientInstance: StationClient | null = null;

document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();

  const btnJoin = document.getElementById('btn-join') as HTMLButtonElement;
  const btnLeave = document.getElementById('btn-leave-station') as HTMLButtonElement;
  const btnPlay = document.getElementById('btn-play') as HTMLButtonElement;
  const btnSyncNow = document.getElementById('btn-sync-now') as HTMLButtonElement;
  const btnToggleConnection = document.getElementById('btn-toggle-connection') as HTMLButtonElement;
  
  const stationThemeInput = document.getElementById('station-theme') as HTMLInputElement;
  const displayStationName = document.getElementById('display-station-name') as HTMLSpanElement;
  
  const audioSelect = document.getElementById('audio-select') as HTMLSelectElement;
  const customAudioUrlInput = document.getElementById('custom-audio-url') as HTMLInputElement;

  const joinCard = document.getElementById('join-card') as HTMLElement;
  const stationCard = document.getElementById('station-card') as HTMLElement;
  const devControlsCard = document.getElementById('dev-controls-card') as HTMLElement;

  btnJoin.addEventListener('click', () => {
    const theme = stationThemeInput.value.trim();
    if (!theme) {
      alert('Please enter a station theme/name.');
      return;
    }

    // Connect to WebSocket using standard /socket endpoint proxied to backend
    const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const wsUrl = wsProtocol + window.location.host + '/socket';
    
    log(`Initializing StationClient for theme: "${theme}"...`, 'info');
    clientInstance = new StationClient(wsUrl, theme);

    // Update UI visibility
    displayStationName.textContent = theme;
    joinCard.classList.add('hidden');
    stationCard.classList.remove('hidden');
    devControlsCard.classList.remove('hidden');
  });

  btnLeave.addEventListener('click', () => {
    if (clientInstance) {
      clientInstance.cleanup();
      clientInstance = null;
    }
    
    // Update UI visibility
    joinCard.classList.remove('hidden');
    stationCard.classList.add('hidden');
    devControlsCard.classList.add('hidden');
  });

  btnPlay.addEventListener('click', () => {
    if (!clientInstance) return;

    let trackUrl = customAudioUrlInput.value.trim();
    if (!trackUrl) {
      trackUrl = audioSelect.value;
    }

    if (!trackUrl) {
      alert('Please select or enter an audio track URL.');
      return;
    }

    clientInstance.broadcastPlay(trackUrl);
  });

  btnSyncNow.addEventListener('click', () => {
    if (clientInstance) {
      clientInstance.reSync();
    }
  });

  btnToggleConnection.addEventListener('click', () => {
    if (!clientInstance) return;

    if (btnToggleConnection.textContent?.includes('Disconnect')) {
      clientInstance.disconnectSocket();
      btnToggleConnection.textContent = '🔌 Reconnect Socket';
      btnToggleConnection.style.borderColor = 'var(--success)';
      btnToggleConnection.style.color = 'var(--success)';
      log('WebSocket manually closed. Playback stopped, sync paused.', 'warning');
    } else {
      // Reconnect
      const theme = stationThemeInput.value.trim();
      const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
      const wsUrl = wsProtocol + window.location.host + '/socket';
      
      log(`Reconnecting StationClient to theme: "${theme}"...`, 'info');
      clientInstance = new StationClient(wsUrl, theme);
      
      btnToggleConnection.textContent = '🔌 Disconnect Socket';
      btnToggleConnection.style.borderColor = 'var(--border)';
      btnToggleConnection.style.color = 'var(--text-primary)';
    }
  });
});
