/**
 * KOMBAT.IO — server.js
 * Usa o módulo 'ws' (incluso na pasta node_modules do projeto).
 * Não precisa de npm install — o ws já está incluído no ZIP.
 *
 * Rodar: node server.js
 * Abre:  http://localhost:3000
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

// Carrega o módulo ws incluído no projeto
const { WebSocketServer } = require('./node_modules/ws');

// ── Salas ──────────────────────────────────────────────────────
// Map<roomId, { p1: ws|null, p2: ws|null, public: bool }>
const rooms = new Map();

// ── Tipos MIME ─────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css' : 'text/css',
  '.js'  : 'application/javascript',
};

// ── Servidor HTTP (arquivos estáticos) ─────────────────────────
const httpServer = http.createServer((req, res) => {
  const file = req.url === '/' ? 'index.html' : req.url.replace(/^\//, '');
  const full = path.join(__dirname, file);
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'text/plain' });
    res.end(data);
  });
});

// ── Servidor WebSocket ─────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

// ── Helpers ────────────────────────────────────────────────────
function genId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(id) ? genId() : id;
}

function findPublicRoom() {
  for (const [id, r] of rooms) if (!r.p2 && r.public) return id;
  return null;
}

function getOpponent(ws) {
  const r = rooms.get(ws.roomId);
  if (!r) return null;
  return ws.pnum === 1 ? r.p2 : r.p1;
}

function safeSend(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch (_) {}
  }
}

function relay(ws, msg) {
  const opp = getOpponent(ws);
  if (opp) safeSend(opp, msg);
}

function broadcast(ws, msg) {
  const r = rooms.get(ws.roomId);
  if (!r) return;
  safeSend(r.p1, msg);
  safeSend(r.p2, msg);
}

function cleanup(ws, silent) {
  const rid = ws.roomId;
  if (!rid) return;
  if (!silent) relay(ws, { type: 'opponent_disconnected' });
  rooms.delete(rid);
  ws.roomId = null;
  ws.pnum   = null;
  console.log(`[SALA] ${rid} encerrada`);
}

// ── Conexões ───────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  ws.roomId = null;
  ws.pnum   = null;
  console.log('[+] Conectado');

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch (_) { return; }

    const type = msg.type;

    if (type === 'create_room') {
      if (ws.roomId) cleanup(ws, true);
      const id = genId();
      rooms.set(id, { p1: ws, p2: null, public: false });
      ws.roomId = id; ws.pnum = 1;
      safeSend(ws, { type: 'room_created', roomId: id, playerNumber: 1 });
      console.log(`[SALA] Criada: ${id}`);
    }

    else if (type === 'join_room') {
      const code = String(msg.roomId || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room)   { safeSend(ws, { type: 'join_error', msg: `Sala "${code}" não encontrada` }); return; }
      if (room.p2) { safeSend(ws, { type: 'join_error', msg: 'Sala cheia!' }); return; }
      if (ws.roomId) cleanup(ws, true);
      room.p2 = ws; ws.roomId = code; ws.pnum = 2;
      safeSend(ws, { type: 'room_joined', roomId: code, playerNumber: 2 });
      safeSend(room.p1, { type: 'game_start' });
      safeSend(ws,      { type: 'game_start' });
      console.log(`[SALA] ${code} completa — jogo iniciando!`);
    }

    else if (type === 'quick_match') {
      if (ws.roomId) cleanup(ws, true);
      const avail = findPublicRoom();
      if (avail) {
        const room = rooms.get(avail);
        room.p2 = ws; ws.roomId = avail; ws.pnum = 2;
        safeSend(ws, { type: 'room_joined', roomId: avail, playerNumber: 2 });
        safeSend(room.p1, { type: 'game_start' });
        safeSend(ws,      { type: 'game_start' });
        console.log(`[MATCH] ${avail} completa`);
      } else {
        const id = genId();
        rooms.set(id, { p1: ws, p2: null, public: true });
        ws.roomId = id; ws.pnum = 1;
        safeSend(ws, { type: 'room_created', roomId: id, playerNumber: 1, waiting: true });
        console.log(`[MATCH] Aguardando em ${id}`);
      }
    }

    else if (type === 'player_update') {
      // type deve ser sobrescrito depois do spread para não ser apagado
      const fwd = Object.assign({}, msg, { type: 'opponent_update', playerNumber: ws.pnum });
      relay(ws, fwd);
    }

    else if (type === 'attack_hit') {
      relay(ws, { type: 'hit_registered', attackerPlayer: ws.pnum, damage: msg.damage });
    }

    else if (type === 'game_over') {
      broadcast(ws, { type: 'game_over_broadcast', winner: msg.winner, reason: msg.reason });
    }

    else if (type === 'request_rematch') { relay(ws,     { type: 'rematch_requested' }); }
    else if (type === 'accept_rematch')  { broadcast(ws, { type: 'rematch_start' }); }
  });

  ws.on('close', () => {
    console.log('[-] Desconectado');
    cleanup(ws, false);
  });

  ws.on('error', (err) => {
    console.error('[!] Erro WS:', err.message);
  });
});

// ── Start ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log('=========================================');
  console.log(`  KOMBAT.IO rodando!`);
  console.log(`  Abra: http://localhost:${PORT}`);
  console.log('=========================================');
});
