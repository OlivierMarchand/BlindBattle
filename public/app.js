(() => {
  const qs = s => document.querySelector(s);
  let socket;
  let state = {};
  let me = null;
  let inventory = [];
  let audio = null;
  let ctx = null;
  let timer = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const setStatus = (text, mode = '') => { const el = qs('#connectionStatus'); el.textContent = text; el.className = `status ${mode}`; };
  const setButtons = enabled => { qs('#createBtn').disabled = !enabled; qs('#joinBtn').disabled = !enabled; };
  const show = id => { document.querySelectorAll('.screen').forEach(x => x.classList.remove('on')); qs(`#${id}`).classList.add('on'); };

  async function unlockAudio() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') await ctx.resume();
    } catch (_) {}
  }

  function createRoom() {
    qs('#createError').textContent = '';
    if (!socket?.connected) return qs('#createError').textContent = 'Connexion au serveur en cours…';
    const btn = qs('#createBtn'); btn.disabled = true; btn.textContent = 'Création…';
    socket.timeout(5000).emit('create', { name: qs('#hostName').value.trim() }, (err, r) => {
      btn.disabled = false; btn.textContent = 'Créer le salon';
      if (err || !r?.ok) return qs('#createError').textContent = 'Le serveur ne répond pas. Réessaie.';
      me = r.id; state.code = r.code; show('lobby');
    });
  }

  function joinRoom() {
    qs('#joinError').textContent = '';
    if (!socket?.connected) return qs('#joinError').textContent = 'Connexion au serveur en cours…';
    const btn = qs('#joinBtn'); btn.disabled = true; btn.textContent = 'Connexion…';
    socket.timeout(5000).emit('join', { code: qs('#joinCode').value.trim().toUpperCase(), name: qs('#joinName').value.trim() }, (err, r) => {
      btn.disabled = false; btn.textContent = 'Rejoindre';
      if (err) return qs('#joinError').textContent = 'Le serveur ne répond pas. Réessaie.';
      if (!r?.ok) return qs('#joinError').textContent = r?.error || 'Impossible de rejoindre.';
      me = r.id; state.code = r.code; show('lobby');
    });
  }

  function chooseTheme(id) {
    if (state.hostId !== me) return;
    socket.emit('settings', { themeId: id, roundCount: Number(qs('#rounds').value) });
  }

  function startGame() {
    qs('#startBtn').disabled = true;
    socket.timeout(8000).emit('start', {}, (err, r) => {
      qs('#startBtn').disabled = false;
      if (err || !r?.ok) alert(r?.error || 'Impossible de lancer la partie.');
    });
  }

  function submitAnswer() {
    const a = qs('#answer');
    if (!a.value.trim()) return;
    socket.timeout(4000).emit('answer', { text: a.value.trim() }, (err, r) => {
      if (err) return;
      qs('#feedback').textContent = r?.correct ? `✅ +${r.points}` : '❌';
      if (r?.correct) a.value = '';
      setTimeout(() => qs('#feedback').textContent = '', 900);
    });
  }

  function synth(notes) {
    if (!notes || !ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime + .05;
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, t + i * .45);
      g.gain.exponentialRampToValueAtTime(.11, t + i * .45 + .03);
      g.gain.exponentialRampToValueAtTime(.0001, t + i * .45 + .4);
      o.connect(g).connect(ctx.destination); o.start(t + i * .45); o.stop(t + i * .45 + .42);
    });
    setTimeout(() => { if (state.phase === 'playing') synth(notes); }, notes.length * 450);
  }

  function playClip(clip, notes, startsAt) {
    const go = () => {
      if (clip) { audio = new Audio(clip); audio.play().catch(() => toast('Clique sur la page pour activer le son')); }
      else synth(notes);
    };
    setTimeout(go, Math.max(0, startsAt - Date.now()));
  }

  function toast(text) {
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = text; document.body.appendChild(el); setTimeout(() => el.remove(), 2400);
  }

  function render() {
    if (!state.code) return;
    qs('#roomCode').textContent = state.code;
    qs('#players').innerHTML = state.players.map(p => `<div class="player"><span>${esc(p.name)}${p.host ? ' 👑' : ''}</span><span>${p.score}</span></div>`).join('');
    qs('#themes').innerHTML = state.themes.map(t => `<div class="theme ${t.id === state.themeId ? 'sel' : ''}" data-theme="${esc(t.id)}"><div style="font-size:28px">${esc(t.emoji)}</div><b>${esc(t.name)}</b><small>${esc(t.provider)}</small></div>`).join('');
    qs('#themes').querySelectorAll('[data-theme]').forEach(el => el.addEventListener('click', () => chooseTheme(el.dataset.theme)));
    qs('#rounds').value = state.roundCount;
    qs('#startBtn').style.display = state.hostId === me ? 'inline-block' : 'none';
    qs('#scores').innerHTML = [...state.players].sort((a,b) => b.score - a.score).map((p,i) => `<div class="score"><span>${i+1}. ${esc(p.name)}${p.shield ? ' 🛡️' : ''}</span><b>${p.score}</b></div>`).join('');
    if (state.phase === 'lobby') show('lobby');
    else if (['loading','playing','reveal'].includes(state.phase)) show('game');
  }

  const powerName = t => ({ shield:'🛡️ Bouclier', freeze:'❄️ Freeze', blackout:'🌑 Blackout', tax:'💸 Taxe' }[t] || t);
  function useBonus(id, type) {
    if (type === 'shield') return socket.emit('bonus', { bonusId: id });
    const others = state.players.filter(p => p.id !== me);
    const names = others.map((p,i) => `${i+1} ${p.name}`).join('\n');
    const n = prompt(`Choisis un adversaire :\n${names}`);
    const target = others[(Number(n) || 0) - 1];
    if (target) socket.emit('bonus', { bonusId: id, targetId: target.id });
  }
  function renderInv() {
    qs('#inv').innerHTML = inventory.length ? inventory.map(b => `<div class="power"><span>${powerName(b.type)}</span><button class="btn ghost" data-bonus="${esc(b.id)}" data-type="${esc(b.type)}">Utiliser</button></div>`).join('') : '<p>Aucun bonus pour le moment.</p>';
    qs('#inv').querySelectorAll('[data-bonus]').forEach(el => el.addEventListener('click', () => useBonus(el.dataset.bonus, el.dataset.type)));
  }

  function initSocket() {
    socket = io({ transports: ['polling', 'websocket'], timeout: 7000 });
    socket.on('connect', () => { setStatus('● En ligne', 'ok'); setButtons(true); });
    socket.on('disconnect', () => { setStatus('● Reconnexion…', 'bad'); setButtons(false); });
    socket.on('connect_error', err => { console.error('Socket error', err); setStatus('● Hors ligne', 'bad'); setButtons(false); qs('#createError').textContent = 'Connexion temps réel impossible.'; });
    socket.on('room', r => { state = r; render(); });
    socket.on('inv', x => { inventory = x; renderInv(); });
    socket.on('round', r => {
      qs('#reveal').classList.remove('on'); qs('#finish').classList.remove('on');
      qs('#roundLabel').textContent = `Manche ${r.round} / ${r.total}`; qs('#answer').disabled = false;
      playClip(r.clip, r.notes, r.startsAt); clearInterval(timer);
      timer = setInterval(() => { const left = Math.max(0, r.endsAt - Date.now()); qs('#timeText').textContent = `${(left/1000).toFixed(1)}s`; qs('#bar').style.width = `${Math.min(100, left/16000*100)}%`; }, 100);
    });
    socket.on('reveal', r => { if (audio) { audio.pause(); audio = null; } qs('#revealTitle').textContent = r.title; qs('#revealArtist').textContent = r.artist; qs('#reveal').classList.add('on'); });
    socket.on('finished', r => { qs('#reveal').classList.remove('on'); qs('#final').innerHTML = r.ranking.map((p,i) => `<div class="player"><span>${i===0?'🥇 ':i===1?'🥈 ':i===2?'🥉 ':''}${esc(p.name)}</span><b>${p.score}</b></div>`).join(''); qs('#rematch').style.display = state.hostId === me ? 'inline-block' : 'none'; qs('#finish').classList.add('on'); });
    socket.on('effect', e => { const app = qs('#app'); if (e.type === 'freeze' || e.type === 'blackout') { app.classList.add('black'); setTimeout(() => app.classList.remove('black'), e.ms); } if (e.type === 'tax') alert(`${e.source} t’a volé 200 points 😈`); });
  }

  window.addEventListener('DOMContentLoaded', () => {
    qs('#createBtn').addEventListener('click', createRoom);
    qs('#joinBtn').addEventListener('click', joinRoom);
    qs('#startBtn').addEventListener('click', startGame);
    qs('#answerBtn').addEventListener('click', submitAnswer);
    qs('#answer').addEventListener('keydown', e => { if (e.key === 'Enter') submitAnswer(); });
    qs('#rounds').addEventListener('change', () => { if (state.code) socket.emit('settings', { themeId: state.themeId, roundCount: Number(qs('#rounds').value) }); });
    qs('#copyBtn').addEventListener('click', async () => { await navigator.clipboard.writeText(`${location.origin}?room=${state.code}`); toast('Lien copié'); });
    qs('#rematch').addEventListener('click', () => socket.emit('rematch'));
    document.addEventListener('pointerdown', unlockAudio, { once: true });
    const room = new URLSearchParams(location.search).get('room'); if (room) qs('#joinCode').value = room.toUpperCase();
    initSocket();
  });
})();
