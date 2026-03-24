// ================================================================
// KOMBAT.IO — game.js  (versão avançada)
// ================================================================

// ── Constantes ───────────────────────────────────────────────────
var CW=800, CH=450, GY=370;
var GRAV=0.58, JF=-14, SPD=4.5;
var MAX_HP=100, RSEC=99;
var PDMG=8, KDMG=15;
var ARANGE=88, ADUR=320, HCD=480;

// ── Estado global ────────────────────────────────────────────────
var socket=null, myNum=0, roomId='';
var running=false, overFired=false;
var timerIv=null, timeLeft=RSEC, lastSent='';

// ── Touch ────────────────────────────────────────────────────────
var isMobile = ('ontouchstart' in window)||(navigator.maxTouchPoints>0);
var touchKeys = {L:false,R:false,U:false,P:false,K:false};

// ── Canvas principal ─────────────────────────────────────────────
var canvas = document.getElementById('game-canvas');
var ctx    = canvas.getContext('2d');
canvas.width=CW; canvas.height=CH;

function fitCanvas() {
  var wrap = document.querySelector('.canvas-wrap');
  if (!wrap) return;
  var w=wrap.clientWidth, h=wrap.clientHeight;
  var sc=Math.min(w/CW, h/CH);
  canvas.style.width  = Math.round(CW*sc)+'px';
  canvas.style.height = Math.round(CH*sc)+'px';
}
window.addEventListener('resize', fitCanvas);

// ================================================================
// SISTEMA DE PARTÍCULAS AVANÇADO
// ================================================================
var particles = [];

function spawnParticles(x, y, color, count, power) {
  for (var i=0; i<count; i++) {
    var ang = Math.random()*Math.PI*2;
    var spd = (0.5+Math.random())*power;
    particles.push({
      x:x, y:y,
      vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd - Math.random()*power*0.5,
      color:color,
      size:2+Math.random()*4,
      life:1, decay:0.03+Math.random()*0.04,
      type: Math.random()<0.5 ? 'square' : 'circle'
    });
  }
}

function spawnHitSpark(x, y, color) {
  // Linha de impacto
  for (var i=0; i<6; i++) {
    var ang = -Math.PI/2 + (Math.random()-0.5)*Math.PI;
    particles.push({
      x:x, y:y,
      vx:Math.cos(ang)*(3+Math.random()*5),
      vy:Math.sin(ang)*(3+Math.random()*5),
      color:'#fff', size:1+Math.random()*2,
      life:1, decay:0.08+Math.random()*0.06, type:'circle'
    });
  }
  spawnParticles(x, y, color, 8, 4);
}

function spawnBlood(x, y, color) {
  spawnParticles(x, y, color, 12, 5);
  // Estrelinhas douradas no impacto forte
  spawnParticles(x, y, '#ffdd44', 4, 6);
}

function updateParticles() {
  var alive=[];
  for (var i=0; i<particles.length; i++) {
    var p=particles[i];
    p.x+=p.vx; p.y+=p.vy; p.vy+=0.18; p.vx*=0.96; p.life-=p.decay;
    if (p.life>0) alive.push(p);
  }
  particles=alive;
}

function drawParticles() {
  for (var i=0; i<particles.length; i++) {
    var p=particles[i];
    ctx.globalAlpha = Math.max(0,p.life);
    ctx.fillStyle=p.color;
    if (p.type==='circle') {
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.size*p.life,0,Math.PI*2);
      ctx.fill();
    } else {
      var s=p.size*p.life;
      ctx.fillRect(p.x-s/2, p.y-s/2, s, s);
    }
  }
  ctx.globalAlpha=1;
}

// ================================================================
// EFEITOS DE CÂMERA
// ================================================================
var camShake = {x:0, y:0, intensity:0};

function shakeCamera(power) {
  camShake.intensity = power;
}

function updateCamera() {
  if (camShake.intensity > 0.1) {
    camShake.x = (Math.random()-0.5)*camShake.intensity*6;
    camShake.y = (Math.random()-0.5)*camShake.intensity*4;
    camShake.intensity *= 0.75;
  } else {
    camShake.x=0; camShake.y=0; camShake.intensity=0;
  }
}

// ================================================================
// CLASSE FIGHTER — gráficos avançados
// ================================================================
function Fighter(x, n) {
  this.x=x; this.y=GY;
  this.w=52; this.h=90;
  this.vx=0; this.vy=0;
  this.onGround=true;
  this.hp=MAX_HP; this.n=n;
  this.facing = n===1 ? 1 : -1;
  this.color  = n===1 ? '#ff3355' : '#2299ff';
  this.color2 = n===1 ? '#ff7799' : '#66bbff';
  this.dark   = n===1 ? '#880022' : '#113366';
  this.state='idle'; this.stTs=0;
  this.atk=false; this.atkT=null; this.lastHit=0;
  this.flash=0; this.frame=0; this.tick=0;
  // Efeito de power charge
  this.chargeAura=0;
  // Trail de movimento
  this.trail=[];
  // Estado previo para trail
  this.prevX=x; this.prevY=GY;
}

Fighter.prototype.ss = function(s) {
  if (this.state==='dead') return;
  this.state=s; this.stTs=Date.now();
};

Fighter.prototype.jump = function() {
  if (!this.onGround||this.state==='dead') return;
  this.vy=JF; this.onGround=false; this.ss('jump');
  spawnParticles(this.x+this.w/2, this.y, 'rgba(255,255,255,0.4)', 5, 2);
};

Fighter.prototype.doAtk = function(t) {
  if (this.atk||this.state==='dead') return false;
  this.atk=true; this.atkT=t; this.ss(t);
  this.chargeAura=1;
  return true;
};

Fighter.prototype.hit = function(d, isKick) {
  if (this.state==='dead') return;
  this.hp=Math.max(0, this.hp-d);
  this.flash=12;
  var hx=this.x+this.w/2, hy=this.y-this.h*0.5;
  spawnBlood(hx, hy, this.color);
  if (isKick) shakeCamera(3); else shakeCamera(2);
  if (this.hp<=0) { this.ss('dead'); }
  else {
    var self=this;
    this.ss('hurt');
    setTimeout(function(){if(self.state==='hurt')self.ss('idle');},320);
  }
};

Fighter.prototype.atkBox = function() {
  if (!this.atk) return null;
  var r = this.atkT==='kick' ? ARANGE*1.25 : ARANGE;
  var ox = this.facing>0 ? this.w : -r;
  return {x:this.x+ox, y:this.y-this.h*0.7, w:r, h:36};
};

Fighter.prototype.bodyBox = function() {
  return {x:this.x+6, y:this.y-this.h, w:this.w-12, h:this.h};
};

Fighter.prototype.update = function() {
  // Trail
  if (Math.abs(this.x-this.prevX)>1 || Math.abs(this.y-this.prevY)>1) {
    this.trail.push({x:this.x+this.w/2, y:this.y-this.h/2, life:1});
  }
  this.prevX=this.x; this.prevY=this.y;
  this.trail=this.trail.map(function(t){return{x:t.x,y:t.y,life:t.life-0.12};}).filter(function(t){return t.life>0;});

  if (!this.onGround) this.vy+=GRAV;
  this.x+=this.vx; this.y+=this.vy;
  if (this.y>=GY) {
    this.y=GY; this.vy=0; this.onGround=true;
    if (this.state==='jump') {
      this.ss('idle');
      spawnParticles(this.x+this.w/2, this.y+2, 'rgba(200,200,255,0.3)', 6, 1.5);
    }
  }
  this.x=Math.max(6, Math.min(CW-this.w-6, this.x));
  if (this.atk && Date.now()-this.stTs>ADUR) {
    this.atk=false; this.atkT=null;
    if (this.state!=='hurt'&&this.state!=='dead') this.ss('idle');
  }
  if (this.flash>0) this.flash--;
  if (this.chargeAura>0) this.chargeAura=Math.max(0,this.chargeAura-0.06);
  this.tick++;
  if (this.tick%6===0) this.frame=(this.frame+1)%8;
};

Fighter.prototype.draw = function(c) {
  var cx=this.x+this.w/2, by=this.y, f=this.facing;
  var bob   = this.state==='walk' ? Math.sin(this.frame*0.8)*3 : 0;
  var idleBob = this.state==='idle' ? Math.sin(this.tick*0.06)*1.5 : 0;
  bob+=idleBob;
  var str   = this.state==='jump' ? (this.vy<0 ? 0.84 : 1.15) : 1;
  var shk   = this.state==='hurt' ? (Math.random()-0.5)*5 : 0;
  var dead  = this.state==='dead';

  // Trail de velocidade
  for (var ti=0; ti<this.trail.length; ti++) {
    var t=this.trail[ti];
    c.globalAlpha=t.life*0.15;
    c.fillStyle=this.color;
    c.beginPath(); c.arc(t.x,t.y,12*t.life,0,Math.PI*2); c.fill();
  }
  c.globalAlpha=1;

  // Aura de ataque
  if (this.chargeAura>0.1) {
    var ag=c.createRadialGradient(cx,by-this.h*0.4,0,cx,by-this.h*0.4,40*this.chargeAura);
    ag.addColorStop(0, this.color.replace(')',','+this.chargeAura*0.6+')').replace('rgb','rgba'));
    ag.addColorStop(1,'transparent');
    c.fillStyle=ag; c.beginPath(); c.arc(cx,by-this.h*0.4,50,0,Math.PI*2); c.fill();
  }

  // Sombra dinâmica
  var shadowW=32+Math.abs(this.vx)*2;
  var shadowAlpha=dead?0.1:0.3;
  c.save(); c.globalAlpha=shadowAlpha;
  c.fillStyle='#000';
  c.beginPath(); c.ellipse(cx, by+5, shadowW, 8, 0, 0, Math.PI*2); c.fill();
  c.restore();

  c.save();
  if (this.flash%2===1) { c.globalAlpha=0.4; }

  if (dead) {
    // Personagem caído
    c.save();
    c.translate(cx, by);
    c.rotate(f>0 ? Math.PI/2 : -Math.PI/2);
    drawBody(c, 0, -this.w/2, this);
    c.restore();
    c.restore();
    this._drawParticles(c);
    return;
  }

  // ── CORPO ──────────────────────────────────
  var ty = by - 82*str + bob + shk;

  // Pernas
  var lc=this.dark;
  c.fillStyle=lc;
  if (this.state==='kick'&&this.atk) {
    // Perna de suporte
    c.beginPath();
    c.roundRect(cx-12+shk, by-38+bob, 13, 38*str, 4);
    c.fill();
    // Perna chutando
    c.fillStyle=this.color;
    var kx = f>0 ? cx+6 : cx-50;
    c.beginPath(); c.roundRect(kx, by-22, 44, 14, 4); c.fill();
    // Sola do pé
    c.fillStyle=this.color2;
    var sx = f>0 ? kx+38 : kx-6;
    c.beginPath(); c.roundRect(sx, by-24, 12, 18, 3); c.fill();
  } else {
    var walkSwing = this.state==='walk' ? Math.sin(this.frame*0.8)*8 : 0;
    // Perna esquerda
    c.beginPath(); c.roundRect(cx-15+shk, by-38+walkSwing+bob, 13, 38*str, 4); c.fill();
    // Perna direita
    c.beginPath(); c.roundRect(cx+2-shk,  by-38-walkSwing+bob, 13, 38*str, 4); c.fill();
    // Pés
    c.fillStyle=this.dark;
    c.beginPath(); c.roundRect(cx-17+shk, by-7+walkSwing+bob, 17, 9, 2); c.fill();
    c.beginPath(); c.roundRect(cx+1-shk,  by-7-walkSwing+bob, 17, 9, 2); c.fill();
  }

  // Torso
  c.fillStyle=this.color;
  c.beginPath(); c.roundRect(cx-20, ty+4, 40, 42*str, 5); c.fill();
  // Detalhe peito
  c.fillStyle=this.color2;
  c.beginPath(); c.roundRect(cx-12, ty+10, 24, 14*str, 3); c.fill();
  // Número do player
  c.fillStyle='rgba(0,0,0,0.5)';
  c.font='bold '+(11*str)+'px Rajdhani,Arial';
  c.textAlign='center';
  c.fillText('P'+this.n, cx, ty+21*str);

  // Cinto
  c.fillStyle=this.dark;
  c.beginPath(); c.roundRect(cx-20, ty+42*str, 40, 7, 2); c.fill();
  // Fivela
  c.fillStyle=this.color2;
  c.beginPath(); c.roundRect(cx-5, ty+43*str, 10, 5, 1); c.fill();

  // Braços
  var punchExt = (this.state==='punch'&&this.atk) ? 22 : 0;
  var armSwing = this.state==='walk' ? Math.sin(this.frame*0.8)*5 : 0;

  if (f>0) {
    // Braço esquerdo (atrás)
    c.fillStyle=lc;
    c.beginPath(); c.roundRect(cx-30, ty+8+armSwing, 12, 28, 4); c.fill();
    // Braço direito (frente / ataque)
    c.fillStyle=this.color;
    c.beginPath(); c.roundRect(cx+18, ty+8-armSwing+0, 12, 28-punchExt*0.5, 4); c.fill();
    if (this.state==='punch'&&this.atk) {
      // Extensão do braço socar
      c.fillStyle=this.color;
      c.beginPath(); c.roundRect(cx+18, ty+8, 12+punchExt, 16, 4); c.fill();
      // Luva
      c.fillStyle='#ffffff';
      c.beginPath(); c.arc(cx+34+punchExt, ty+16, 9, 0, Math.PI*2); c.fill();
      c.fillStyle=this.color2;
      c.beginPath(); c.arc(cx+34+punchExt, ty+16, 6, 0, Math.PI*2); c.fill();
      spawnHitSpark(cx+42+punchExt*0.5, ty+16, this.color);
    }
  } else {
    // Espelhado
    c.fillStyle=lc;
    c.beginPath(); c.roundRect(cx+18, ty+8+armSwing, 12, 28, 4); c.fill();
    c.fillStyle=this.color;
    c.beginPath(); c.roundRect(cx-30, ty+8-armSwing, 12, 28-punchExt*0.5, 4); c.fill();
    if (this.state==='punch'&&this.atk) {
      c.fillStyle=this.color;
      c.beginPath(); c.roundRect(cx-30-punchExt, ty+8, 12+punchExt, 16, 4); c.fill();
      c.fillStyle='#ffffff';
      c.beginPath(); c.arc(cx-34-punchExt, ty+16, 9, 0, Math.PI*2); c.fill();
      c.fillStyle=this.color2;
      c.beginPath(); c.arc(cx-34-punchExt, ty+16, 6, 0, Math.PI*2); c.fill();
    }
  }

  // Pescoço
  c.fillStyle='#e8c090';
  c.beginPath(); c.roundRect(cx-5, ty-6, 10, 12, 2); c.fill();

  // Cabeça
  var hbob = bob*0.4;
  var hy   = ty - 32;
  // Capacete/cabelo
  c.fillStyle=this.dark;
  c.beginPath(); c.ellipse(cx+shk*0.3, hy+10+hbob, 20, 22*str, 0, Math.PI, 0); c.fill();
  // Rosto
  c.fillStyle='#e8c090';
  c.beginPath(); c.ellipse(cx+shk*0.3, hy+14+hbob, 18, 19*str, 0, 0, Math.PI*2); c.fill();
  // Sombra do rosto
  c.fillStyle='rgba(0,0,0,0.08)';
  c.beginPath(); c.ellipse(cx+shk*0.3+3*f, hy+15+hbob, 10, 14*str, 0, 0, Math.PI*2); c.fill();

  // Expressão
  if (this.state==='hurt') {
    // Cara de dor
    c.fillStyle='#ff5500';
    c.beginPath(); c.arc(cx+f*5+shk, hy+11+hbob, 5, 0, Math.PI*2); c.fill();
    c.fillStyle='#fff';
    c.beginPath(); c.arc(cx+f*5+shk, hy+11+hbob, 2.5, 0, Math.PI*2); c.fill();
    // Boca aberta
    c.strokeStyle='#cc3300'; c.lineWidth=2;
    c.beginPath(); c.arc(cx+shk*0.3, hy+20+hbob, 5, 0, Math.PI); c.stroke();
  } else {
    // Olho
    c.fillStyle='#111';
    c.beginPath(); c.arc(cx+f*5+shk*0.3, hy+11+hbob, 4.5, 0, Math.PI*2); c.fill();
    c.fillStyle='#fff';
    c.beginPath(); c.arc(cx+f*5+shk*0.3, hy+11+hbob, 2, 0, Math.PI*2); c.fill();
    // Boca determinada
    c.fillStyle='rgba(0,0,0,0.3)';
    c.beginPath(); c.roundRect(cx-5+shk*0.3, hy+21+hbob, 10, 3, 1); c.fill();
  }

  // Viseira do capacete
  c.fillStyle=this.color;
  c.beginPath(); c.roundRect(cx-19, hy+2+hbob, 38, 10, 3); c.fill();
  c.fillStyle=this.color2;
  c.beginPath(); c.roundRect(cx-15, hy+4+hbob, 30, 5, 2); c.fill();

  c.restore();

  // Partículas
  this._drawParticles(c);
};

Fighter.prototype._drawParticles = function(c) {
  // (partículas gerais já são desenhadas no loop principal)
};

// ── Polyfill roundRect para browsers mais antigos
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r) {
    r=Math.min(r,w/2,h/2);
    this.beginPath();
    this.moveTo(x+r,y);
    this.lineTo(x+w-r,y); this.arcTo(x+w,y,x+w,y+r,r);
    this.lineTo(x+w,y+h-r); this.arcTo(x+w,y+h,x+w-r,y+h,r);
    this.lineTo(x+r,y+h); this.arcTo(x,y+h,x,y+h-r,r);
    this.lineTo(x,y+r); this.arcTo(x,y,x+r,y,r);
    this.closePath();
  };
}

function drawBody(c,x,y,f) {
  // Versão simplificada para o morto
  c.fillStyle=f.color; c.fillRect(x-20,y-10,40,20);
  c.fillStyle='#e8c090'; c.beginPath(); c.arc(x+22,y,10,0,Math.PI*2); c.fill();
}

// ── Instâncias ───────────────────────────────────────────────────
var p1 = new Fighter(140,1);
var p2 = new Fighter(610,2);

// ================================================================
// CANVAS DO LOBBY — preview animado dos personagens
// ================================================================
var prevCanvas = document.getElementById('preview-canvas');
var prevCtx    = prevCanvas ? prevCanvas.getContext('2d') : null;

function drawPreview() {
  if (!prevCtx) return;
  var w=prevCanvas.width, h=prevCanvas.height;
  prevCtx.clearRect(0,0,w,h);
  // Fundo gradiente
  var g=prevCtx.createLinearGradient(0,0,0,h);
  g.addColorStop(0,'#08080f'); g.addColorStop(1,'#12121e');
  prevCtx.fillStyle=g; prevCtx.fillRect(0,0,w,h);
  // Linha do chão
  var ng=prevCtx.createLinearGradient(0,0,w,0);
  ng.addColorStop(0,'transparent'); ng.addColorStop(0.3,'rgba(255,51,85,.5)');
  ng.addColorStop(0.5,'rgba(255,215,0,.5)'); ng.addColorStop(0.7,'rgba(34,153,255,.5)');
  ng.addColorStop(1,'transparent');
  prevCtx.fillStyle=ng; prevCtx.fillRect(0,h-2,w,2);
  // VS
  prevCtx.font='bold 28px "Press Start 2P",monospace';
  prevCtx.fillStyle='rgba(255,215,0,0.8)';
  prevCtx.textAlign='center';
  prevCtx.fillText('VS',w/2,h/2+10);
  // Personagem P1 mini
  drawMiniChar(prevCtx, 60, h-10, 1, Date.now());
  // Personagem P2 mini
  drawMiniChar(prevCtx, w-60, h-10, 2, Date.now());
}

function drawMiniChar(c, x, y, n, t) {
  var bob=Math.sin(t*0.002)*3;
  var col = n===1 ? '#ff3355' : '#2299ff';
  var dk  = n===1 ? '#880022' : '#113366';
  var col2= n===1 ? '#ff7799' : '#66bbff';
  var f   = n===1 ? 1 : -1;
  // Sombra
  c.fillStyle='rgba(0,0,0,0.4)';
  c.beginPath(); c.ellipse(x,y+3,18,5,0,0,Math.PI*2); c.fill();
  // Pernas
  c.fillStyle=dk;
  c.fillRect(x-10,y-30+bob,8,30);
  c.fillRect(x+2, y-30-bob,8,30);
  // Torso
  c.fillStyle=col;
  c.beginPath(); if(c.roundRect)c.roundRect(x-13,y-60+bob,26,28,3); else c.rect(x-13,y-60+bob,26,28); c.fill();
  c.fillStyle=col2;
  c.beginPath(); if(c.roundRect)c.roundRect(x-8,y-56+bob,16,10,2); else c.rect(x-8,y-56+bob,16,10); c.fill();
  // Braços
  c.fillStyle=col; c.fillRect(x-20,y-58+bob,8,20); c.fillRect(x+12,y-58+bob,8,20);
  // Cabeça
  c.fillStyle=dk; c.beginPath(); c.ellipse(x,y-70+bob,13,14,0,Math.PI,0); c.fill();
  c.fillStyle='#e8c090'; c.beginPath(); c.ellipse(x,y-66+bob,12,13,0,0,Math.PI*2); c.fill();
  c.fillStyle=col; c.fillRect(x-12,y-77+bob,24,8);
  c.fillStyle='#111'; c.beginPath(); c.arc(x+f*4,y-68+bob,3,0,Math.PI*2); c.fill();
}

// ================================================================
// FUNDO DA ARENA — avançado
// ================================================================
var bgTime=0;
// Estrelas de fundo
var stars=[];
for (var si=0; si<80; si++) {
  stars.push({x:Math.random()*CW, y:Math.random()*GY*0.7, r:Math.random()*1.5, s:0.5+Math.random()*0.5});
}

function drawBg() {
  bgTime+=0.01;

  // Gradiente principal do céu
  var sky=ctx.createLinearGradient(0,0,0,GY);
  sky.addColorStop(0,'#030308');
  sky.addColorStop(0.5,'#080814');
  sky.addColorStop(1,'#100820');
  ctx.fillStyle=sky; ctx.fillRect(0,0,CW,CH);

  // Estrelas piscando
  for (var i=0; i<stars.length; i++) {
    var st=stars[i];
    var alpha=st.s*(0.5+0.5*Math.sin(bgTime*2+i*1.3));
    ctx.globalAlpha=alpha;
    ctx.fillStyle='#ffffff';
    ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1;

  // Nuvens de néon ao fundo
  drawNeonCloud(ctx, CW*0.2, GY*0.3, 120, 50, 'rgba(255,30,80,0.04)');
  drawNeonCloud(ctx, CW*0.8, GY*0.25, 100, 40, 'rgba(30,100,255,0.05)');

  // Estrutura da arena ao fundo — arquibancadas
  ctx.fillStyle='rgba(15,10,30,0.9)';
  ctx.fillRect(0, GY*0.5, CW, GY*0.5);

  // Degraus da arquibancada
  for (var d=0; d<6; d++) {
    var dAlpha=0.04+d*0.015;
    ctx.fillStyle='rgba(255,255,255,'+dAlpha+')';
    ctx.fillRect(0, GY*0.5+d*14, CW, 2);
  }

  // Luzes das arquibancadas
  drawArenaLight(ctx, CW*0.15, GY*0.52, '#ff3355');
  drawArenaLight(ctx, CW*0.5,  GY*0.48, '#ffffff');
  drawArenaLight(ctx, CW*0.85, GY*0.52, '#2299ff');

  // Pilares laterais neon
  drawPillar(ctx, 55,  GY-160);
  drawPillar(ctx, CW-55, GY-160);

  // Chão da arena
  var floorGrad=ctx.createLinearGradient(0,GY-20,0,GY+CH);
  floorGrad.addColorStop(0,'#1a0a28');
  floorGrad.addColorStop(0.3,'#120820');
  floorGrad.addColorStop(1,'#080510');
  ctx.fillStyle=floorGrad;
  ctx.fillRect(0, GY-2, CW, CH-GY+2);

  // Grade perspectiva no chão
  ctx.strokeStyle='rgba(150,60,255,0.10)'; ctx.lineWidth=1;
  var gy2=GY+2;
  for (var li=0; li<=8; li++) {
    ctx.beginPath(); ctx.moveTo(0,gy2+li*14); ctx.lineTo(CW,gy2+li*14); ctx.stroke();
  }
  for (var li=-9; li<=9; li++) {
    ctx.beginPath(); ctx.moveTo(CW/2,gy2); ctx.lineTo(CW/2+li*60,gy2+112); ctx.stroke();
  }

  // Logo KOMBAT no centro do chão (tênue)
  ctx.save();
  ctx.globalAlpha=0.06;
  ctx.font='bold 48px "Press Start 2P",monospace';
  ctx.fillStyle='#ffffff';
  ctx.textAlign='center';
  ctx.fillText('KOMBAT', CW/2, GY+50);
  ctx.restore();

  // Linha neon do chão
  var nline=ctx.createLinearGradient(0,0,CW,0);
  nline.addColorStop(0,'transparent');
  nline.addColorStop(0.15,'rgba(255,51,85,0.9)');
  nline.addColorStop(0.5,'rgba(255,220,60,1)');
  nline.addColorStop(0.85,'rgba(34,153,255,0.9)');
  nline.addColorStop(1,'transparent');
  ctx.fillStyle=nline; ctx.fillRect(0,GY,CW,3);

  // Reflexo no chão
  ctx.fillStyle='rgba(255,200,60,0.04)'; ctx.fillRect(0,GY+3,CW,30);
}

function drawNeonCloud(c, x, y, w, h, color) {
  var g=c.createRadialGradient(x,y,0,x,y,w);
  g.addColorStop(0,color); g.addColorStop(1,'transparent');
  c.fillStyle=g; c.beginPath(); c.ellipse(x,y,w,h,0,0,Math.PI*2); c.fill();
}

function drawArenaLight(c, x, y, color) {
  var g=c.createRadialGradient(x,y,0,x,y,80);
  g.addColorStop(0,color.replace('rgb','rgba').replace(')',',0.15)'));
  g.addColorStop(1,'transparent');
  c.fillStyle=g; c.beginPath(); c.arc(x,y,80,0,Math.PI*2); c.fill();
}

function drawPillar(c, x, y) {
  // Corpo do pilar
  var pg=c.createLinearGradient(x-14,0,x+14,0);
  pg.addColorStop(0,'#0a0518'); pg.addColorStop(0.5,'#1a0a30'); pg.addColorStop(1,'#0a0518');
  c.fillStyle=pg; c.fillRect(x-14,y,28,GY-y+2);
  // Detalhe lateral
  c.fillStyle='rgba(150,60,255,0.3)'; c.fillRect(x-2,y,4,GY-y+2);
  // Topo do pilar
  c.fillStyle='#2a1048'; c.fillRect(x-20,y-12,40,18);
  c.fillStyle='rgba(150,60,255,0.5)'; c.fillRect(x-20,y-12,40,3);
  // Tocha/luz neon no topo
  var tg=c.createRadialGradient(x,y-18,2,x,y-18,60);
  tg.addColorStop(0,'rgba(255,180,60,0.7)');
  tg.addColorStop(0.3,'rgba(255,100,30,0.3)');
  tg.addColorStop(1,'transparent');
  c.fillStyle=tg; c.beginPath(); c.arc(x,y-18,60,0,Math.PI*2); c.fill();
  // Chama animada
  c.fillStyle='#ffcc40'; c.beginPath(); c.arc(x,y-18,5,0,Math.PI*2); c.fill();
  c.fillStyle='#ff8820'; c.beginPath(); c.arc(x,y-18+Math.sin(bgTime*8)*2,3,0,Math.PI*2); c.fill();
}

// ================================================================
// PARTÍCULAS DE FUNDO DO LOBBY
// ================================================================
var lobbyCanvas = document.getElementById('lobby-particles');
var lobbyCtx    = lobbyCanvas ? lobbyCanvas.getContext('2d') : null;
var lobbyPts    = [];
var lobbyAnim   = true;

function initLobbyParticles() {
  if (!lobbyCanvas) return;
  lobbyCanvas.width  = window.innerWidth;
  lobbyCanvas.height = window.innerHeight;
  lobbyPts=[];
  for (var i=0; i<60; i++) {
    lobbyPts.push({
      x:Math.random()*lobbyCanvas.width,
      y:Math.random()*lobbyCanvas.height,
      vy:-0.2-Math.random()*0.5,
      vx:(Math.random()-0.5)*0.3,
      r:1+Math.random()*2,
      alpha:Math.random(),
      color:Math.random()<0.5?'#ff3355':'#2299ff'
    });
  }
}

function animateLobby() {
  if (!lobbyCanvas || !lobbyCtx || !lobbyAnim) return;
  lobbyCtx.clearRect(0,0,lobbyCanvas.width,lobbyCanvas.height);

  // Gradiente de fundo escuro
  var bg=lobbyCtx.createRadialGradient(lobbyCanvas.width/2,lobbyCanvas.height,0,lobbyCanvas.width/2,lobbyCanvas.height,lobbyCanvas.height);
  bg.addColorStop(0,'rgba(30,5,60,0.6)');
  bg.addColorStop(0.5,'rgba(10,5,25,0.4)');
  bg.addColorStop(1,'rgba(0,0,0,0)');
  lobbyCtx.fillStyle=bg; lobbyCtx.fillRect(0,0,lobbyCanvas.width,lobbyCanvas.height);

  for (var i=0; i<lobbyPts.length; i++) {
    var p=lobbyPts[i];
    p.x+=p.vx; p.y+=p.vy;
    p.alpha+=0.01; if(p.alpha>1)p.alpha=0;
    if (p.y<-10) { p.y=lobbyCanvas.height+10; p.x=Math.random()*lobbyCanvas.width; }
    lobbyCtx.globalAlpha=p.alpha*(0.3+0.7*Math.abs(Math.sin(Date.now()*0.001+i)));
    lobbyCtx.fillStyle=p.color;
    lobbyCtx.beginPath(); lobbyCtx.arc(p.x,p.y,p.r,0,Math.PI*2); lobbyCtx.fill();
  }
  lobbyCtx.globalAlpha=1;

  // Preview dos personagens
  if (prevCtx) drawPreview();

  requestAnimationFrame(animateLobby);
}

window.addEventListener('resize', function() {
  if (lobbyCanvas) { lobbyCanvas.width=window.innerWidth; lobbyCanvas.height=window.innerHeight; }
  initLobbyParticles();
});
initLobbyParticles();
animateLobby();

// ================================================================
// INPUT
// ================================================================
var keys={};
window.addEventListener('keydown',function(e){
  keys[e.code]=true;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.code)>=0) e.preventDefault();
});
window.addEventListener('keyup',function(e){ keys[e.code]=false; });

function doInput() {
  if (!running||!myNum) return;
  var me=myNum===1?p1:p2;
  if (me.state==='dead') return;
  var K=myNum===1
    ?{L:'KeyA',R:'KeyD',U:'KeyW',P:'KeyF',K:'KeyG'}
    :{L:'ArrowLeft',R:'ArrowRight',U:'ArrowUp',P:'Comma',K:'Period'};
  var goL=keys[K.L]||touchKeys.L;
  var goR=keys[K.R]||touchKeys.R;
  var goU=keys[K.U]||touchKeys.U;
  var goP=keys[K.P]||touchKeys.P;
  var goK=keys[K.K]||touchKeys.K;
  if (goL){ me.vx=-SPD; me.facing=-1; if(me.onGround&&!me.atk)me.ss('walk'); }
  else if(goR){ me.vx=SPD; me.facing=1; if(me.onGround&&!me.atk)me.ss('walk'); }
  else { me.vx=0; if(me.state==='walk')me.ss('idle'); }
  if (goU) me.jump();
  if (goP) me.doAtk('punch');
  if (goK) me.doAtk('kick');
}

// ================================================================
// CONTROLES MOBILE
// ================================================================
function setupMobileControls() {
  var mc=document.getElementById('mobile-controls');
  if (!mc) return;
  mc.style.display = isMobile ? 'flex' : 'none';
  if (!isMobile) return;
  function bind(id,key) {
    var el=document.getElementById(id); if(!el)return;
    function on(e){ e.preventDefault(); touchKeys[key]=true; el.classList.add('pressed'); }
    function off(e){ e.preventDefault(); touchKeys[key]=false; el.classList.remove('pressed'); }
    el.addEventListener('touchstart',on,{passive:false});
    el.addEventListener('touchend',off,{passive:false});
    el.addEventListener('touchcancel',off,{passive:false});
    el.addEventListener('mousedown',on);
    el.addEventListener('mouseup',off);
    el.addEventListener('mouseleave',off);
  }
  bind('mb-left','L'); bind('mb-right','R'); bind('mb-up','U');
  bind('mb-punch','P'); bind('mb-kick','K');
}

// ================================================================
// REDE — WebSocket
// ================================================================
function wsSend(type,extra) {
  if (!socket||socket.readyState!==WebSocket.OPEN) return;
  var msg={type:type};
  if (extra) for(var k in extra) msg[k]=extra[k];
  socket.send(JSON.stringify(msg));
}

function connectAndDo(action,data) {
  if (socket&&socket.readyState!==WebSocket.CLOSED) {
    socket.onclose=null; socket.onerror=null; socket.onmessage=null;
    socket.close();
  }
 var url = 'wss://kombat-io.onrender.com';
try { socket = new WebSocket(url); }
catch(e){ setStatus('❌ Erro: '+e.message); return; }
  socket.onopen=function(){
    var msg={type:action};
    if(data) for(var k in data) msg[k]=data[k];
    socket.send(JSON.stringify(msg));
    setStatus('');
  };
  socket.onerror=function(){ setStatus('❌ Erro de conexão! O servidor está rodando?'); };
  socket.onclose=function(e){ console.log('WS fechou',e.code); };
  socket.onmessage=function(ev){
    var msg; try{msg=JSON.parse(ev.data);}catch(e){return;}
    handleMsg(msg);
  };
}

function handleMsg(msg) {
  if (msg.type==='room_created') {
    roomId=msg.roomId; myNum=msg.playerNumber;
    document.getElementById('room-code-display').textContent=roomId;
    showScreen('waiting-screen');
  }
  else if(msg.type==='room_joined') { roomId=msg.roomId; myNum=msg.playerNumber; }
  else if(msg.type==='game_start')  { startGame(); }
  else if(msg.type==='opponent_update') {
    var opp=myNum===1?p2:p1;
    opp.x=msg.x; opp.y=msg.y; opp.vx=msg.vx; opp.vy=msg.vy;
    opp.facing=msg.facing; opp.state=msg.state;
    opp.atk=msg.atk; opp.atkT=msg.atkT; opp.frame=msg.frame;
    if(msg.hp!==undefined&&Math.abs(opp.hp-msg.hp)>1) opp.hp=msg.hp;
  }
  else if(msg.type==='hit_registered') {
    if(msg.attackerPlayer!==myNum){
      var me=myNum===1?p1:p2;
      me.hit(msg.damage, msg.atkT==='kick');
      flashScreen(); updateHUD();
      if(me.hp<=0&&!overFired) endGame(msg.attackerPlayer);
    }
  }
  else if(msg.type==='game_over_broadcast') {
    if(!overFired){overFired=true;running=false;if(timerIv)clearInterval(timerIv);showResultScreen(msg.winner);}
  }
  else if(msg.type==='rematch_requested') {
    document.getElementById('result-status').textContent='⚔️ Oponente quer revanche!';
    wsSend('accept_rematch');
  }
  else if(msg.type==='rematch_start') { startGame(); }
  else if(msg.type==='opponent_disconnected') {
    running=false; if(timerIv)clearInterval(timerIv);
    showScreen('result-screen');
    document.getElementById('result-label').textContent='OPONENTE SAIU';
    document.getElementById('result-name').textContent='— VOCÊ VENCEU —';
    document.getElementById('result-status').textContent='Oponente desconectou.';
    document.getElementById('btn-rematch').disabled=true;
  }
  else if(msg.type==='join_error') { setStatus('❌ '+(msg.msg||'Erro')); showScreen('lobby-screen'); }
}

// ================================================================
// SINCRONIZAÇÃO
// ================================================================
function sendState() {
  if (!running||!myNum||!socket||socket.readyState!==WebSocket.OPEN) return;
  var me=myNum===1?p1:p2;
  var s={x:Math.round(me.x),y:Math.round(me.y),vx:me.vx,vy:me.vy,
         facing:me.facing,state:me.state,atk:me.atk,atkT:me.atkT,frame:me.frame,hp:me.hp};
  var str=JSON.stringify(s);
  if(str!==lastSent){wsSend('player_update',s);lastSent=str;}
}

// ================================================================
// HIT DETECTION
// ================================================================
function checkHits() {
  if (!running||!myNum) return;
  var atk=myNum===1?p1:p2, def=myNum===1?p2:p1;
  if (!atk.atk) return;
  var now=Date.now();
  if (now-atk.lastHit<HCD) return;
  var ab=atk.atkBox(), bb=def.bodyBox();
  if (!ab) return;
  if (ab.x<bb.x+bb.w&&ab.x+ab.w>bb.x&&ab.y<bb.y+bb.h&&ab.y+ab.h>bb.y) {
    atk.lastHit=now;
    var dmg=atk.atkT==='kick'?KDMG:PDMG;
    def.hit(dmg, atk.atkT==='kick');
    wsSend('attack_hit',{damage:dmg,atkT:atk.atkT});
    flashScreen(); updateHUD();
    if(def.hp<=0&&!overFired) endGame(myNum);
  }
}

// ================================================================
// HUD
// ================================================================
function updateHUD() {
  var h1=Math.max(0,p1.hp), h2=Math.max(0,p2.hp);
  document.getElementById('bar-p1').style.width=(h1/MAX_HP*100)+'%';
  document.getElementById('bar-p2').style.width=(h2/MAX_HP*100)+'%';
  document.getElementById('hp-p1').textContent=h1;
  document.getElementById('hp-p2').textContent=h2;
}

// ================================================================
// TIMER
// ================================================================
function startTimer() {
  timeLeft=RSEC;
  var el=document.getElementById('game-timer');
  el.className='hud-timer'; el.textContent=timeLeft;
  if(timerIv)clearInterval(timerIv);
  timerIv=setInterval(function(){
    if(!running){clearInterval(timerIv);return;}
    timeLeft--; el.textContent=timeLeft;
    if(timeLeft<=10)el.className='hud-timer urgent';
    if(timeLeft<=0){clearInterval(timerIv);if(!overFired){var w=p1.hp>=p2.hp?1:2;endGame(w,'TIME OUT');}}
  },1000);
}

// ================================================================
// FIM DE JOGO
// ================================================================
function endGame(winner,reason) {
  if(overFired)return;
  overFired=true; running=false;
  if(timerIv)clearInterval(timerIv);
  if(!reason)reason='KO';
  wsSend('game_over',{winner:winner,reason:reason});
  showOverlay(reason==='KO'?'K.O.!':'TIME OUT!','PLAYER '+winner+' VENCEU');
  setTimeout(function(){hideOverlay();showResultScreen(winner);},2600);
}

function showResultScreen(w) {
  showScreen('result-screen');
  document.getElementById('result-label').textContent = w===myNum?'VOCÊ VENCEU! 🏆':'VOCÊ PERDEU 💀';
  document.getElementById('result-name').textContent  = 'PLAYER '+w;
  document.getElementById('result-status').textContent='';
  document.getElementById('btn-rematch').disabled=false;
}

// ================================================================
// OVERLAY + FLASH
// ================================================================
function showOverlay(t,s) {
  document.getElementById('overlay-text').textContent=t||'';
  document.getElementById('overlay-sub').textContent=s||'';
  document.getElementById('game-overlay').style.display='flex';
}
function hideOverlay() { document.getElementById('game-overlay').style.display='none'; }
function flashScreen() {
  canvas.style.filter='brightness(2.5)';
  setTimeout(function(){canvas.style.filter='';},60);
}

// ================================================================
// INICIAR PARTIDA
// ================================================================
function startGame() {
  p1=new Fighter(140,1); p2=new Fighter(610,2);
  p1.facing=1; p2.facing=-1;
  particles=[];
  overFired=false; running=false; lastSent='';
  lobbyAnim=false;
  updateHUD(); showScreen('game-screen');
  setTimeout(fitCanvas,30);
  setupMobileControls();
  var steps=['ROUND 1','3','2','1','FIGHT! 🥊'];
  var idx=0;
  function tick(){
    showOverlay(steps[idx]); idx++;
    if(idx<steps.length){setTimeout(tick,750);}
    else{hideOverlay();running=true;startTimer();}
  }
  tick();
}

// ================================================================
// LOOP PRINCIPAL
// ================================================================
function loop() {
  ctx.save();
  ctx.translate(camShake.x, camShake.y);
  ctx.clearRect(-10,-10,CW+20,CH+20);
  drawBg();
  if(running)doInput();
  updateCamera();
  p1.update(); p2.update();
  updateParticles();
  p1.draw(ctx); p2.draw(ctx);
  drawParticles();
  ctx.restore();
  if(running){checkHits();sendState();}
  requestAnimationFrame(loop);
}

// ================================================================
// TELAS + NAVEGAÇÃO
// ================================================================
function showScreen(id) {
  var all=document.querySelectorAll('.screen');
  for(var i=0;i<all.length;i++) all[i].classList.remove('active');
  var el=document.getElementById(id);
  if(el) el.classList.add('active');
  // Retomando lobby: reinicia animação
  if(id==='lobby-screen') { lobbyAnim=true; animateLobby(); }
}

function setStatus(msg) {
  var el=document.getElementById('lobby-status');
  if(el) el.textContent=msg;
}

// ── Botões ───────────────────────────────────────────────────────
document.getElementById('btn-quick-match').addEventListener('click',function(){
  setStatus('⚡ Procurando oponente...'); connectAndDo('quick_match');
});
document.getElementById('btn-create-room').addEventListener('click',function(){
  setStatus('🏠 Criando sala...'); connectAndDo('create_room');
});
document.getElementById('btn-join-room').addEventListener('click',function(){
  document.getElementById('join-panel').style.display='flex';
  document.getElementById('btn-join-room').style.display='none';
  document.getElementById('room-code-input').focus();
});
document.getElementById('btn-confirm-join').addEventListener('click',function(){
  var code=document.getElementById('room-code-input').value.trim().toUpperCase();
  if(code.length<4){setStatus('⚠️ Digite 4 caracteres!');return;}
  setStatus('🔗 Entrando...'); connectAndDo('join_room',{roomId:code});
});
document.getElementById('room-code-input').addEventListener('keydown',function(e){
  if(e.key==='Enter') document.getElementById('btn-confirm-join').click();
});
document.getElementById('btn-cancel-join').addEventListener('click',function(){
  document.getElementById('join-panel').style.display='none';
  document.getElementById('btn-join-room').style.display='';
  document.getElementById('room-code-input').value=''; setStatus('');
});
document.getElementById('btn-cancel-wait').addEventListener('click',function(){
  if(socket)socket.close(); roomId=''; myNum=0;
  showScreen('lobby-screen'); setStatus('');
});
document.getElementById('btn-rematch').addEventListener('click',function(){
  wsSend('request_rematch');
  document.getElementById('result-status').textContent='⏳ Aguardando...';
  document.getElementById('btn-rematch').disabled=true;
});
document.getElementById('btn-back-lobby').addEventListener('click',function(){
  if(socket)socket.close(); roomId=''; myNum=0;
  showScreen('lobby-screen'); setStatus('');
});

// ── Inicia ───────────────────────────────────────────────────────
loop();
