(function(){
"use strict";

/* ============================================================
   CONSTANTS
   ============================================================ */
const CW = 900, CH = 560;
const GROUND_Y = 460;
const STAGE_L = 60, STAGE_R = 840;
const GRAVITY = 2600;
const JUMP_V = -900;
const MOVE_SPEED = 250;
const FIGHTER_W = 56, FIGHTER_H = 128;
const ROUND_TIME = 60;
const WINS_NEEDED = 2;

/* ============================================================
   AUDIO (simple procedural beeps, no external assets)
   ============================================================ */
let audioCtx = null;
let soundOn = true;
function ensureAudio(){
  if(!audioCtx){
    try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){}
  }
}
function beep(freq, dur, type, vol){
  if(!soundOn || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type || 'square';
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime((vol!==undefined?vol:0.15), t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}
const SFX = {
  punch: ()=>beep(180,0.09,'square',0.18),
  kick: ()=>beep(120,0.14,'square',0.2),
  special: ()=>{ beep(80,0.25,'sawtooth',0.22); setTimeout(()=>beep(300,0.15,'sawtooth',0.15),80); },
  block: ()=>beep(500,0.06,'triangle',0.12),
  hit: ()=>beep(90,0.12,'square',0.22),
  jump: ()=>beep(400,0.08,'triangle',0.1),
  ko: ()=>{ beep(200,0.3,'sawtooth',0.2); setTimeout(()=>beep(100,0.5,'sawtooth',0.25),200); },
  select: ()=>beep(600,0.05,'square',0.12),
  win: ()=>{ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>beep(f,0.2,'square',0.18), i*130)); }
};

/* ============================================================
   CHARACTER DEFINITIONS
   ============================================================ */
const CHARACTERS = {
  steve: {
    name:"Steve", tagline:"Balanced Miner",
    palette:{ skin:"#e0ac69", shirt:"#4a7ac9", shirtDark:"#33578f", pants:"#3b3b3b", pantsDark:"#232323", hair:"#5b3a21", eye:"#1c1c1c" },
    variant:"human",
    stats:{ maxHealth:100, speed:1.0, punchDmg:6, kickDmg:9, specialDmg:17, specialCooldown:1400, specialRange:95, punchRange:78, kickRange:90 },
    specialName:"Sword Slash"
  },
  zombie: {
    name:"Zombie", tagline:"Slow Tank",
    palette:{ skin:"#4f8f4a", shirt:"#5c6b8a", shirtDark:"#3d4864", pants:"#334f33", pantsDark:"#1f331f", hair:"#2c4a2c", eye:"#8a1f1f" },
    variant:"human",
    stats:{ maxHealth:125, speed:0.72, punchDmg:7, kickDmg:10, specialDmg:15, specialCooldown:1700, specialRange:80, punchRange:78, kickRange:90 },
    specialName:"Rotten Grab"
  },
  skeleton: {
    name:"Skeleton", tagline:"Fragile Archer",
    palette:{ skin:"#e5e2d6", shirt:"#c9c4ad", shirtDark:"#a29c85", pants:"#b4af99", pantsDark:"#8b8672", hair:"#00000000", eye:"#111111" },
    variant:"human",
    stats:{ maxHealth:85, speed:1.05, punchDmg:5, kickDmg:8, specialDmg:13, specialCooldown:1300, specialRange:520, punchRange:75, kickRange:88 },
    specialName:"Arrow Shot"
  },
  creeper: {
    name:"Creeper", tagline:"Explosive Bruiser",
    palette:{ skin:"#4fae4f", shirt:"#3f9c3f", shirtDark:"#2c7a2c", pants:"#2f7a2f", pantsDark:"#1e5a1e", hair:"#00000000", eye:"#0c0c0c" },
    variant:"creeper",
    stats:{ maxHealth:95, speed:0.85, punchDmg:6, kickDmg:8, specialDmg:22, specialCooldown:2000, specialRange:85, punchRange:76, kickRange:88 },
    specialName:"Payload Blast"
  },
  enderman: {
    name:"Enderman", tagline:"Fast Teleporter",
    palette:{ skin:"#171018", shirt:"#231a26", shirtDark:"#150e17", pants:"#1c141e", pantsDark:"#100b12", hair:"#00000000", eye:"#c86bff" },
    variant:"tall",
    stats:{ maxHealth:88, speed:1.18, punchDmg:6, kickDmg:9, specialDmg:16, specialCooldown:1500, specialRange:260, punchRange:80, kickRange:92 },
    specialName:"Void Teleport"
  }
};
const ROSTER_ORDER = ["steve","zombie","skeleton","creeper","enderman"];

/* ============================================================
   GAME STATE
   ============================================================ */
const state = {
  screen: "title", // title | select | fighting | roundend | matchend
  selection: { p1:null, p2:null, p2cpu:true },
  p1:null, p2:null,
  round:1,
  roundTimer: ROUND_TIME,
  timerAccum:0,
  particles: [],
  projectiles: [],
  keys:new Set(),
  justPressed:new Set(),
  bannerText:"",
  bannerAlpha:0,
  bannerTimer:0,
  freeze:false, // true during pre-round countdown / round end pause
  shake:0,
  lastTs:null,
  bgOffset:0
};

/* ============================================================
   DOM REFS
   ============================================================ */
const el = {
  screenTitle: document.getElementById('screen-title'),
  screenSelect: document.getElementById('screen-select'),
  screenRoundend: document.getElementById('screen-roundend'),
  hud: document.getElementById('hud'),
  controlsHint: document.getElementById('controls-hint'),
  banner: document.getElementById('banner'),
  canvas: document.getElementById('arena'),
  p1Name: document.getElementById('p1-name'),
  p2Name: document.getElementById('p2-name'),
  p1Health: document.getElementById('p1-health'),
  p2Health: document.getElementById('p2-health'),
  p1Pips: document.getElementById('p1-pips'),
  p2Pips: document.getElementById('p2-pips'),
  hudTimer: document.getElementById('hud-timer'),
  rosterP1: document.getElementById('roster-p1'),
  rosterP2: document.getElementById('roster-p2'),
  cpuCheck: document.getElementById('cpu-check'),
  btnFight: document.getElementById('btn-fight'),
  selectHint: document.getElementById('select-hint'),
  roundendTitle: document.getElementById('roundend-title'),
  roundendSub: document.getElementById('roundend-sub'),
  roundendBtns: document.getElementById('roundend-btns'),
  muteBtn: document.getElementById('mute-btn'),
  pauseBtn: document.getElementById('pause-btn'),
  screenPause: document.getElementById('screen-pause'),
  btnResume: document.getElementById('btn-resume'),
  btnHome: document.getElementById('btn-home'),
  touchControls: document.getElementById('touch-controls')
};
const ctx = el.canvas.getContext('2d');

/* ============================================================
   INPUT
   ============================================================ */
const P1_KEYS = { left:"KeyA", right:"KeyD", jump:"KeyW", block:"KeyS", punch:"KeyF", kick:"KeyG", special:"KeyH" };
const P2_KEYS = { left:"ArrowLeft", right:"ArrowRight", jump:"ArrowUp", block:"ArrowDown", punch:"KeyJ", kick:"KeyK", special:"KeyL" };
const PREVENT_DEFAULT_CODES = new Set([
  "ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Space",
  "KeyA","KeyD","KeyW","KeyS","KeyF","KeyG","KeyH","KeyJ","KeyK","KeyL"
]);

window.addEventListener('keydown', (e)=>{
  if(e.code === 'Escape' && (state.screen === 'fighting' || state.screen === 'roundend' || state.screen === 'matchend')) {
    if(isPaused) el.btnResume.click();
    else el.pauseBtn.click();
  }
  if(PREVENT_DEFAULT_CODES.has(e.code)) e.preventDefault();
  if(!e.repeat) state.justPressed.add(e.code);
  state.keys.add(e.code);
  ensureAudio();
});
window.addEventListener('keyup', (e)=>{
  state.keys.delete(e.code);
});

// Touch controls logic
if('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  const tcBtns = document.querySelectorAll('.tc-btn');
  tcBtns.forEach(btn => {
    const code = btn.getAttribute('data-key');
    const press = (e) => {
      e.preventDefault();
      if(!state.keys.has(code)) state.justPressed.add(code);
      state.keys.add(code);
      btn.classList.add('active');
      ensureAudio();
    };
    const release = (e) => {
      e.preventDefault();
      state.keys.delete(code);
      btn.classList.remove('active');
    };
    btn.addEventListener('touchstart', press);
    btn.addEventListener('touchend', release);
    btn.addEventListener('touchcancel', release);
  });
}

/* ============================================================
   FIGHTER FACTORY
   ============================================================ */
function createFighter(type, x, facing, side, isCPU){
  const def = CHARACTERS[type];
  return {
    type, side, isCPU:!!isCPU,
    def,
    x, y:GROUND_Y, vx:0, vy:0,
    facing,
    health: def.stats.maxHealth,
    maxHealth: def.stats.maxHealth,
    state:"idle", // idle, walk, jump, block, punch, kick, special, hit, ko
    stateTime:0,
    attackHasHit:false,
    specialCd:0,
    roundsWon:0,
    walkPhase:0,
    hitFlash:0,
    aiTimer:0,
    aiDecision:"approach",
    teleportUsed:false,
    knockbackX:0
  };
}

/* ============================================================
   CHARACTER SELECT UI
   ============================================================ */
function drawCharacterIcon(canvas, type){
  const c = canvas.getContext('2d');
  c.clearRect(0,0,canvas.width,canvas.height);
  const f = { x:canvas.width/2, y:canvas.height-6, facing:1, state:"idle", walkPhase:0, type, def:CHARACTERS[type] };
  drawFighter(c, f, 0.62, true);
}
function buildRoster(container, side){
  container.innerHTML = "";
  ROSTER_ORDER.forEach(type=>{
    const def = CHARACTERS[type];
    const card = document.createElement('button');
    card.className = "fighter-card";
    card.type = "button";
    const cv = document.createElement('canvas');
    cv.width = 76; cv.height = 96;
    const label = document.createElement('span');
    label.textContent = def.name;
    card.appendChild(cv);
    card.appendChild(label);
    if(state.selection[side] === type) card.classList.add('selected');
    card.addEventListener('click', ()=>{
      SFX.select();
      state.selection[side] = type;
      [...container.children].forEach(c=>c.classList.remove('selected'));
      card.classList.add('selected');
      updateSelectHint();
    });
    container.appendChild(card);
    drawCharacterIcon(cv, type);
  });
}
function updateSelectHint(){
  const {p1,p2} = state.selection;
  if(p1 && p2){
    el.selectHint.textContent = CHARACTERS[p1].name + " vs " + CHARACTERS[p2].name + " — ready!";
    el.btnFight.disabled = false;
  } else {
    el.selectHint.textContent = "Pick a fighter for each side.";
    el.btnFight.disabled = true;
  }
}

/* ============================================================
   SCREEN MANAGEMENT
   ============================================================ */
function showScreen(name){
  state.screen = name;
  el.screenTitle.classList.toggle('hidden', name!=="title");
  el.screenSelect.classList.toggle('hidden', name!=="select");
  el.screenRoundend.classList.toggle('hidden', name!=="roundend" && name!=="matchend");
  el.hud.classList.toggle('hidden', !(name==="fighting"||name==="roundend"||name==="matchend"));
  el.controlsHint.classList.toggle('hidden', name!=="fighting");
  el.touchControls.classList.toggle('hidden', name!=="fighting");
  el.pauseBtn.style.display = (name==="fighting") ? "block" : "none";
}

document.getElementById('btn-start').addEventListener('click', ()=>{
  ensureAudio();
  SFX.select();
  buildRoster(el.rosterP1, 'p1');
  buildRoster(el.rosterP2, 'p2');
  updateSelectHint();
  showScreen('select');
});

el.btnFight.addEventListener('click', ()=>{
  ensureAudio();
  state.selection.p2cpu = el.cpuCheck.checked;
  startMatch();
});

el.muteBtn.addEventListener('click', ()=>{
  soundOn = !soundOn;
  el.muteBtn.textContent = "SOUND: " + (soundOn ? "ON" : "OFF");
});

let isPaused = false;
el.pauseBtn.addEventListener('click', ()=>{
  isPaused = true;
  el.screenPause.classList.remove('hidden');
});
el.btnResume.addEventListener('click', ()=>{
  isPaused = false;
  el.screenPause.classList.add('hidden');
  state.lastTs = null;
  requestAnimationFrame(loop);
});
el.btnHome.addEventListener('click', ()=>{
  window.location.href = '/';
});

/* ============================================================
   MATCH / ROUND FLOW
   ============================================================ */
function startMatch(){
  const p1type = state.selection.p1, p2type = state.selection.p2;
  state.p1 = createFighter(p1type, 260, 1, 'p1', false);
  state.p2 = createFighter(p2type, 640, -1, 'p2', state.selection.p2cpu);
  state.round = 1;
  el.p1Name.textContent = CHARACTERS[p1type].name;
  el.p2Name.textContent = CHARACTERS[p2type].name;
  buildPips(el.p1Pips); buildPips(el.p2Pips);
  startRound();
}
function buildPips(container){
  container.innerHTML = "";
  for(let i=0;i<WINS_NEEDED;i++){
    const p = document.createElement('div');
    p.className = "pip";
    container.appendChild(p);
  }
}
function refreshPips(){
  [...el.p1Pips.children].forEach((p,i)=> p.classList.toggle('won', i < state.p1.roundsWon));
  [...el.p2Pips.children].forEach((p,i)=> p.classList.toggle('won', i < state.p2.roundsWon));
}

function resetFighterForRound(f, x, facing){
  f.x = x; f.y = GROUND_Y; f.vx=0; f.vy=0; f.facing=facing;
  f.health = f.maxHealth;
  f.state = "idle"; f.stateTime = 0; f.attackHasHit=false;
  f.specialCd = 0; f.hitFlash = 0; f.knockbackX = 0;
}

function startRound(){
  resetFighterForRound(state.p1, 260, 1);
  resetFighterForRound(state.p2, 640, -1);
  state.roundTimer = ROUND_TIME;
  state.timerAccum = 0;
  el.hudTimer.textContent = ROUND_TIME;
  state.projectiles = [];
  state.particles = [];
  updateHealthBars();
  refreshPips();
  showScreen('fighting');
  state.freeze = true;
  showBanner("ROUND " + state.round, 1100);
  setTimeout(()=>{
    showBanner("FIGHT!", 700);
    setTimeout(()=>{ state.freeze = false; }, 300);
  }, 1150);
}

function showBanner(text, durationMs){
  state.bannerText = text;
  state.bannerAlpha = 1;
  state.bannerTimer = durationMs;
  el.banner.textContent = text;
  el.banner.style.opacity = "1";
  el.banner.style.transform = "scale(1)";
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(()=>{
    el.banner.style.opacity = "0";
  }, durationMs);
}

function endRound(reason){
  state.freeze = true;
  let winner = null;
  if(reason === "ko"){
    winner = state.p1.health <= 0 ? state.p2 : state.p1;
  } else { // timeout
    if(state.p1.health > state.p2.health) winner = state.p1;
    else if(state.p2.health > state.p1.health) winner = state.p2;
    else winner = null; // draw
  }

  if(winner){
    winner.roundsWon++;
    refreshPips();
  }

  setTimeout(()=>{
    if(winner && winner.roundsWon >= WINS_NEEDED){
      endMatch(winner);
    } else {
      el.roundendTitle.textContent = winner ? "ROUND " + state.round + " KO!" : "ROUND " + state.round + " DRAW";
      el.roundendSub.textContent = winner ? (winner.def.name + " wins the round") : "Nobody wins the round";
      el.roundendBtns.innerHTML = "";
      const nextBtn = document.createElement('button');
      nextBtn.className = "blocky-btn accent";
      nextBtn.textContent = "Next Round";
      nextBtn.onclick = ()=>{ state.round++; startRound(); };
      el.roundendBtns.appendChild(nextBtn);
      showScreen('roundend');
    }
  }, 900);
}

function endMatch(winner){
  SFX.win();
  el.roundendTitle.textContent = winner.def.name.toUpperCase() + " WINS!";
  el.roundendSub.textContent = "Match complete — " + winner.roundsWon + " rounds to " +
    (winner===state.p1 ? state.p2.roundsWon : state.p1.roundsWon);
  el.roundendBtns.innerHTML = "";
  const rematchBtn = document.createElement('button');
  rematchBtn.className = "blocky-btn accent";
  rematchBtn.textContent = "Rematch";
  rematchBtn.onclick = ()=>{ startMatch(); };
  const menuBtn = document.createElement('button');
  menuBtn.className = "blocky-btn";
  menuBtn.textContent = "Main Menu";
  menuBtn.onclick = ()=>{ showScreen('title'); };
  el.roundendBtns.appendChild(rematchBtn);
  el.roundendBtns.appendChild(menuBtn);
  showScreen('matchend');
}

/* ============================================================
   COMBAT HELPERS
   ============================================================ */
const ATTACK_TIMING = {
  punch:  { total:260, activeStart:90,  activeEnd:170 },
  kick:   { total:380, activeStart:150, activeEnd:250 },
};
function specialTiming(type){
  switch(type){
    case 'steve':    return { total:480, activeStart:160, activeEnd:260 };
    case 'zombie':   return { total:520, activeStart:180, activeEnd:320 };
    case 'skeleton': return { total:420, activeStart:140, activeEnd:180 };
    case 'creeper':  return { total:620, activeStart:260, activeEnd:400 };
    case 'enderman': return { total:420, activeStart:120, activeEnd:180 };
    default: return { total:400, activeStart:150, activeEnd:250 };
  }
}

function startAttack(f, kind){
  if(f.state==="hit"||f.state==="ko") return;
  if(kind==="special" && f.specialCd > 0) return;
  if((kind==="punch"||kind==="kick") && (f.state==="punch"||f.state==="kick"||f.state==="special")) return;
  if(kind==="special" && (f.state==="punch"||f.state==="kick"||f.state==="special")) return;
  f.state = kind;
  f.stateTime = 0;
  f.attackHasHit = false;
  if(kind==="special"){
    f.specialCd = f.def.stats.specialCooldown;
    f.teleportUsed = false;
  }
  if(kind==="punch") SFX.punch();
  if(kind==="kick") SFX.kick();
}

function distanceBetween(a,b){ return Math.abs(a.x - b.x); }

function applyDamage(attacker, defender, dmg, isBlockable){
  const facingOpponent = (attacker.x < defender.x && defender.facing === -1) ||
                          (attacker.x > defender.x && defender.facing === 1);
  const isBlocking = defender.state === "block" && facingOpponent;
  if(isBlocking){
    const chip = Math.max(1, Math.round(dmg*0.12));
    defender.health = Math.max(0, defender.health - chip);
    SFX.block();
    spawnParticles(defender.x + (attacker.x<defender.x?-24:24), defender.y-70, "#cfd6de", 6);
    defender.vx = (defender.x < attacker.x ? -1 : 1) * 60;
  } else {
    defender.health = Math.max(0, defender.health - dmg);
    defender.state = "hit";
    defender.stateTime = 0;
    defender.hitFlash = 180;
    const dir = attacker.x < defender.x ? 1 : -1;
    defender.vx = dir * 320;
    SFX.hit();
    spawnParticles(defender.x, defender.y-70, "#ffdd55", 10);
    state.shake = 8;
  }
  updateHealthBars();
  if(defender.health <= 0 && defender.state !== "ko"){
    defender.state = "ko";
    defender.stateTime = 0;
    SFX.ko();
    endRound("ko");
  }
}

function spawnParticles(x,y,color,count){
  for(let i=0;i<count;i++){
    state.particles.push({
      x, y,
      vx:(Math.random()-0.5)*260,
      vy:(Math.random()-0.9)*260,
      life: 400 + Math.random()*200,
      maxLife: 500,
      color
    });
  }
}

function updateHealthBars(){
  el.p1Health.style.width = Math.max(0,(state.p1.health/state.p1.maxHealth*100)) + "%";
  el.p2Health.style.width = Math.max(0,(state.p2.health/state.p2.maxHealth*100)) + "%";
}

/* ============================================================
   UPDATE LOGIC
   ============================================================ */
function readInput(f, keymap, isCPU){
  if(isCPU) return; // handled separately in updateCPU
  const held = {
    left: state.keys.has(keymap.left),
    right: state.keys.has(keymap.right),
    jump: state.keys.has(keymap.jump),
    block: state.keys.has(keymap.block)
  };
  const pressed = {
    jump: state.justPressed.has(keymap.jump),
    punch: state.justPressed.has(keymap.punch),
    kick: state.justPressed.has(keymap.kick),
    special: state.justPressed.has(keymap.special)
  };
  applyIntent(f, held, pressed);
}

function applyIntent(f, held, pressed){
  const canAct = f.state!=="hit" && f.state!=="ko";
  const canMove = canAct && f.state!=="punch" && f.state!=="kick" && f.state!=="special" && f.state!=="block";

  if(canMove){
    if(held.left && !held.right){ f.vx = -MOVE_SPEED * f.def.stats.speed; f.state = (f.y>=GROUND_Y)? "walk":f.state; }
    else if(held.right && !held.left){ f.vx = MOVE_SPEED * f.def.stats.speed; f.state = (f.y>=GROUND_Y)?"walk":f.state; }
    else { f.vx = 0; if(f.state==="walk") f.state="idle"; }

    if(pressed.jump && f.y >= GROUND_Y){
      f.vy = JUMP_V;
      f.state = "jump";
      SFX.jump();
    }
  }

  if(canAct && held.block && f.y>=GROUND_Y && f.state!=="punch" && f.state!=="kick" && f.state!=="special"){
    f.state = "block";
    f.vx = 0;
  } else if(f.state==="block" && !held.block){
    f.state = "idle";
  }

  if(canAct && f.y>=GROUND_Y && f.state!=="block"){
    if(pressed.punch) startAttack(f,"punch");
    else if(pressed.kick) startAttack(f,"kick");
    else if(pressed.special) startAttack(f,"special");
  } else if(canAct){
    // aerial attacks (punch/kick only)
    if(pressed.punch && f.state!=="punch" && f.state!=="kick") startAttack(f,"punch");
    else if(pressed.kick && f.state!=="punch" && f.state!=="kick") startAttack(f,"kick");
  }
}

function updateCPU(f, opp, dt){
  f.aiTimer -= dt;
  const dist = distanceBetween(f,opp);
  const canAct = f.state!=="hit" && f.state!=="ko";
  const canMove = canAct && f.state!=="punch" && f.state!=="kick" && f.state!=="special" && f.state!=="block";

  if(f.aiTimer <= 0){
    f.aiTimer = 220 + Math.random()*180;
    const inRange = dist < f.def.stats.punchRange + 10;
    if(!inRange){
      f.aiDecision = Math.random()<0.08 ? "jump" : "approach";
    } else {
      const oppAttacking = opp.state==="punch"||opp.state==="kick"||opp.state==="special";
      const r = Math.random();
      if(oppAttacking && r<0.45) f.aiDecision = "block";
      else if(r<0.42) f.aiDecision = "punch";
      else if(r<0.68) f.aiDecision = "kick";
      else if(r<0.85 && f.specialCd<=0) f.aiDecision = "special";
      else if(r<0.93) f.aiDecision = "retreat";
      else f.aiDecision = "wait";
    }
  }

  if(canMove){
    if(f.aiDecision === "approach"){
      f.vx = (opp.x > f.x ? 1 : -1) * MOVE_SPEED * f.def.stats.speed;
      f.state = "walk";
    } else if(f.aiDecision === "retreat"){
      f.vx = (opp.x > f.x ? -1 : 1) * MOVE_SPEED * f.def.stats.speed * 0.8;
      f.state = "walk";
    } else if(f.aiDecision === "jump" && f.y>=GROUND_Y){
      f.vy = JUMP_V; f.state="jump"; SFX.jump();
    } else {
      f.vx = 0;
      if(f.state==="walk") f.state = "idle";
    }
  }

  if(canAct && f.aiDecision==="block" && f.y>=GROUND_Y && f.state!=="punch" && f.state!=="kick" && f.state!=="special"){
    f.state = "block"; f.vx = 0;
  } else if(f.state==="block" && f.aiDecision!=="block"){
    f.state = "idle";
  }

  if(canAct && f.y>=GROUND_Y){
    const inRange = dist < f.def.stats.punchRange + 10;
    if(inRange){
      if(f.aiDecision==="punch") startAttack(f,"punch");
      else if(f.aiDecision==="kick") startAttack(f,"kick");
      else if(f.aiDecision==="special") startAttack(f,"special");
    }
  }
}

function fireProjectile(owner, opp){
  state.projectiles.push({
    owner: owner.side,
    x: owner.x + owner.facing*30,
    y: owner.y - 78,
    vx: owner.facing * 620,
    dmg: owner.def.stats.specialDmg,
    life: 900
  });
}

function updateProjectiles(dt){
  for(let i=state.projectiles.length-1;i>=0;i--){
    const p = state.projectiles[i];
    p.x += p.vx * dt/1000;
    p.life -= dt;
    const target = p.owner==="p1" ? state.p2 : state.p1;
    if(target.state!=="ko" && Math.abs(p.x-target.x) < 34 && Math.abs(p.y-(target.y-78)) < 60){
      applyDamage(p.owner==="p1"?state.p1:state.p2, target, p.dmg, true);
      state.projectiles.splice(i,1);
      continue;
    }
    if(p.life<=0 || p.x<0 || p.x>CW) state.projectiles.splice(i,1);
  }
}

function updateFighterPhysics(f, dt){
  const dts = dt/1000;
  if(f.state==="hit" || f.state==="block"){
    f.vx *= Math.pow(0.001, dts);
    if(Math.abs(f.vx) < 4) f.vx = 0;
  }
  f.x += f.vx * dts;
  f.x += f.knockbackX * dts;
  f.knockbackX *= 0.001 ** dts;
  if(Math.abs(f.knockbackX) < 2) f.knockbackX = 0;

  f.x = Math.max(STAGE_L, Math.min(STAGE_R, f.x));

  f.vy += GRAVITY * dts;
  f.y += f.vy * dts;
  if(f.y >= GROUND_Y){
    f.y = GROUND_Y; f.vy = 0;
    if(f.state==="jump") f.state = "idle";
  }

  if(f.state==="walk"){ f.walkPhase += dts*10; }
  else { f.walkPhase = 0; }

  if(f.hitFlash>0) f.hitFlash -= dt;
}

function updateAttackStates(f, opp, dt){
  if(f.state==="punch" || f.state==="kick"){
    f.stateTime += dt;
    const timing = ATTACK_TIMING[f.state];
    if(!f.attackHasHit && f.stateTime>=timing.activeStart && f.stateTime<=timing.activeEnd){
      const range = f.state==="punch" ? f.def.stats.punchRange : f.def.stats.kickRange;
      const facingOpponent = (f.facing===1 && opp.x>=f.x) || (f.facing===-1 && opp.x<=f.x);
      if(facingOpponent && distanceBetween(f,opp) <= range && opp.state!=="ko"){
        const dmg = f.state==="punch" ? f.def.stats.punchDmg : f.def.stats.kickDmg;
        applyDamage(f, opp, dmg, true);
        f.attackHasHit = true;
      }
    }
    if(f.stateTime >= timing.total){
      f.state = f.y>=GROUND_Y ? "idle" : "jump";
      f.stateTime = 0;
    }
  } else if(f.state==="special"){
    f.stateTime += dt;
    const timing = specialTiming(f.type);

    if(f.type==="skeleton" && !f.attackHasHit && f.stateTime>=timing.activeStart){
      fireProjectile(f, opp);
      f.attackHasHit = true;
    }
    if(f.type==="enderman" && !f.teleportUsed && f.stateTime>=timing.activeStart*0.5){
      const offset = 90;
      f.x = opp.x + (opp.x > f.x ? -offset : offset);
      f.x = Math.max(STAGE_L, Math.min(STAGE_R, f.x));
      f.facing = opp.x > f.x ? 1 : -1;
      f.teleportUsed = true;
      spawnParticles(f.x, f.y-70, "#c86bff", 14);
    }
    if(f.type!=="skeleton" && !f.attackHasHit && f.stateTime>=timing.activeStart && f.stateTime<=timing.activeEnd){
      const range = f.def.stats.specialRange;
      const facingOpponent = (f.facing===1 && opp.x>=f.x) || (f.facing===-1 && opp.x<=f.x);
      if(facingOpponent && distanceBetween(f,opp) <= range && opp.state!=="ko"){
        applyDamage(f, opp, f.def.stats.specialDmg, true);
        f.attackHasHit = true;
        if(f.type==="creeper") state.shake = 16;
      }
    }
    if(f.stateTime >= timing.total){
      f.state = f.y>=GROUND_Y ? "idle" : "jump";
      f.stateTime = 0;
    }
  } else if(f.state==="hit"){
    f.stateTime += dt;
    if(f.stateTime >= 260){ f.state = "idle"; f.stateTime=0; }
  }

  if(f.specialCd>0) f.specialCd = Math.max(0, f.specialCd - dt);
}

function updateFacing(f, opp){
  if(f.state==="punch"||f.state==="kick"||f.state==="special"||f.state==="hit"||f.state==="ko"||f.state==="block") return;
  f.facing = opp.x >= f.x ? 1 : -1;
}

function update(dt){
  if(state.screen !== "fighting") return;
  if(state.freeze){ state.justPressed.clear(); return; }

  state.timerAccum += dt;
  if(state.timerAccum >= 1000){
    state.timerAccum -= 1000;
    state.roundTimer -= 1;
    el.hudTimer.textContent = Math.max(0,state.roundTimer);
    if(state.roundTimer <= 0){
      state.roundTimer = 0;
      state.freeze = true;
      endRound("timeout");
      return;
    }
  }

  const p1 = state.p1, p2 = state.p2;

  readInput(p1, P1_KEYS, false);
  if(p2.isCPU) updateCPU(p2, p1, dt); else readInput(p2, P2_KEYS, false);

  updateFacing(p1,p2);
  updateFacing(p2,p1);

  updateAttackStates(p1, p2, dt);
  updateAttackStates(p2, p1, dt);

  updateFighterPhysics(p1, dt);
  updateFighterPhysics(p2, dt);

  updateProjectiles(dt);

  // particles
  for(let i=state.particles.length-1;i>=0;i--){
    const pt = state.particles[i];
    pt.x += pt.vx*dt/1000; pt.y += pt.vy*dt/1000;
    pt.vy += 900*dt/1000;
    pt.life -= dt;
    if(pt.life<=0) state.particles.splice(i,1);
  }

  if(state.shake>0) state.shake = Math.max(0, state.shake - dt*0.05);

  state.justPressed.clear();
}

/* ============================================================
   RENDERING
   ============================================================ */
function drawBackground(ts){
  // sky
  const grad = ctx.createLinearGradient(0,0,0,GROUND_Y);
  grad.addColorStop(0, "#3a6ea8");
  grad.addColorStop(1, "#8fc6e8");
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,CW,GROUND_Y);

  // sun (blocky)
  ctx.fillStyle = "#fff3b0";
  ctx.fillRect(760,40,46,46);
  ctx.fillStyle = "#ffe27a";
  ctx.fillRect(768,48,30,30);

  // clouds
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const cloudOffset = (state.bgOffset*0.2) % (CW+200) - 100;
  [ [cloudOffset,70],[cloudOffset+300,110],[cloudOffset+560,60] ].forEach(([cx,cy])=>{
    for(let i=0;i<4;i++) ctx.fillRect(cx+i*18, cy, 16,16);
    ctx.fillRect(cx+18,cy-16,16,16);
  });

  // distant hills
  ctx.fillStyle = "#4f8f52";
  for(let x=0;x<CW;x+=40){
    const h = 30 + Math.round(Math.sin(x*0.02)*10);
    ctx.fillRect(x, GROUND_Y-h, 40, h);
  }

  // ground blocks
  const blockSize = 40;
  for(let x=0; x<CW; x+=blockSize){
    ctx.fillStyle = "#5fa632";
    ctx.fillRect(x, GROUND_Y, blockSize, 10);
    ctx.fillStyle = "#4f8c28";
    ctx.fillRect(x, GROUND_Y+8, blockSize, 4);
    for(let y=GROUND_Y+12; y<CH; y+=blockSize){
      ctx.fillStyle = ((x/blockSize + y/blockSize) % 2 === 0) ? "#7a5230" : "#6f4a2a";
      ctx.fillRect(x,y,blockSize,blockSize);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(x+4,y+4,6,6);
      ctx.fillRect(x+24,y+18,5,5);
    }
  }
}

function rect(c,x,y,w,h,color){
  c.fillStyle = color;
  c.fillRect(x,y,w,h);
}

/**
 * Draws a fighter built from simple blocky rectangles (voxel style).
 * scale: size multiplier (used for small select-screen icons)
 * iconMode: if true, always draws idle pose centered at (f.x,f.y)
 */
function drawFighter(c, f, scale, iconMode){
  scale = scale || 1;
  const pal = f.def.palette;
  const variant = f.def.variant;
  const facing = f.facing || 1;

  c.save();
  c.translate(f.x, f.y);
  c.scale(facing*scale, scale);

  const isHitFlash = f.hitFlash && f.hitFlash>0 && Math.floor(f.hitFlash/60)%2===0;
  const flashColor = "#ffffff";

  let bob = 0, legOffsetL=0, legOffsetR=0, armSwingL=0, armSwingR=0, lean=0;
  if(!iconMode){
    if(f.state==="walk"){
      bob = Math.abs(Math.sin(f.walkPhase))*3;
      legOffsetL = Math.sin(f.walkPhase)*10;
      legOffsetR = -Math.sin(f.walkPhase)*10;
      armSwingL = -Math.sin(f.walkPhase)*8;
      armSwingR = Math.sin(f.walkPhase)*8;
    }
    if(f.state==="jump"){ bob=-6; legOffsetL=6; legOffsetR=6; }
    if(f.state==="block"){ lean=6; }
    if(f.state==="punch"){ armSwingR = -30 * Math.min(1,f.stateTime/120); lean=4; }
    if(f.state==="kick"){ legOffsetR = -26*Math.min(1,f.stateTime/180); lean=6; }
    if(f.state==="special"){ armSwingR=-40; armSwingL=-10; lean=8; }
    if(f.state==="hit"){ lean=-8; }
    if(f.state==="ko"){ lean=-30; bob=20; }
  }

  const legW=14, legH=40, torsoW=32, torsoH=36, headW=28, headH=26, armW=10, armH=34;

  // legs
  rect(c, -legW-2+legOffsetL*0.3, -legH+bob, legW, legH, pal.pantsDark);
  rect(c, 2+legOffsetR*0.3, -legH+bob, legW, legH, pal.pants);

  c.save();
  c.translate(lean*0.4,0);

  // back arm
  c.save();
  c.translate(-torsoW/2-2, -legH-torsoH+10+bob);
  c.rotate((armSwingL)*Math.PI/180);
  rect(c,-armW/2,0,armW,armH, pal.shirtDark);
  rect(c,-armW/2,armH-8,armW,10, pal.skin);
  c.restore();

  // torso
  rect(c, -torsoW/2, -legH-torsoH+bob, torsoW, torsoH, pal.shirt);
  rect(c, -torsoW/2, -legH-torsoH+bob, torsoW, 8, pal.shirtDark);

  if(variant==="creeper"){
    // creeper face blocks on chest-ish head (no separate limbs look, blockier)
  }

  // head
  const headY = -legH-torsoH-headH+bob + (variant==="tall"?-14:0);
  const headHActual = variant==="tall" ? headH+14 : headH;
  rect(c, -headW/2, headY, headW, headHActual, pal.skin);
  // simple face: eyes
  if(variant==="creeper"){
    rect(c,-8,headY+8,6,8,"#0c0c0c");
    rect(c,2,headY+8,6,8,"#0c0c0c");
    rect(c,-6,headY+16,12,6,"#0c0c0c");
    rect(c,-6,headY+20,4,4,"#0c0c0c");
    rect(c,2,headY+20,4,4,"#0c0c0c");
  } else {
    rect(c,-8,headY+9,5,5, pal.eye);
    rect(c,3,headY+9,5,5, pal.eye);
    if(f.def.name==="Skeleton"){
      rect(c,-headW/2,headY+headHActual-4,headW,4,"#8b8672");
    }
  }
  if(pal.hair && pal.hair!=="#00000000"){
    rect(c,-headW/2-1,headY-4,headW+2,7,pal.hair);
  }

  // front arm (weapon-bearing)
  c.save();
  c.translate(torsoW/2+2, -legH-torsoH+10+bob);
  c.rotate((armSwingR)*Math.PI/180);
  rect(c,-armW/2,0,armW,armH, pal.shirt);
  rect(c,-armW/2,armH-8,armW,10, pal.skin);

  // weapon / effect per state
  if(f.state==="punch" && !iconMode){
    rect(c,-4,armH-6,26,6,"#ffe27a");
  }
  if(f.state==="special" && !iconMode){
    if(f.type==="steve"){
      c.save();
      c.rotate(-25*Math.PI/180);
      rect(c,4,armH-6,46,7,"#cfd6de");
      rect(c,4,armH-6,10,7,"#8a6d3b");
      c.restore();
    } else if(f.type==="skeleton"){
      rect(c,4,armH-10,4,26,"#8a6d3b");
    }
  }
  c.restore();

  c.restore(); // lean

  // creeper "arms" are stubby — draw small stub over torso sides for variant
  if(variant==="creeper" && !iconMode){
    // (arms already drawn generically above for gameplay clarity)
  }

  // KO flash / hit flash overlay
  if(isHitFlash){
    c.globalAlpha = 0.5;
    c.fillStyle = flashColor;
    c.fillRect(-torsoW, -legH-torsoH-headH-10, torsoW*2, legH+torsoH+headH+20);
    c.globalAlpha = 1;
  }

  c.restore();

  // ground shadow
  if(!iconMode){
    c.save();
    c.globalAlpha = 0.3;
    c.fillStyle = "#000";
    const shrink = Math.max(0.4, 1-(GROUND_Y-f.y)/300);
    c.beginPath();
    c.ellipse(f.x, GROUND_Y+6, 26*shrink, 7*shrink, 0,0,Math.PI*2);
    c.fill();
    c.restore();
  }
}

function drawProjectiles(){
  state.projectiles.forEach(p=>{
    ctx.save();
    ctx.translate(p.x,p.y);
    ctx.fillStyle = "#e5e2d6";
    ctx.fillRect(-10,-2,20,4);
    ctx.fillStyle = "#8a6d3b";
    ctx.fillRect(p.vx>0?-12:8,-3,4,6);
    ctx.restore();
  });
}

function drawParticles(){
  state.particles.forEach(pt=>{
    ctx.globalAlpha = Math.max(0, pt.life/pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x-3,pt.y-3,6,6);
    ctx.globalAlpha = 1;
  });
}

function render(ts){
  ctx.save();
  if(state.shake>0){
    const dx = (Math.random()-0.5)*state.shake;
    const dy = (Math.random()-0.5)*state.shake;
    ctx.translate(dx,dy);
  }
  ctx.clearRect(-30,-30,CW+60,CH+60);
  drawBackground(ts);

  if(state.screen==="fighting" || state.screen==="roundend" || state.screen==="matchend"){
    const order = state.p1.x < state.p2.x ? [state.p1,state.p2] : [state.p2,state.p1];
    order.forEach(f=> drawFighter(ctx, f, 1, false));
    drawProjectiles();
    drawParticles();
  }
  ctx.restore();
}

/* ============================================================
   MAIN LOOP
   ============================================================ */
function loop(ts){
  if(isPaused) return;
  if(state.lastTs===null) state.lastTs = ts;
  let dt = ts - state.lastTs;
  state.lastTs = ts;
  if(dt>50) dt = 50; // clamp to avoid spiral of death
  state.bgOffset += dt*0.02;

  update(dt);
  render(ts);

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* initial idle background render on title screen */
render(0);

})();