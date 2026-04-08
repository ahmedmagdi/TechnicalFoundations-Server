// AirDuel — game.js
const CFG = {
  GAME_DURATION:    60,
  PLAYER_FIRE_RATE: 380,
  ENEMY_FIRE_RATE:  520,
  MISSILE_SPEED:    7,
  PLAYER_MAX_SPEED: 14,
  PLAYER_KB_SPEED:  7,
  ENEMY_SPEED:      2.8,
  AIRCRAFT_W:       44,
  AIRCRAFT_H:       52,
  MISSILE_W:        4,
  MISSILE_H:        16,
  SHAKE_FRAMES:     7,
  PARTICLE_COUNT:   10,
};

// ── BGM Player ────────────────────────────────────────────────────────────────
class BGMPlayer {
  constructor(ctx) {
    this._ctx     = ctx;
    this._playing = false;
    this._muted   = false;
    this._beat    = 0;
    this._tid     = null;
    this._BPM     = 148;

    this._master = ctx.createGain();
    this._master.gain.value = 0;
    this._master.connect(ctx.destination);

    this._bass = [110, 110, 98,  110, 87.3, 87.3, 98,  110];
    this._arp  = [220, 261.6, 329.6, 392, 329.6, 261.6, 220, 261.6];
    this._lead = [440, 0, 392, 0, 330, 0, 440, 392];
  }

  start() {
    if (this._playing) return;
    this._playing = true;
    this._master.gain.setTargetAtTime(this._muted ? 0 : 0.15, this._ctx.currentTime, 1.0);
    this._tick();
  }

  stop() {
    this._playing = false;
    if (this._tid) clearTimeout(this._tid);
    this._master.gain.setTargetAtTime(0, this._ctx.currentTime, 0.4);
  }

  toggleMute() {
    this._muted = !this._muted;
    this._master.gain.setTargetAtTime(this._muted ? 0 : 0.15, this._ctx.currentTime, 0.1);
    return this._muted;
  }

  _tick() {
    if (!this._playing) return;
    const beatSec = 60 / this._BPM;
    const beatMs  = beatSec * 1000;
    const now     = this._ctx.currentTime;
    const i       = this._beat % 8;

    this._note(this._bass[i], now, beatSec * 0.75, 'sawtooth', 0.28);
    this._note(this._arp[i], now + beatSec * 0.5, beatSec * 0.35, 'square', 0.11);
    if (i % 2 === 0 && this._lead[i] > 0) {
      this._note(this._lead[i], now, beatSec * 1.4, 'triangle', 0.08);
    }

    this._beat++;
    this._tid = setTimeout(() => this._tick(), beatMs);
  }

  _note(freq, when, dur, type, vol) {
    try {
      const osc = this._ctx.createOscillator();
      const env = this._ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(env);
      env.connect(this._master);
      env.gain.setValueAtTime(0.001, when);
      env.gain.linearRampToValueAtTime(vol, when + 0.015);
      env.gain.exponentialRampToValueAtTime(0.001, when + dur);
      osc.start(when);
      osc.stop(when + dur + 0.02);
    } catch (_) {}
  }
}

// ── AudioManager ──────────────────────────────────────────────────────────────
class AudioManager {
  constructor() {
    this._ctx = null;
    this.bgm  = null;
  }

  init() {
    if (this._ctx) return;
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.bgm  = new BGMPlayer(this._ctx);
    } catch (_) {}
  }

  _tone(freq, dur, type = 'square', vol = 0.12) {
    if (!this._ctx) return;
    try {
      const osc  = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.connect(gain);
      gain.connect(this._ctx.destination);
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, this._ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur);
      osc.start(this._ctx.currentTime);
      osc.stop(this._ctx.currentTime + dur);
    } catch (_) {}
  }

  shoot() { this._tone(520,  0.045, 'square',   0.08); }
  hit()   { this._tone(180,  0.18,  'sawtooth',  0.22); }
  win()   { this._tone(880,  0.3,   'sine', 0.18); setTimeout(() => this._tone(1100, 0.3, 'sine', 0.15), 160); }
  lose()  { this._tone(200,  0.4,   'sawtooth',  0.18); }
}

// ── InputHandler ──────────────────────────────────────────────────────────────
class InputHandler {
  constructor(canvas) {
    this.touchX = null;
    this.tapX   = null;
    this.tapY   = null;
    this.keys   = { left: false, right: false };

    const opts = { passive: false };
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      this.touchX = e.touches[0].clientX;
    }, opts);
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      this.touchX = e.touches[0].clientX;
    }, opts);
    canvas.addEventListener('touchend', e => {
      e.preventDefault();
      if (e.changedTouches.length > 0) {
        this.tapX = e.changedTouches[0].clientX;
        this.tapY = e.changedTouches[0].clientY;
      }
    }, opts);

    canvas.addEventListener('mousemove', e => { if (e.buttons) this.touchX = e.clientX; });
    canvas.addEventListener('mousedown', e => { this.touchX = e.clientX; });
    canvas.addEventListener('click', e => { this.tapX = e.clientX; this.tapY = e.clientY; });

    window.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft'  || e.key === 'a') { this.keys.left  = true;  e.preventDefault(); }
      if (e.key === 'ArrowRight' || e.key === 'd') { this.keys.right = true;  e.preventDefault(); }
    });
    window.addEventListener('keyup', e => {
      if (e.key === 'ArrowLeft'  || e.key === 'a') this.keys.left  = false;
      if (e.key === 'ArrowRight' || e.key === 'd') this.keys.right = false;
    });
  }
}

// ── Aircraft ──────────────────────────────────────────────────────────────────
class Aircraft {
  constructor(x, y, isPlayer, w = CFG.AIRCRAFT_W, h = CFG.AIRCRAFT_H) {
    this.x = x; this.y = y; this.isPlayer = isPlayer;
    this.w = w; this.h = h;
    this.hitFlash = 0;
  }

  get left()   { return this.x - this.w * 0.5; }
  get right()  { return this.x + this.w * 0.5; }
  get top()    { return this.y - this.h * 0.5; }
  get bottom() { return this.y + this.h * 0.5; }

  onHit() { this.hitFlash = 8; }

  draw(ctx) {
    const { x, y, w, h, isPlayer } = this;
    ctx.save();
    ctx.translate(x, y);
    if (!isPlayer) ctx.scale(1, -1);

    const flash   = this.hitFlash > 0;
    const fill    = flash ? '#fff' : (isPlayer ? '#00e5ff' : '#ff5555');
    const wing    = flash ? '#fff' : (isPlayer ? '#0080aa' : '#aa2222');
    const cockpit = flash ? '#fff' : (isPlayer ? '#003366' : '#660000');

    ctx.beginPath();
    ctx.moveTo(0,-h*.48); ctx.lineTo(w*.18,-h*.12); ctx.lineTo(w*.50,h*.30);
    ctx.lineTo(w*.22,h*.20); ctx.lineTo(w*.12,h*.48); ctx.lineTo(0,h*.35);
    ctx.lineTo(-w*.12,h*.48); ctx.lineTo(-w*.22,h*.20); ctx.lineTo(-w*.50,h*.30);
    ctx.lineTo(-w*.18,-h*.12); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();

    ctx.beginPath(); ctx.moveTo(0,-h*.1); ctx.lineTo( w*.50,h*.30); ctx.lineTo( w*.22,h*.20); ctx.closePath(); ctx.fillStyle = wing; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0,-h*.1); ctx.lineTo(-w*.50,h*.30); ctx.lineTo(-w*.22,h*.20); ctx.closePath(); ctx.fillStyle = wing; ctx.fill();

    ctx.beginPath(); ctx.ellipse(0,-h*.18,w*.10,h*.12,0,0,Math.PI*2); ctx.fillStyle = cockpit; ctx.fill();

    if (!flash) {
      const grd = ctx.createRadialGradient(0,h*.38,1,0,h*.38,w*.18);
      grd.addColorStop(0, isPlayer ? 'rgba(0,220,255,0.9)' : 'rgba(255,120,0,0.9)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.ellipse(0,h*.40,w*.10,h*.14,0,0,Math.PI*2); ctx.fill();
    }

    ctx.restore();
    if (this.hitFlash > 0) this.hitFlash--;
  }
}

// ── Missile ───────────────────────────────────────────────────────────────────
class Missile {
  constructor(x, y, isPlayer) {
    this.x = x; this.y = y; this.isPlayer = isPlayer;
    this.vy = isPlayer ? -CFG.MISSILE_SPEED : CFG.MISSILE_SPEED;
    this.dead = false;
  }

  get left()   { return this.x - CFG.MISSILE_W * 0.5; }
  get right()  { return this.x + CFG.MISSILE_W * 0.5; }
  get top()    { return this.y - CFG.MISSILE_H * 0.5; }
  get bottom() { return this.y + CFG.MISSILE_H * 0.5; }

  update() { this.y += this.vy; }
  isOffScreen(h) { return this.y < -CFG.MISSILE_H || this.y > h + CFG.MISSILE_H; }

  draw(ctx) {
    const { x, y } = this;
    const mh = CFG.MISSILE_H, mw = CFG.MISSILE_W;
    const tip  = this.isPlayer ? y - mh * 0.5 : y + mh * 0.5;
    const tail = this.isPlayer ? y + mh * 0.5 : y - mh * 0.5;
    const grad = ctx.createLinearGradient(x, tip, x, tail);
    if (this.isPlayer) {
      grad.addColorStop(0, '#fff'); grad.addColorStop(0.3, '#ffee00'); grad.addColorStop(1, 'rgba(255,100,0,0)');
    } else {
      grad.addColorStop(0, '#fff'); grad.addColorStop(0.3, '#ff4444'); grad.addColorStop(1, 'rgba(180,0,0,0)');
    }
    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = this.isPlayer ? '#ffee00' : '#ff2200';
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.roundRect(x - mw * 0.5, y - mh * 0.5, mw, mh, mw * 0.5); ctx.fill();
    ctx.restore();
  }
}

// ── Particle ──────────────────────────────────────────────────────────────────
class Particle {
  constructor(x, y, color) {
    this.x = x; this.y = y; this.color = color;
    this.vx = (Math.random() - 0.5) * 8;
    this.vy = (Math.random() - 0.5) * 8;
    this.life = 1.0;
    this.decay = 0.04 + Math.random() * 0.06;
    this.r = 1.5 + Math.random() * 3.5;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.life -= this.decay;
    this.vx *= 0.95; this.vy *= 0.95;
  }
  draw(ctx) {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 4; ctx.shadowColor = this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// ── ExplosionRing ─────────────────────────────────────────────────────────────
class ExplosionRing {
  constructor(x, y, maxR) {
    this.x = x; this.y = y;
    this.radius = 0;
    this.maxR = maxR;
    this.life = 1.0;
  }
  update() {
    this.radius += (this.maxR - this.radius) * 0.22;
    this.life -= 0.07;
  }
  draw(ctx) {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.life;
    ctx.strokeStyle = 'rgba(255,80,0,1)';
    ctx.lineWidth = 3 * this.life;
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#ff5000';
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(0, this.radius), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ── Gift (power-up) ───────────────────────────────────────────────────────────
class Gift {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.r = 22;
    this.pulse = 0;
    this.dead = false;
    this.life = 6.0;
  }

  get left()   { return this.x - this.r; }
  get right()  { return this.x + this.r; }
  get top()    { return this.y - this.r; }
  get bottom() { return this.y + this.r; }

  update(dt) {
    this.pulse += 0.09;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx) {
    if (this.dead) return;
    const { x, y, r } = this;
    const scale = 1 + Math.sin(this.pulse) * 0.12;
    const alpha = Math.min(1, this.life * 1.5);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Outer glow
    const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2);
    glow.addColorStop(0, 'rgba(255,238,0,0.3)');
    glow.addColorStop(1, 'rgba(255,238,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, Math.PI * 2); ctx.fill();

    // 5-pointed star
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#ffee00';
    ctx.fillStyle = '#ffee00';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = (i * Math.PI) / 5 - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.42;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // "+5" label
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000';
    ctx.font = `bold ${r * 0.75}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+5', 0, 0);

    ctx.restore();
  }
}

// ── CollisionSystem ───────────────────────────────────────────────────────────
class CollisionSystem {
  static overlaps(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }
  static checkMissilesVsTarget(missiles, target) {
    const hits = [];
    for (const m of missiles) {
      if (!m.dead && CollisionSystem.overlaps(m, target)) { m.dead = true; hits.push(m); }
    }
    return hits;
  }
}

// ── EnemyAI ───────────────────────────────────────────────────────────────────
class EnemyAI {
  constructor() { this._dir = 1; this._next = 0; }
  update(enemy, playerX, canvasW, now) {
    if (now > this._next) {
      this._dir = Math.random() < 0.65 ? (playerX < enemy.x ? -1 : 1) : (Math.random() < 0.5 ? -1 : 1);
      this._next = now + 350 + Math.random() * 700;
    }
    enemy.x += this._dir * CFG.ENEMY_SPEED;
    const m = enemy.w * 0.5;
    enemy.x = Math.max(m, Math.min(canvasW - m, enemy.x));
  }
}

// ── StarField (parallax scrolling + speed lines) ──────────────────────────────
class StarField {
  constructor(w, h) {
    this._w = w; this._h = h;

    this._far = Array.from({ length: 45 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: 0.2 + Math.random() * 0.5, a: 0.1 + Math.random() * 0.25, vy: 0.3 + Math.random() * 0.5,
    }));
    this._mid = Array.from({ length: 25 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: 0.5 + Math.random() * 1.0, a: 0.3 + Math.random() * 0.4, vy: 0.9 + Math.random() * 1.2,
    }));
    this._near = Array.from({ length: 8 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: 1.2 + Math.random() * 1.8, a: 0.6 + Math.random() * 0.4, vy: 2.5 + Math.random() * 3.0,
    }));

    this._lines = Array.from({ length: 18 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      len: 20 + Math.random() * 60,
      vy:  6  + Math.random() * 10,
      a:   0.04 + Math.random() * 0.08,
    }));
  }

  update() {
    for (const layers of [this._far, this._mid, this._near]) {
      for (const s of layers) {
        s.y += s.vy;
        if (s.y > this._h + 2) s.y = -2;
      }
    }
    for (const l of this._lines) {
      l.y += l.vy;
      if (l.y > this._h + l.len) { l.y = -l.len; l.x = Math.random() * this._w; }
    }
  }

  draw(ctx) {
    for (const l of this._lines) {
      const grad = ctx.createLinearGradient(l.x, l.y, l.x, l.y + l.len);
      grad.addColorStop(0,   'rgba(255,255,255,0)');
      grad.addColorStop(0.4, `rgba(200,230,255,${l.a})`);
      grad.addColorStop(1,   'rgba(255,255,255,0)');
      ctx.save();
      ctx.strokeStyle = grad; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x, l.y + l.len); ctx.stroke();
      ctx.restore();
    }
    for (const layers of [this._far, this._mid, this._near]) {
      for (const s of layers) {
        ctx.save();
        ctx.globalAlpha = s.a; ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  }
}

// ── Game ──────────────────────────────────────────────────────────────────────
class Game {
  constructor() {
    this._canvas = document.getElementById('gameCanvas');
    this._ctx    = this._canvas.getContext('2d');
    this._audio  = new AudioManager();
    this._input  = new InputHandler(this._canvas);
    this._state  = 'START';
    this._lastTs = 0;
    this._shakeLeft = 0;

    this._hud            = document.getElementById('hud');
    this._startScreen    = document.getElementById('startScreen');
    this._gameOverScreen = document.getElementById('gameOverScreen');
    this._playerScoreEl  = document.getElementById('playerScore');
    this._enemyScoreEl   = document.getElementById('enemyScore');
    this._timerEl        = document.getElementById('timerDisplay');
    this._resultText     = document.getElementById('resultText');
    this._resultSub      = document.getElementById('resultSub');
    this._finalPlayer    = document.getElementById('finalPlayerScore');
    this._finalEnemy     = document.getElementById('finalEnemyScore');
    this._muteBtn        = document.getElementById('muteBtn');

    document.getElementById('startBtn').addEventListener('click',   () => this._startGame());
    document.getElementById('restartBtn').addEventListener('click', () => this._startGame());
    this._muteBtn.addEventListener('click', () => {
      if (!this._audio.bgm) return;
      const muted = this._audio.bgm.toggleMute();
      this._muteBtn.textContent = muted ? '🔇' : '🔊';
    });

    this._resize();
    window.addEventListener('resize', () => this._resize());
    requestAnimationFrame(ts => this._loop(ts));
  }

  _resize() {
    this._W = this._canvas.width  = window.innerWidth;
    this._H = this._canvas.height = window.innerHeight;
    this._stars = new StarField(this._W, this._H);
    this._initDemo();
  }

  // ── Demo: live game running behind the start screen overlay ──
  _initDemo() {
    const aScale = this._W >= 768 ? 1.8 : 1.0;
    const aW = CFG.AIRCRAFT_W * aScale;
    const aH = CFG.AIRCRAFT_H * aScale;
    this._demoPlayer    = new Aircraft(this._W * 0.5, this._H - 140, true,  aW, aH);
    this._demoEnemy     = new Aircraft(this._W * 0.5, 100,           false, aW, aH);
    this._demoMissiles  = [];
    this._demoAI        = new EnemyAI();
    this._demoLastPS    = 0;
    this._demoLastES    = 0;
    this._demoPDir      = 1;
    this._demoPDirTimer = 0;
  }

  _updateDemo(now) {
    if (!this._demoPlayer) return;

    // Simple oscillating movement for demo player
    if (now > this._demoPDirTimer) {
      this._demoPDir      = Math.random() < 0.5 ? -1 : 1;
      this._demoPDirTimer = now + 700 + Math.random() * 1100;
    }
    this._demoPlayer.x += this._demoPDir * CFG.ENEMY_SPEED;
    const pm = this._demoPlayer.w * 0.5;
    this._demoPlayer.x = Math.max(pm, Math.min(this._W - pm, this._demoPlayer.x));

    this._demoAI.update(this._demoEnemy, this._demoPlayer.x, this._W, now);

    if (now - this._demoLastPS > CFG.PLAYER_FIRE_RATE) {
      this._demoMissiles.push(new Missile(this._demoPlayer.x, this._demoPlayer.top, true));
      this._demoLastPS = now;
    }
    if (now - this._demoLastES > CFG.ENEMY_FIRE_RATE) {
      this._demoMissiles.push(new Missile(this._demoEnemy.x, this._demoEnemy.bottom, false));
      this._demoLastES = now;
    }

    for (const m of this._demoMissiles) m.update();

    const hitE = CollisionSystem.checkMissilesVsTarget(
      this._demoMissiles.filter(m => m.isPlayer && !m.dead), this._demoEnemy
    );
    hitE.forEach(() => this._demoEnemy.onHit());

    const hitP = CollisionSystem.checkMissilesVsTarget(
      this._demoMissiles.filter(m => !m.isPlayer && !m.dead), this._demoPlayer
    );
    hitP.forEach(() => this._demoPlayer.onHit());

    this._demoMissiles = this._demoMissiles.filter(m => !m.dead && !m.isOffScreen(this._H));
  }

  _startGame() {
    this._audio.init();

    const aScale = this._W >= 768 ? 1.8 : 1.0;
    const aW = CFG.AIRCRAFT_W * aScale;
    const aH = CFG.AIRCRAFT_H * aScale;

    this._player    = new Aircraft(this._W * 0.5, this._H - 140, true,  aW, aH);
    this._enemy     = new Aircraft(this._W * 0.5, 100,           false, aW, aH);
    this._missiles  = [];
    this._particles = [];
    this._rings     = [];
    this._gift      = null;
    this._giftTimer = 15 + Math.random() * 5;
    this._ai        = new EnemyAI();

    this._playerHits     = 0; this._enemyHits      = 0;
    this._timeLeft       = CFG.GAME_DURATION;
    this._lastPlayerShot = 0; this._lastEnemyShot  = 0;

    this._startScreen.classList.add('hidden');
    this._gameOverScreen.classList.add('hidden');
    this._hud.classList.add('visible');
    this._timerEl.classList.remove('urgent');
    this._updateHUD();
    this._state = 'PLAYING';

    if (this._audio.bgm) this._audio.bgm.start();
  }

  _loop(ts) {
    const dt = Math.min((ts - this._lastTs) / 1000, 0.05);
    this._lastTs = ts;
    if (this._stars) this._stars.update();
    if (this._state === 'START')   this._updateDemo(ts);
    if (this._state === 'PLAYING') this._update(dt, ts);
    this._render();
    requestAnimationFrame(t => this._loop(t));
  }

  _update(dt, now) {
    this._timeLeft -= dt;
    if (this._timeLeft <= 0) { this._timeLeft = 0; this._endGame(); return; }

    // Player movement — touch
    if (this._input.touchX !== null) {
      const dx = this._input.touchX - this._player.x;
      this._player.x += Math.sign(dx) * Math.min(Math.abs(dx) * 0.25, CFG.PLAYER_MAX_SPEED);
    }
    // Keyboard
    if (this._input.keys.left)  this._player.x -= CFG.PLAYER_KB_SPEED;
    if (this._input.keys.right) this._player.x += CFG.PLAYER_KB_SPEED;

    const pm = this._player.w * 0.5;
    this._player.x = Math.max(pm, Math.min(this._W - pm, this._player.x));

    this._ai.update(this._enemy, this._player.x, this._W, now);

    if (now - this._lastPlayerShot > CFG.PLAYER_FIRE_RATE) {
      this._missiles.push(new Missile(this._player.x, this._player.top, true));
      this._lastPlayerShot = now;
      this._audio.shoot();
    }
    if (now - this._lastEnemyShot > CFG.ENEMY_FIRE_RATE) {
      this._missiles.push(new Missile(this._enemy.x, this._enemy.bottom, false));
      this._lastEnemyShot = now;
    }

    for (const m of this._missiles) m.update();

    // Collisions — player missiles vs enemy
    const hitsOnEnemy = CollisionSystem.checkMissilesVsTarget(
      this._missiles.filter(m => m.isPlayer && !m.dead), this._enemy
    );
    if (hitsOnEnemy.length) {
      this._playerHits += hitsOnEnemy.length;
      this._enemy.onHit();
      this._shakeLeft = CFG.SHAKE_FRAMES;
      this._audio.hit();
      hitsOnEnemy.forEach(m => {
        this._burst(m.x, m.y, '#ff6666');
        this._rings.push(new ExplosionRing(m.x, m.y, this._enemy.w * 2));
      });
    }

    // Collisions — enemy missiles vs player
    const hitsOnPlayer = CollisionSystem.checkMissilesVsTarget(
      this._missiles.filter(m => !m.isPlayer && !m.dead), this._player
    );
    if (hitsOnPlayer.length) {
      this._enemyHits += hitsOnPlayer.length;
      this._player.onHit();
      this._shakeLeft = CFG.SHAKE_FRAMES;
      this._audio.hit();
      hitsOnPlayer.forEach(m => this._burst(m.x, m.y, '#00e5ff'));
      if (navigator.vibrate) navigator.vibrate(80);
    }

    this._missiles  = this._missiles.filter(m => !m.dead && !m.isOffScreen(this._H));
    for (const p of this._particles) p.update();
    this._particles = this._particles.filter(p => p.life > 0);

    // Explosion rings update
    for (const ring of this._rings) ring.update();
    this._rings = this._rings.filter(r => r.life > 0);

    // Gift power-up
    if (!this._gift) {
      this._giftTimer -= dt;
      if (this._giftTimer <= 0) {
        const gx = this._W * 0.15 + Math.random() * this._W * 0.7;
        const gy = this._H * 0.3  + Math.random() * this._H * 0.25;
        this._gift = new Gift(gx, gy);
        this._giftTimer = 15 + Math.random() * 5;
      }
    } else {
      this._gift.update(dt);
      if (this._gift.dead) {
        this._gift = null;
      }
    }

    // Tap → gift collection
    if (this._input.tapX !== null && this._gift && !this._gift.dead) {
      const tx = this._input.tapX, ty = this._input.tapY;
      if (tx >= this._gift.left && tx <= this._gift.right &&
          ty >= this._gift.top  && ty <= this._gift.bottom) {
        this._collectGift();
      }
    }
    this._input.tapX = null;
    this._input.tapY = null;

    this._updateHUD();
  }

  _collectGift() {
    if (!this._gift || this._gift.dead) return;
    this._gift.dead = true;
    // Burst 5 spread missiles from player aimed at enemy
    const halfW = this._enemy.w * 0.5;
    for (let i = 0; i < 5; i++) {
      const offset = (i - 2) * (halfW * 0.45);
      this._missiles.push(new Missile(this._player.x + offset, this._player.top, true));
    }
    // Visual: yellow particle burst at player tip
    for (let i = 0; i < 18; i++) {
      this._particles.push(new Particle(this._player.x, this._player.top, '#ffee00'));
    }
  }

  _burst(x, y, color) {
    for (let i = 0; i < CFG.PARTICLE_COUNT; i++) this._particles.push(new Particle(x, y, color));
  }

  _updateHUD() {
    const secs = Math.ceil(this._timeLeft);
    this._timerEl.textContent = secs;
    if (secs <= 10) this._timerEl.classList.add('urgent');
    this._playerScoreEl.textContent = this._playerHits;
    this._enemyScoreEl.textContent  = this._enemyHits;
  }

  _endGame() {
    this._state = 'GAMEOVER';
    this._gift  = null;
    this._hud.classList.remove('visible');
    if (this._audio.bgm) this._audio.bgm.stop();

    const p = this._playerHits, e = this._enemyHits;
    if (p > e) {
      this._resultText.textContent = '🏆 YOU WIN!';
      this._resultText.style.color = '#00e5ff';
      if (this._resultSub) this._resultSub.textContent = "Enemy neutralised. You're a natural ace.";
      this._audio.win();
    } else if (p < e) {
      this._resultText.textContent = '💥 YOU LOSE';
      this._resultText.style.color = '#ff4444';
      if (this._resultSub) this._resultSub.textContent = "The skies weren't ready for you today.";
      this._audio.lose();
    } else {
      this._resultText.textContent = '🤝 DRAW';
      this._resultText.style.color = '#ffff00';
      if (this._resultSub) this._resultSub.textContent = "Perfectly matched. Rematch?";
    }

    this._finalPlayer.textContent = p;
    this._finalEnemy.textContent  = e;
    this._gameOverScreen.classList.remove('hidden');
  }

  _render() {
    const ctx = this._ctx;
    ctx.save();

    if (this._shakeLeft > 0) {
      ctx.translate((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7);
      this._shakeLeft--;
    }

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, this._H);
    bg.addColorStop(0,   '#06000f');
    bg.addColorStop(0.5, '#08061a');
    bg.addColorStop(1,   '#000d18');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this._W, this._H);

    // Parallax stars + speed lines
    this._stars.draw(ctx);

    // Battlefield divider
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.setLineDash([8, 14]);
    ctx.beginPath(); ctx.moveTo(0, this._H * 0.5); ctx.lineTo(this._W, this._H * 0.5); ctx.stroke();
    ctx.restore();

    // Demo entities visible behind start screen overlay
    if (this._state === 'START' && this._demoPlayer) {
      for (const m of this._demoMissiles) m.draw(ctx);
      this._demoPlayer.draw(ctx);
      this._demoEnemy.draw(ctx);
    }

    // Game entities
    if (this._state === 'PLAYING' || this._state === 'GAMEOVER') {
      for (const ring of this._rings) ring.draw(ctx);
      for (const p of this._particles) p.draw(ctx);
      for (const m of this._missiles)  m.draw(ctx);
      if (this._state === 'PLAYING' && this._gift) this._gift.draw(ctx);
      this._player.draw(ctx);
      this._enemy.draw(ctx);
    }

    ctx.restore();
  }
}

window.addEventListener('DOMContentLoaded', () => { new Game(); });
