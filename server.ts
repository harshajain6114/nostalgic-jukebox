import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import type { Server } from 'http';
import path from 'path';

const app = express();
const port = process.env.PORT || 3000;
const distPath = path.join(process.cwd(), 'dist');

// Serve static assets from Vite's build output folder (dist)
app.use(express.static(distPath));

// Fallback all non-file routes to index.html for SPA behavior
app.get('*', (req, res, next) => {
  if (path.extname(req.path)) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

const server = createServer(app);

interface Station {
  theme: string;
  trackUrl: string | null;
  startedAt: number | null;
  members: Map<string, WebSocket>;
}
const stations = new Map<string, Station>();

function getOrCreateStation(theme: string): Station {
  let s = stations.get(theme);
  if (!s) {
    s = { theme, trackUrl: null, startedAt: null, members: new Map() };
    stations.set(theme, s);
  }
  return s;
}

function broadcast(station: Station, msg: unknown, exceptId?: string) {
  const payload = JSON.stringify(msg);
  for (const [id, ws] of station.members) {
    if (id === exceptId) continue;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

export function createStationServer(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer });
  wss.on('connection', (ws) => {
    const clientId = randomUUID();
    let joinedStation: Station | null = null;

    ws.on('message', (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'PING_TIME') {
        const t1 = Date.now();
        ws.send(JSON.stringify({ type: 'PONG_TIME', t0: msg.t0, t1, t2: Date.now() }));
      }
      if (msg.type === 'JOIN_STATION') {
        const station = getOrCreateStation(msg.theme);
        station.members.set(clientId, ws);
        joinedStation = station;
        console.log(`[join] client=${clientId} station="${msg.theme}"`);
        ws.send(JSON.stringify({
          type: 'STATION_STATE', theme: station.theme,
          trackUrl: station.trackUrl, startedAt: station.startedAt, serverNow: Date.now(),
          memberCount: station.members.size
        }));
        // Broadcast new member count to others
        broadcast(station, { type: 'MEMBERS_CHANGED', count: station.members.size });
      }
      if (msg.type === 'PLAY_TRACK' && joinedStation) {
        joinedStation.trackUrl = msg.trackUrl;
        joinedStation.startedAt = Date.now();
        broadcast(joinedStation, { type: 'TRACK_STARTED', trackUrl: joinedStation.trackUrl, startedAt: joinedStation.startedAt });
      }
      if (msg.type === 'RESYNC_REQUEST' && joinedStation) {
        ws.send(JSON.stringify({
          type: 'STATION_STATE', theme: joinedStation.theme,
          trackUrl: joinedStation.trackUrl, startedAt: joinedStation.startedAt, serverNow: Date.now(),
          memberCount: joinedStation.members.size
        }));
      }
    });

    ws.on('close', () => {
      if (joinedStation) {
        joinedStation.members.delete(clientId);
        console.log(`[leave] client=${clientId} station="${joinedStation.theme}"`);
        broadcast(joinedStation, { type: 'MEMBERS_CHANGED', count: joinedStation.members.size });
      }
    });
  });
  return wss;
}

createStationServer(server);

server.listen(port, () => {
  console.log(`[server] Express + WS server listening on port ${port}`);
});
