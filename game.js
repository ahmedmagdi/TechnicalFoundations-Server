// AirDuel — game.js
// Architecture: Constants -> Audio -> Input -> Aircraft -> Missile -> Particles
//               -> CollisionSystem -> EnemyAI -> Game (main controller)

const CFG = {
  GAME_DURATION:    60,
  PLAYER_FIRE_RATE: 380,
  ENEMY_FIRE_RATE:  520,
  MISSILE_SPEED:    7,
  PLAYER_MAX_SPEED: 14,
  ENEMY_SPEED:      2.8,
  AIRCRAFT_W:       44,
  AIRCRAFT_H:       52,
  MISSILE_W:        4,
  MISSILE_H:        16,
  SHAKE_FRAMES:     7,
  PARTICLE_COUNT:   10,
};

class AudioManager {
  constructor() { this._ctx = null; }

  init() {
    if (this._ctx) return;
    try { this._ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
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

class InputHandler {
  constructor(canvas) {
    this.touchX = null;
    this._canvas = canvas;
    const opts = { passive: false };
    canvas.addEventListener('touchstart', e => { e.preventDefault(); this.touchX = e.touches[0].clientX; }, opts);
    canvas.addEventListener('touchmove',  e => { e.preventDefault(); this.touchX = e.touches[0].clientX; }, opts);
    canvas.addEventListener('touchend',   e => { e.preventDefault(); }, opts);
    canvas.addEventListener('mousemove',  e => { if (e.buttons) this.touchX = e.clientX; });
    canvas.addEventListener('mousedown',  e => { this.touchX = e.clientX; });
  }
}

class Aircraft {
  constructor(x, y, isPlayer) {
    this.x = x; this.y = y; this.isPlayer = isPlayer;
    this.w = CFG.AIRCRAFT_W; this.h = CFG.AIRCRAFT_H;
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
    const fill    = flash ? '#ffffff' : (isPlayer ? '#00e5ff' : '#ff5555');
    const wing    = flash ? '#ffffff' : (isPlayer ? '#0080aa' : '#aa2222');
    const cockpit = flash ? '#ffffff' : (isPlayer ? '#003366' : '#660000');

    ctx.beginPath();
    ctx.moveTo(0,         -h*0.48);
    ctx.lineTo( w*0.18,  -h*0.12);
    ctx.lineTo( w*0.50,   h*0.30);
    ctx.lineTo( w*0.22,   h*0.20);
    ctx.lineTo( w*0.12,   h*0.48);
    ctx.lineTo(0,          h*0.35);
    ctx.lineTo(-w*0.12,   h*0.48);
    ctx.lineTo(-w*0.22,   h*0.20);
    ctx.lineTo(-w*0.50,   h*0.30);
    ctx.lineTo(-w*0.18,  -h*0.12);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, -h*0.1); ctx.lineTo( w*0.50, h*0.30); ctx.lineTo( w*0.22, h*0.20); ctx.closePath();
    ctx.fillStyle = wing; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -h*0.1); ctx.lineTo(-w*0.50, h*0.30); ctx.lineTo(-w*0.22, h*0.20); ctx.closePath();
    ctx.fillStyle = wing; ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, -h*0.18, w*0.10, h*0.12, 0, 0, Math.PI*2);
    ctx.fillStyle = cockpit; ctx.fill();

    if (!flash) {
      const grd = ctx.createRadialGradient(0, h*0.38, 1, 0, h*0.38, w*0.18);
      grd.addColorStop(0, isPlayer ? 'rgba(0,220,255,0.9)' : 'rgba(255,120,0,0.9)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(0, h*0.40, w*0.10, h*0.14, 0, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();
    if (this.hitFlash > 0) this.hitFlash--;
  }
}

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
    const tip  = this.isPlayer ? y - mh*0.5 : y + mh*0.5;
    const tail = this.isPlayer ? y + mh*0.5 : y - mh*0.5;
    const grad = ctx.createLinearGradient(x, tip, x, tail);
    if (this.isPlayer) {
      grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.3, '#ffee00'); grad.addColorStop(1, 'rgba(255,100,0,0)');
    } else {
      grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.3, '#ff4444'); grad.addColorStop(1, 'rgba(180,0,0,0)');
    }
    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = this.isPlayer ? '#ffee00' : '#ff2200';
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x - mw*0.5, y - mh*0.5, mw, mh, mw*0.5);
    ctx.fill();
    ctx.restore();
  }
}

class Particle {
  constructor(x, y, color) {
    this.x = x; this.y = y; this.color = color;
    this.vx = (Math.random()-0.5)*8;
    this.vy = (Math.random()-0.5)*8;
    this.life = 1.0;
    this.decay = 0.04 + Math.random()*0.06;
    this.r = 1.5 + Math.random()*3.5;
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
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

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

class EnemyAI {
  constructor() { this._dir = 1; this._next = 0; }
  update(enemy, playerX, canvasW, now) {
    if (now > this._next) {
      this._dir = Math.random() < 0.65 ? (playerX < enemy.x ? -1 : 1) : (Math.random() < 0.5 ? -1 : 1);
      this._next = now + 350 + Math.random()*700;
    }
    enemy.x += this._dir * CFG.ENEMY_SPEED;
    const m = enemy.w * 0.5;
    enemy.x = Math.max(m, Math.min(canvasW - m, enemy.x));
  }
}

class StarField {
  constructor(w, h) {
    this._stars = Array.from({ length: 70 }, () => ({
      x: Math.random()*w, y: Math.random()*h,
      r: Math.random()*1.4+0.3, a: Math.random()*0.7+0.15
    }));
  }
  draw(ctx) {
    for (const s of this._stars) {
      ctx.save(); ctx.globalAlpha = s.a; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill(); ctx.restore();
    }
  }
}

class Game {
  constructor() {
    this._canvas = document.getElementById('gameCanvas');
    this._ctx    = this._canvas.getContext('2d');
    this._audio  = new AudioManager();
    this._input  = new InputHandler(this._canvas);
    this._state  = 'START';
    this._lastTs = 0;
    this._shakeLeft = 0;

    this._hud             = document.getElementById('hud');
    this._startScreen     = document.getElementById('startScreen');
    this._gameOverScreen  = document.getElementById('gameOverScreen');
    this._playerScoreEl   = document.getElementById('playerScore');
    this._enemyScoreEl    = document.getElementById('enemyScore');
    this._timerEl         = document.getElementById('timerDisplay');
    this._resultText      = document.getElementById('resultText');
    this._finalPlayer     = document.getElementById('finalPlayerScore');
    this._finalEnemy      = document.getElementById('finalEnemyScore');

    document.getElementById('startBtn').addEventListener('click',   () => this._startGame());
    document.getElementById('restartBtn').addEventListener('click', () => this._startGame());

    this._resize();
    window.addEventListener('resize', () => this._resize());
    requestAnimationFrame(ts => this._loop(ts));
  }

  _resize() {
    this._W = this._canvas.width  = window.innerWidth;
    this._H = this._canvas.height = window.innerHeight;
    this._stars = new StarField(this._W, this._H);
  }

  _startGame() {
    this._audio.init();
    this._player    = new Aircraft(this._W*0.5, this._H-90, true);
    this._enemy     = new Aircraft(this._W*0.5, 90, false);
    this._missiles  = [];
    this._particles = [];
    this._ai        = new EnemyAI();
    this._playerHits = 0; this._enemyHits = 0;
    this._timeLeft   = CFG.GAME_DURATION;
    this._lastPlayerShot = 0; this._lastEnemyShot = 0;
    this._startScreen.classList.add('hidden');
    this._gameOverScreen.classList.add('hidden');
    this._hud.classList.add('visible');
    this._timerEl.classList.remove('urgent');
    this._updateHUD();
    this._state = 'PLAYING';
  }

  _loop(ts) {
    const dt = Math.min((ts - this._lastTs) / 1000, 0.05);
    this._lastTs = ts;
    if (this._state === 'PLAYING') this._update(dt, ts);
    this._render();
    requestAnimationFrame(t => this._loop(t));
  }

  _update(dt, now) {
    this._timeLeft -= dt;
    if (this._timeLeft <= 0) { this._timeLeft = 0; this._endGame(); return; }

    if (this._input.touchX !== null) {
      const dx = this._input.touchX - this._player.x;
      this._player.x += Math.sign(dx) * Math.min(Math.abs(dx)*0.25, CFG.PLAYER_MAX_SPEED);
    }
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

    const hitsOnEnemy = CollisionSystem.checkMissilesVsTarget(this._missiles.filter(m =>  m.isPlayer && !m.dead), this._enemy);
    if (hitsOnEnemy.length) {
      this._playerHits += hitsOnEnemy.length;
      this._enemy.onHit(); this._shakeLeft = CFG.SHAKE_FRAMES; this._audio.hit();
      hitsOnEnemy.forEach(m => this._burst(m.x, m.y, '#ff6666'));
    }

    const hitsOnPlayer = CollisionSystem.checkMissilesVsTarget(this._missiles.filter(m => !m.isPlayer && !m.dead), this._player);
    if (hitsOnPlayer.length) {
      this._enemyHits += hitsOnPlayer.length;
      this._player.onHit(); this._shakeLeft = CFG.SHAKE_FRAMES; this._audio.hit();
      hitsOnPlayer.forEach(m => this._burst(m.x, m.y, '#00e5ff'));
    }

    this._missiles  = this._missiles.filter(m => !m.dead && !m.isOffScreen(this._H));
    for (const p of this._particles) p.update();
    this._particles = this._particles.filter(p => p.life > 0);
    this._updateHUD();
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
    this._hud.classList.remove('visible');
    const p = this._playerHits, e = this._enemyHits;
    if (p > e)      { this._resultText.textContent = '🏆 YOU WIN!'; this._resultText.style.color = '#00e5ff'; this._audio.win(); }
    else if (p < e) { this._resultText.textContent = '💥 YOU LOSE'; this._resultText.style.color = '#ff4444'; this._audio.lose(); }
    else            { this._resultText.textContent = '🤝 DRAW';     this._resultText.style.color = '#ffff00'; }
    this._finalPlayer.textContent = p;
    this._finalEnemy.textContent  = e;
    this._gameOverScreen.classList.remove('hidden');
  }

  _render() {
    const ctx = this._ctx;
    ctx.save();
    if (this._shakeLeft > 0) {
      ctx.translate((Math.random()-0.5)*7, (Math.random()-0.5)*7);
      this._shakeLeft--;
    }
    const bg = ctx.createLinearGradient(0, 0, 0, this._H);
    bg.addColorStop(0, '#08001a'); bg.addColorStop(0.5, '#0a0820'); bg.addColorStop(1, '#001020');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this._W, this._H);
    this._stars.draw(ctx);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.setLineDash([8,14]);
    ctx.beginPath(); ctx.moveTo(0, this._H*0.5); ctx.lineTo(this._W, this._H*0.5); ctx.stroke();
    ctx.restore();
    if (this._state === 'PLAYING' || this._state === 'GAMEOVER') {
      for (const p of this._particles) p.draw(ctx);
      for (const m of this._missiles)  m.draw(ctx);
      this._player.draw(ctx);
      this._enemy.draw(ctx);
    }
    ctx.restore();
  }
}

window.addEventListener('DOMContentLoaded', () => { new Game(); });
