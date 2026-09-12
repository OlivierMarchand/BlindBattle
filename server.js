const express = require('express');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

const rooms = new Map();
const ROUND = 16000;
const REVEAL = 3500;
const BONUS = ['shield', 'freeze', 'blackout', 'tax'];

const demo = [
  { id: 'neon', name: 'Électro Neon', emoji: '⚡', tracks: [
    ['Neon Run', 'Nova Circuit', [220, 277, 330, 440]],
    ['Pixel Hearts', 'Arcade Bloom', [262, 330, 392, 523]],
    ['Midnight Voltage', 'Static Love', [196, 247, 294, 392]],
    ['Laser City', 'Night Drive', [233, 294, 349, 466]],
    ['Chrome Dreams', 'Violet Pulse', [208, 262, 330, 415]],
    ['Electric Sunrise', 'Future Kids', [247, 311, 370, 494]],
    ['Digital Fever', 'Mono Club', [220, 294, 349, 440]],
    ['Afterglow', 'Signal 88', [196, 262, 330, 392]]
  ]},
  { id: 'arcade', name: 'Retro Arcade', emoji: '👾', tracks: [
    ['High Score', 'Bit Runner', [262, 392, 523, 659]],
    ['Continue?', 'Player Two', [220, 330, 440, 660]],
    ['Boss Level', '8-Bit Heroes', [196, 294, 392, 587]],
    ['Extra Life', 'Coin Op', [247, 370, 494, 740]],
    ['Game Over', 'CRT Kids', [208, 311, 415, 622]],
    ['Secret Stage', 'Pixel Quest', [233, 349, 466, 698]],
    ['Power Up', 'Joystick Jam', [262, 330, 494, 659]],
    ['Warp Zone', 'Level Select', [196, 262, 392, 523]]
  ]},
  { id: 'cinema', name: 'Cinématique', emoji: '🎬', tracks: [
    ['Last Horizon', 'Orion Pictures', [174, 220, 261, 349]],
    ['The Chase', 'Silver Frame', [196, 247, 294, 392]],
    ['Final Scene', 'Atlas Orchestra', [165, 220, 330, 440]],
    ['Hidden City', 'Northlight', [185, 233, 277, 370]],
    ['No Turning Back', 'Epic Room', [174, 261, 349, 523]],
    ['First Light', 'Cobalt Score', [196, 294, 440, 587]],
    ['The Reveal', 'Glass Cinema', [220, 277, 415, 554]],
    ['End Credits', 'Moonline', [165, 247, 330, 494]]
  ]}
];

const extThemes = [
  ['pop', 'Pop', '🎤', 'pop'],
  ['rock', 'Rock', '🎸', 'rock'],
  ['electro', 'Électro', '🪩', 'electronic'],
  ['hiphop', 'Hip-Hop', '🔥', 'hiphop'],
  ['funk', 'Funk & Groove', '🕺', 'funk'],
  ['chill', 'Chill', '🌙', 'chillout']
];

const jamendoEnabled = () => Boolean(process.env.JAMENDO_CLIENT_ID);
const themes = () => [
  ...demo.map(x => ({ id: x.id, name: x.name, emoji: x.emoji, provider: 'demo' })),
  ...(jamendoEnabled() ? extThemes.map(([id, name, emoji]) => ({ id, name, emoji, provider: 'jamendo' })) : [])
];

function norm(s = '') {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function isCorrect(guess, track) {
  const g = norm(guess);
  return track.accepted.some(a => {
    const answer = norm(a);
    return g === answer || (g.length > 6 && answer.length > 6 && answer.includes(g));
  });
}
function roomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  while (rooms.has(code));
  return code;
}
function playerView(p) {
  return { id: p.id, name: p.name, score: p.score, streak: p.streak, host: p.host, shield: p.shield, bonusCount: p.inv.length };
}
function roomView(r) {
  return { code: r.code, phase: r.phase, themeId: r.themeId, roundCount: r.roundCount, roundIndex: r.roundIndex, players: [...r.players.values()].map(playerView), hostId: r.hostId, themes: themes() };
}
function sendRoom(r) {
  io.to(r.code).emit('room', roomView(r));
  for (const p of r.players.values()) io.to(p.id).emit('inv', p.inv);
}
function shuffle(input) {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
async function buildQueue(themeId, n) {
  const local = demo.find(x => x.id === themeId);
  if (local) return shuffle(local.tracks).slice(0, n).map(([title, artist, notes]) => ({ title, artist, notes, accepted: [title, artist] }));
  if (!jamendoEnabled()) throw new Error('music');
  const ext = extThemes.find(x => x[0] === themeId);
  if (!ext) throw new Error('theme');
  const url = new URL('https://api.jamendo.com/v3.0/tracks/');
  url.searchParams.set('client_id', process.env.JAMENDO_CLIENT_ID);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', Math.max(20, n * 3));
  url.searchParams.set('tags', ext[3]);
  url.searchParams.set('audioformat', 'mp32');
  url.searchParams.set('order', 'popularity_total');
  const response = await fetch(url);
  if (!response.ok) throw new Error('jamendo');
  const data = await response.json();
  return shuffle(data.results || []).slice(0, n).map(x => ({ title: x.name, artist: x.artist_name, clip: x.audio, accepted: [x.name, x.artist_name] }));
}
function finishRound(r) {
  if (r.phase !== 'playing') return;
  clearTimeout(r.timer);
  r.phase = 'reveal';
  const t = r.current;
  for (const p of r.players.values()) if (!r.correct.has(p.id)) p.streak = 0;
  io.to(r.code).emit('reveal', { title: t.title, artist: t.artist });
  sendRoom(r);
  r.timer = setTimeout(() => r.roundIndex >= r.q.length - 1 ? finishGame(r) : startRound(r), REVEAL);
}
function startRound(r) {
  r.phase = 'playing';
  r.roundIndex++;
  r.current = r.q[r.roundIndex];
  r.correct = new Set();
  r.first = null;
  const startsAt = Date.now() + 900;
  r.ends = startsAt + ROUND;
  io.to(r.code).emit('round', { round: r.roundIndex + 1, total: r.q.length, startsAt, endsAt: r.ends, clip: r.current.clip || null, notes: r.current.notes || null, themeId: r.themeId });
  sendRoom(r);
  r.timer = setTimeout(() => finishRound(r), ROUND + 900);
}
function finishGame(r) {
  r.phase = 'finished';
  clearTimeout(r.timer);
  io.to(r.code).emit('finished', { ranking: [...r.players.values()].sort((a, b) => b.score - a.score).map(playerView) });
  sendRoom(r);
}
function maybeAward(p) {
  const chance = p.streak >= 2 ? 0.65 : 0.38;
  if (p.inv.length >= 2 || Math.random() > chance) return;
  p.inv.push({ id: crypto.randomUUID(), type: BONUS[Math.floor(Math.random() * BONUS.length)] });
}

io.on('connection', socket => {
  console.log('socket connected', socket.id);
  socket.emit('themes', themes());

  socket.on('create', ({ name } = {}, cb = () => {}) => {
    const code = roomCode();
    const p = { id: socket.id, name: String(name || 'Player').slice(0, 18), score: 0, streak: 0, host: true, shield: false, inv: [] };
    const r = { code, hostId: socket.id, players: new Map([[socket.id, p]]), phase: 'lobby', themeId: themes()[0].id, roundCount: 6, roundIndex: -1, q: [], timer: null };
    rooms.set(code, r);
    socket.join(code);
    socket.data.code = code;
    console.log('room created', code, p.name);
    cb({ ok: true, code, id: socket.id });
    sendRoom(r);
  });

  socket.on('join', ({ code, name } = {}, cb = () => {}) => {
    const normalizedCode = String(code || '').toUpperCase().trim();
    const r = rooms.get(normalizedCode);
    if (!r) return cb({ ok: false, error: 'Salon introuvable' });
    if (r.phase !== 'lobby') return cb({ ok: false, error: 'Partie déjà commencée' });
    if (r.players.size >= 8) return cb({ ok: false, error: 'Salon complet' });
    const p = { id: socket.id, name: String(name || 'Player').slice(0, 18), score: 0, streak: 0, host: false, shield: false, inv: [] };
    r.players.set(socket.id, p);
    socket.join(normalizedCode);
    socket.data.code = normalizedCode;
    console.log('room joined', normalizedCode, p.name);
    cb({ ok: true, code: normalizedCode, id: socket.id });
    sendRoom(r);
  });

  socket.on('settings', x => {
    const r = rooms.get(socket.data.code);
    if (!r || r.hostId !== socket.id || r.phase !== 'lobby') return;
    if (themes().some(t => t.id === x.themeId)) r.themeId = x.themeId;
    r.roundCount = Math.max(3, Math.min(8, Number(x.roundCount) || 6));
    sendRoom(r);
  });

  socket.on('start', async (_, cb = () => {}) => {
    const r = rooms.get(socket.data.code);
    if (!r || r.hostId !== socket.id) return cb({ ok: false, error: 'Seul l’hôte peut lancer la partie' });
    try {
      r.phase = 'loading';
      sendRoom(r);
      r.q = await buildQueue(r.themeId, r.roundCount);
      r.roundIndex = -1;
      for (const p of r.players.values()) {
        p.score = 0; p.streak = 0; p.shield = false; p.inv = []; p.frozenUntil = 0;
      }
      cb({ ok: true });
      startRound(r);
    } catch (err) {
      console.error('start error', err);
      r.phase = 'lobby';
      sendRoom(r);
      cb({ ok: false, error: 'Impossible de charger la musique' });
    }
  });

  socket.on('answer', ({ text } = {}, cb = () => {}) => {
    const r = rooms.get(socket.data.code);
    const p = r?.players.get(socket.id);
    if (!r || !p || r.phase !== 'playing' || r.correct.has(p.id)) return cb({ ok: false });
    if (Date.now() < (p.frozenUntil || 0)) return cb({ ok: false, error: 'freeze' });
    if (!isCorrect(text, r.current)) return cb({ ok: true, correct: false });
    const remaining = Math.max(0, r.ends - Date.now());
    let points = Math.round(520 + 680 * (remaining / ROUND) + Math.min(225, p.streak * 75));
    p.streak++;
    if (!r.first) { r.first = p.id; points += 150; }
    p.score += points;
    r.correct.add(p.id);
    maybeAward(p);
    io.to(p.id).emit('answerResult', { correct: true, points });
    io.to(r.code).emit('correct', { name: p.name, id: p.id });
    sendRoom(r);
    cb({ ok: true, correct: true, points });
  });

  socket.on('bonus', ({ bonusId, targetId } = {}, cb = () => {}) => {
    const r = rooms.get(socket.data.code);
    const p = r?.players.get(socket.id);
    if (!r || !p) return cb({ ok: false });
    const index = p.inv.findIndex(b => b.id === bonusId);
    if (index < 0) return cb({ ok: false });
    const b = p.inv[index];
    if (b.type === 'shield') {
      p.shield = true;
      p.inv.splice(index, 1);
      sendRoom(r);
      return cb({ ok: true });
    }
    const target = r.players.get(targetId);
    if (!target || target.id === p.id) return cb({ ok: false });
    p.inv.splice(index, 1);
    const blocked = target.shield;
    if (blocked) target.shield = false;
    else if (b.type === 'freeze') {
      target.frozenUntil = Date.now() + 4000;
      io.to(target.id).emit('effect', { type: 'freeze', ms: 4000, source: p.name });
    } else if (b.type === 'blackout') {
      io.to(target.id).emit('effect', { type: 'blackout', ms: 4000, source: p.name });
    } else if (b.type === 'tax') {
      target.score = Math.max(0, target.score - 200);
      io.to(target.id).emit('effect', { type: 'tax', source: p.name });
    }
    sendRoom(r);
    cb({ ok: true, blocked });
  });

  socket.on('rematch', () => {
    const r = rooms.get(socket.data.code);
    if (!r || r.hostId !== socket.id) return;
    r.phase = 'lobby';
    r.roundIndex = -1;
    sendRoom(r);
  });

  socket.on('disconnect', reason => {
    console.log('socket disconnected', socket.id, reason);
    const r = rooms.get(socket.data.code);
    if (!r) return;
    r.players.delete(socket.id);
    if (!r.players.size) {
      clearTimeout(r.timer);
      rooms.delete(r.code);
      return;
    }
    if (r.hostId === socket.id) {
      const next = r.players.values().next().value;
      next.host = true;
      r.hostId = next.id;
    }
    sendRoom(r);
  });
});

app.get('/api/health', (_, res) => res.json({ ok: true, music: jamendoEnabled() ? 'jamendo+demo' : 'demo' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

server.listen(PORT, '0.0.0.0', () => console.log(`Blind Battle on ${PORT}`));
