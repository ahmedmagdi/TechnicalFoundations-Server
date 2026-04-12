# AirDuel — Agent Handoff Document

## What This Project Is
A mobile-first HTML5 canvas arcade PWA game called **AirDuel**. Two fighter aircraft (player vs CPU) shoot missiles at each other for 60 seconds. Most hits wins. Built in vanilla JS — no frameworks, no build step. Single `game.js` + `index.html`.

**Live URL:** https://yamenahmed.netlify.app
**Repo:** `ahmedmagdi/TechnicalFoundations-Server` on GitHub
**Netlify deploys from:** `master` branch (auto-deploy on push)

---

## Git — Always Push to Both Branches
```bash
git add game.js sw.js   # or whatever changed
git commit -m "your message"
git push origin master
git push origin master:main
```
The Netlify site was historically confused between `master` and `main`, so always push to both.

**Git remote proxy URL format:**
```
http://local_proxy@127.0.0.1:<PORT>/git/ahmedmagdi/TechnicalFoundations-Server
```
Check the current port with `git remote -v`. The port changes per session.

**NEVER push to `ahmedmagdi/airduel`** — that repo returns 502 from the proxy (blocked).

---

## File Structure
```
/home/user/TechnicalFoundations-Server/
  index.html      ← game UI, CSS, PWA meta tags
  game.js         ← entire game engine (~800 lines, single file)
  sw.js           ← service worker, cache = 'airduel-v3'
  manifest.json   ← PWA manifest
  netlify.toml    ← publish = ".", SW no-cache headers
  icons/          ← icon-192.png, icon-512.png
```

---

## Service Worker Cache
`sw.js` line 1: `const CACHE = 'airduel-v3';`
**Bump the version number on every deploy** (v3 → v4 → v5…) or the user's iPhone will keep serving stale cached files. The user tests on iPhone Safari and this has caused much confusion.

---

## Current game.js — What's Already Implemented

### CFG constants (top of file, current values)
```javascript
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
```

### Classes in game.js
- **BGMPlayer** — procedural chiptune BGM (A-minor, 148 BPM, Web Audio API oscillators)
- **AudioManager** — wraps BGMPlayer + sfx: `shoot()`, `hit()`, `win()`, `lose()`
- **InputHandler** — touch (passive:false for iOS), mouse, keyboard arrows/WASD. Exposes `touchX`, `tapX/tapY` (set on touchend/click, must be cleared by game each frame), `keys.left/right`
- **Aircraft** — player (cyan `#00e5ff`) + enemy (red `#ff5555`). Constructor: `(x, y, isPlayer, w, h)`. Has `hitFlash`, `onHit()`, AABB getters
- **Missile** — travels up (player) or down (enemy). `vy` set from `CFG.MISSILE_SPEED`. Gradient draw with glow
- **Particle** — explosion debris, random velocity, fades by `life`
- **ExplosionRing** — expanding orange circle ring on enemy hit, ~14 frame lifetime
- **Gift** — pulsing yellow 5-pointed star, `r=22`, spawns every 15-20s, tap to collect → fires 5 spread missiles. Only ONE type currently. Auto-expires after 6s
- **CollisionSystem** — static `overlaps(a,b)` AABB + `checkMissilesVsTarget(missiles, target)`
- **EnemyAI** — tracks player X (65% prob), random dir change every 350-700ms. `update(enemy, playerX, canvasW, now)`
- **StarField** — 3-layer parallax (far/mid/near) + speed lines. Currently TOO BRIGHT (needs dimming)
- **Game** — main controller

### Game class key state
- States: `'START'` → `'PLAYING'` → `'GAMEOVER'`
- `_resize()` → recreates StarField, calls `_initDemo()`
- `_initDemo()` → silent demo game (2 AI aircraft + missiles) visible behind start screen overlay
- Start screen overlay opacity: `rgba(10, 0, 20, 0.75)` — demo visible behind it
- `_startGame()` inits: `_player`, `_enemy`, `_missiles[]`, `_particles[]`, `_rings[]`, `_gift=null`, `_giftTimer`, `_ai`
- `_update(dt, now)` — movement, AI, shooting, collisions, particles, rings, gift spawn/tap
- `_collectGift()` — marks gift dead, fires 5 spread missiles, yellow particle burst
- `_render()` — bg gradient → stars → divider → demo OR game entities
- Desktop aircraft scale: `1.8×` on screens ≥ 768px wide
- Player Y: `H - 140`
- Vibration: `navigator.vibrate(80)` on player hit ✅
- Win/lose/draw microcopy in `#resultSub` ✅

### HTML elements (index.html)
- `#gameCanvas` — fullscreen canvas
- `#hud` (hidden by default, `.visible` during PLAYING) contains `#playerScore`, `#timerDisplay`, `#enemyScore`
- `#startScreen` overlay → `#startBtn`
- `#gameOverScreen` overlay → `#resultText`, `#resultSub`, `#finalPlayerScore`, `#finalEnemyScore`, `#restartBtn`
- `#muteBtn` — fixed bottom-right, always visible

---

## What Needs to Be Implemented (NOT done yet)

### 1. Gift — bigger + 4 types + FloatingText reward feedback

**Gift class changes:**
- `r: 22 → 32`
- `life: 6 → 7`
- Spawn interval: `8 + Math.random() * 4` seconds (was 15-20)
- Add `type` randomly from 4 options, `color` field

**4 types:**
| type | shape | color | effect |
|------|-------|-------|--------|
| `burst` | yellow 5-pt star | `#ffee00` | fire 5 spread missiles (existing) |
| `rapid` | green lightning bolt path | `#00ff88` | `_rapidTimer = 6` → halves fire rate 6s |
| `shield` | blue filled hexagon | `#4488ff` | `_shieldHits = 2` → absorbs 2 hits |
| `bomb` | red circle + inner white ring | `#ff4400` | `_playerHits += 3` directly |

**FloatingText class (new — add before Gift):**
```javascript
class FloatingText {
  constructor(x, y, text, color, size = 22) {
    this.x = x; this.y = y; this.text = text;
    this.color = color; this.size = size;
    this.vy = -1.5; this.life = 1.0;
  }
  update() { this.y += this.vy; this.life -= 0.018; }
  draw(ctx) {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 10; ctx.shadowColor = this.color;
    ctx.font = `bold ${this.size}px "Courier New", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}
```

Stored in `this._floats = []`. Init in `_startGame()`. Update + filter in `_update()`. Draw in `_render()` above particles, below aircraft.

On collect push FloatingText at gift position:
- burst → `"BURST!"` yellow
- rapid → `"RAPID FIRE!"` green
- shield → `"SHIELD x2!"` blue
- bomb → `"+3 SCORE!"` red

**Shield logic in `_update()`:**
- `this._shieldHits = 0` in `_startGame()`
- When enemy hits player: if `_shieldHits > 0` → decrement, skip all damage; else normal hit
- Draw blue hexagon ring around player in `_render()` when active

**Rapid fire:**
- `this._rapidTimer = 0` in `_startGame()`
- `if (_rapidTimer > 0) _rapidTimer -= dt`
- `const fireRate = _rapidTimer > 0 ? CFG.PLAYER_FIRE_RATE / 2 : CFG.PLAYER_FIRE_RATE`

---

### 2. Stars dimmer + player bullets bigger

**StarField constructor — halve all alpha values:**
- `_far`: `a: 0.05 + Math.random() * 0.12` (was `0.1 + 0.25`)
- `_mid`: `a: 0.12 + Math.random() * 0.18` (was `0.3 + 0.4`)
- `_near`: `a: 0.25 + Math.random() * 0.2` (was `0.6 + 0.4`)
- speed lines: `a: 0.02 + Math.random() * 0.04` (was `0.04 + 0.08`)

**CFG missile size:**
- `MISSILE_W: 4 → 7`
- `MISSILE_H: 16 → 26`

---

### 3. Difficulty increase

**CFG:**
- `ENEMY_SPEED: 2.8 → 4.5`
- `ENEMY_FIRE_RATE: 520 → 340`

**EnemyAI.update() — add speedMult:**
```javascript
update(enemy, playerX, canvasW, now, speedMult = 1) {
  // same logic but:
  enemy.x += this._dir * CFG.ENEMY_SPEED * speedMult;
}
```

**Spread shots — every 10th enemy shot fires 3:**
- `this._enemyShotCount = 0` in `_startGame()`
- Increment on each enemy shot
- When `_enemyShotCount % 10 === 0 && _enemyShotCount > 0`: push 3 missiles at `enemy.x - 30`, `enemy.x`, `enemy.x + 30`

**Hard mode at 30s remaining:**
- `this._hardMode = false` in `_startGame()`
- In `_update()`: `if (!_hardMode && _timeLeft < 30) { _hardMode = true; }`
- When active: `_ai.update(..., now, 1.3)` and use `CFG.ENEMY_FIRE_RATE * 0.75` as fire rate gate

---

### 4. Streak reward

- `this._streak = 0` in `_startGame()`
- On player hits enemy: `_streak += hitsOnEnemy.length`
  - `if (_streak % 5 === 0)` → `_playerHits += 1` + FloatingText `"ACE! +1"` `#00ff88` size 26
  - `else if (_streak % 3 === 0)` → FloatingText `"STREAK! 🔥"` `#ff9900` size 22
- On enemy hits player: `_streak = 0`

---

## After Implementing — Always Do This
```bash
# 1. Bump SW cache version in sw.js line 1
#    'airduel-v3' → 'airduel-v4' (increment each time)

# 2. Commit and push to both branches
git add game.js sw.js
git commit -m "feat: gifts, difficulty, streaks, visual polish"
git push origin master
git push origin master:main
```

The user will then go to https://yamenahmed.netlify.app, clear Safari cache on iPhone, and test.
