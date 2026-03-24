// ================================================================
// KOMBAT.IO — game.js  (versão final completa)
// Correções: mobile preto, stamina, bot IA, multiplayer fix
// ================================================================

// ── Constantes ──────────────────────────────────────────────────
var CW=800, CH=450, GY=370;
var GRAV=0.58, JF=-14, SPD=4.5;
var MAX_HP=100, MAX_ST=100, RSEC=99;
var PDMG=8, KDMG=15;
var ARANGE=88, ADUR=320, HCD=480;
var ST_COST_PUNCH=18, ST_COST_KICK=28; // custo de stamina
var ST_REGEN=0.35;                      // regeneração por frame

// ── Estado global ───────────────────────────────────────────────
var socket=null, myNum=0, roomId='';
var running=false, overFired=false;
var timerIv=null, timeLeft=RSEC, lastSent='';
var gameMode=''; // 'online' ou 'bot'

// ── Touch ────────────────────────────────────────────────────────
var isMobile=('ontouchstart' in window)||(navigator.maxTouchPoints>0);
var touchKeys={L:false,R:false,U:false,P:false,K:false};

// ── Canvas ───────────────────────────────────────────────────────
var canvas=document.getElementById('game-canvas');
var ctx=canvas.getContext('2d');
canvas.width=CW; canvas.height=CH;

// FIX MOBILE: ajusta o canvas para preencher a tela corretamente
function fitCanvas() {
  var gs=document.getElementById('game-screen');
  if (!gs) return;
  // No mobile usamos a tela inteira
  var W=gs.clientWidth||window.innerWidth;
  var H=gs.clientHeight||window.innerHeight;
  // Subtrai o HUD
  var hud=document.querySelector('.hud');
  var hudH=hud?hud.offsetHeight:60;
  var availH=H-hudH;
  // Subtrai os controles mobile
  var mc=document.getElementById('mobile-controls');
  var mcH=(mc&&mc.style.display!=='none')?mc.offsetHeight:0;
  availH=availH-mcH;
  var sc=Math.min(W/CW, availH/CH);
  if (sc<=0) sc=W/CW; // fallback
  canvas.style.width  = Math.round(CW*sc)+'px';
  canvas.style.height = Math.round(CH*sc)+'px';
  canvas.style.display='block';
}
window.addEventListener('resize',fitCanvas);
// Roda várias vezes para garantir que o layout já carregou
setTimeout(fitCanvas,50);
setTimeout(fitCanvas,200);
setTimeout(fitCanvas,500);

// ================================================================
// PARTÍCULAS
// ================================================================
var particles=[];
function spawnParticles(x,y,color,count,power) {
  for (var i=0;i<count;i++) {
    var ang=Math.random()*Math.PI*2;
    var spd=(0.5+Math.random())*power;
    particles.push({x:x,y:y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd-Math.random()*power*0.5,
      color:color,size:2+Math.random()*4,life:1,decay:0.03+Math.random()*0.04,
      type:Math.random()<0.5?'square':'circle'});
  }
}
function spawnHitSpark(x,y,color) {
  for (var i=0;i<6;i++) {
    var ang=-Math.PI/2+(Math.random()-0.5)*Math.PI;
    particles.push({x:x,y:y,vx:Math.cos(ang)*(3+Math.random()*5),vy:Math.sin(ang)*(3+Math.random()*5),
      color:'#fff',size:1+Math.random()*2,life:1,decay:0.08+Math.random()*0.06,type:'circle'});
  }
  spawnParticles(x,y,color,8,4);
}
function updateParticles() {
  var alive=[];
  for (var i=0;i<particles.length;i++) {
    var p=particles[i];
    p.x+=p.vx; p.y+=p.vy; p.vy+=0.18; p.vx*=0.96; p.life-=p.decay;
    if (p.life>0) alive.push(p);
  }
  particles=alive;
}
function drawParticles() {
  for (var i=0;i<particles.length;i++) {
    var p=particles[i];
    ctx.globalAlpha=Math.max(0,p.life);
    ctx.fillStyle=p.color;
    if (p.type==='circle'){ctx.beginPath();ctx.arc(p.x,p.y,p.size*p.life,0,Math.PI*2);ctx.fill();}
    else {var s=p.size*p.life;ctx.fillRect(p.x-s/2,p.y-s/2,s,s);}
  }
  ctx.globalAlpha=1;
}

// ================================================================
// CÂMERA SHAKE
// ================================================================
var camShake={x:0,y:0,intensity:0};
function shakeCamera(power){camShake.intensity=power;}
function updateCamera(){
  if (camShake.intensity>0.1){
    camShake.x=(Math.random()-0.5)*camShake.intensity*6;
    camShake.y=(Math.random()-0.5)*camShake.intensity*4;
    camShake.intensity*=0.75;
  } else {camShake.x=0;camShake.y=0;camShake.intensity=0;}
}

// ================================================================
// POLYFILL roundRect
// ================================================================
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h,r){
    r=Math.min(r,w/2,h/2);
    this.beginPath();
    this.moveTo(x+r,y);
    this.lineTo(x+w-r,y);this.arcTo(x+w,y,x+w,y+r,r);
    this.lineTo(x+w,y+h-r);this.arcTo(x+w,y+h,x+w-r,y+h,r);
    this.lineTo(x+r,y+h);this.arcTo(x,y+h,x,y+h-r,r);
    this.lineTo(x,y+r);this.arcTo(x,y,x+r,y,r);
    this.closePath();
  };
}

// ================================================================
// CLASSE FIGHTER
// ================================================================
function Fighter(x,n) {
  this.x=x; this.y=GY; this.w=52; this.h=90;
  this.vx=0; this.vy=0; this.onGround=true;
  this.hp=MAX_HP; this.st=MAX_ST; // stamina
  this.n=n; this.facing=n===1?1:-1;
  this.color=n===1?'#ff3355':'#2299ff';
  this.color2=n===1?'#ff7799':'#66bbff';
  this.dark=n===1?'#880022':'#113366';
  this.state='idle'; this.stTs=0;
  this.atk=false; this.atkT=null; this.lastHit=0;
  this.flash=0; this.frame=0; this.tick=0;
  this.chargeAura=0; this.trail=[];
  this.prevX=x; this.prevY=GY;
  this.isBot=false;
}

Fighter.prototype.ss=function(s){
  if (this.state==='dead') return;
  this.state=s; this.stTs=Date.now();
};

Fighter.prototype.jump=function(){
  if (!this.onGround||this.state==='dead') return;
  this.vy=JF; this.onGround=false; this.ss('jump');
  spawnParticles(this.x+this.w/2,this.y,'rgba(255,255,255,0.3)',4,2);
};

Fighter.prototype.doAtk=function(t){
  if (this.atk||this.state==='dead') return false;
  // Verifica stamina
  var cost=t==='kick'?ST_COST_KICK:ST_COST_PUNCH;
  if (this.st<cost) return false; // sem stamina, não ataca
  this.st=Math.max(0,this.st-cost);
  this.atk=true; this.atkT=t; this.ss(t);
  this.chargeAura=1;
  return true;
};

Fighter.prototype.hit=function(d,isKick){
  if (this.state==='dead') return;
  this.hp=Math.max(0,this.hp-d);
  this.flash=12;
  spawnParticles(this.x+this.w/2,this.y-this.h*0.5,this.color,12,5);
  spawnParticles(this.x+this.w/2,this.y-this.h*0.5,'#ffdd44',4,6);
  if (isKick) shakeCamera(3); else shakeCamera(2);
  if (this.hp<=0){this.ss('dead');}
  else {
    var self=this; this.ss('hurt');
    setTimeout(function(){if(self.state==='hurt')self.ss('idle');},320);
  }
};

Fighter.prototype.atkBox=function(){
  if (!this.atk) return null;
  var r=this.atkT==='kick'?ARANGE*1.25:ARANGE;
  var ox=this.facing>0?this.w:-r;
  return {x:this.x+ox,y:this.y-this.h*0.7,w:r,h:36};
};

Fighter.prototype.bodyBox=function(){
  return {x:this.x+6,y:this.y-this.h,w:this.w-12,h:this.h};
};

Fighter.prototype.update=function(){
  // Trail
  if (Math.abs(this.x-this.prevX)>1||Math.abs(this.y-this.prevY)>1) {
    this.trail.push({x:this.x+this.w/2,y:this.y-this.h/2,life:1});
  }
  this.prevX=this.x; this.prevY=this.y;
  var t2=[];
  for (var i=0;i<this.trail.length;i++){
    this.trail[i].life-=0.12;
    if(this.trail[i].life>0) t2.push(this.trail[i]);
  }
  this.trail=t2;

  // Física
  if (!this.onGround) this.vy+=GRAV;
  this.x+=this.vx; this.y+=this.vy;
  if (this.y>=GY){
    this.y=GY;this.vy=0;this.onGround=true;
    if(this.state==='jump'){
      this.ss('idle');
      spawnParticles(this.x+this.w/2,this.y+2,'rgba(200,200,255,0.3)',5,1.5);
    }
  }
  this.x=Math.max(6,Math.min(CW-this.w-6,this.x));
  if (this.atk&&Date.now()-this.stTs>ADUR){
    this.atk=false;this.atkT=null;
    if(this.state!=='hurt'&&this.state!=='dead')this.ss('idle');
  }
  if (this.flash>0) this.flash--;
  if (this.chargeAura>0) this.chargeAura=Math.max(0,this.chargeAura-0.06);

  // Regenera stamina quando não está atacando
  if (!this.atk && this.state!=='dead') {
    this.st=Math.min(MAX_ST,this.st+ST_REGEN);
  }

  this.tick++;
  if(this.tick%6===0) this.frame=(this.frame+1)%8;
};

Fighter.prototype.draw=function(c){
  var cx=this.x+this.w/2,by=this.y,f=this.facing;
  var bob=this.state==='walk'?Math.sin(this.frame*0.8)*3:0;
  var idleBob=this.state==='idle'?Math.sin(this.tick*0.06)*1.5:0;
  bob+=idleBob;
  var str=this.state==='jump'?(this.vy<0?0.84:1.15):1;
  var shk=this.state==='hurt'?(Math.random()-0.5)*5:0;
  var dead=this.state==='dead';

  // Trail
  for (var ti=0;ti<this.trail.length;ti++){
    var t=this.trail[ti];
    c.globalAlpha=t.life*0.12;
    c.fillStyle=this.color;
    c.beginPath();c.arc(t.x,t.y,12*t.life,0,Math.PI*2);c.fill();
  }
  c.globalAlpha=1;

  // Aura de ataque
  if (this.chargeAura>0.1){
    var ag=c.createRadialGradient(cx,by-this.h*0.4,0,cx,by-this.h*0.4,40*this.chargeAura);
    ag.addColorStop(0,hexToRgba(this.color,this.chargeAura*0.6));
    ag.addColorStop(1,'transparent');
    c.fillStyle=ag;c.beginPath();c.arc(cx,by-this.h*0.4,50,0,Math.PI*2);c.fill();
  }

  // Sombra
  c.save();c.globalAlpha=dead?0.1:0.3;
  c.fillStyle='#000';
  c.beginPath();c.ellipse(cx,by+5,32+Math.abs(this.vx)*2,8,0,0,Math.PI*2);c.fill();
  c.restore();

  c.save();
  if (this.flash%2===1) c.globalAlpha=0.4;

  if (dead){
    c.fillStyle=this.color;
    c.save();c.translate(cx,by-12);c.rotate(f>0?Math.PI/2:-Math.PI/2);
    c.fillRect(-26,-12,52,24);
    c.fillStyle='#e8c090';c.beginPath();c.arc(f>0?30:30,0,10,0,Math.PI*2);c.fill();
    c.restore();
    c.restore();
    return;
  }

  var ty=by-82*str+bob+shk;

  // Pernas
  c.fillStyle=this.dark;
  if (this.state==='kick'&&this.atk){
    c.beginPath();c.roundRect(cx-12+shk,by-38+bob,13,38*str,4);c.fill();
    c.fillStyle=this.color;
    var kx=f>0?cx+6:cx-50;
    c.beginPath();c.roundRect(kx,by-22,44,14,4);c.fill();
    c.fillStyle=this.color2;
    var sx=f>0?kx+38:kx-6;
    c.beginPath();c.roundRect(sx,by-24,12,18,3);c.fill();
    spawnHitSpark(f>0?cx+50:cx-50,by-18,this.color);
  } else {
    var ws2=this.state==='walk'?Math.sin(this.frame*0.8)*8:0;
    c.beginPath();c.roundRect(cx-15+shk,by-38+ws2+bob,13,38*str,4);c.fill();
    c.beginPath();c.roundRect(cx+2-shk,by-38-ws2+bob,13,38*str,4);c.fill();
    c.fillStyle=this.dark;
    c.beginPath();c.roundRect(cx-17+shk,by-7+ws2+bob,17,9,2);c.fill();
    c.beginPath();c.roundRect(cx+1-shk,by-7-ws2+bob,17,9,2);c.fill();
  }

  // Torso
  c.fillStyle=this.color;
  c.beginPath();c.roundRect(cx-20,ty+4,40,42*str,5);c.fill();
  c.fillStyle=this.color2;
  c.beginPath();c.roundRect(cx-12,ty+10,24,14*str,3);c.fill();
  c.fillStyle='rgba(0,0,0,0.5)';
  c.font='bold '+(11*str)+'px Rajdhani,Arial';c.textAlign='center';
  c.fillText('P'+this.n,cx,ty+21*str);
  // Cinto
  c.fillStyle=this.dark;
  c.beginPath();c.roundRect(cx-20,ty+42*str,40,7,2);c.fill();
  c.fillStyle=this.color2;
  c.beginPath();c.roundRect(cx-5,ty+43*str,10,5,1);c.fill();

  // Braços
  var punchExt=(this.state==='punch'&&this.atk)?22:0;
  var armSwing=this.state==='walk'?Math.sin(this.frame*0.8)*5:0;
  if (f>0){
    c.fillStyle=this.dark;c.beginPath();c.roundRect(cx-30,ty+8+armSwing,12,28,4);c.fill();
    c.fillStyle=this.color;c.beginPath();c.roundRect(cx+18,ty+8-armSwing,12,28-punchExt*0.5,4);c.fill();
    if (this.state==='punch'&&this.atk){
      c.fillStyle=this.color;c.beginPath();c.roundRect(cx+18,ty+8,12+punchExt,16,4);c.fill();
      c.fillStyle='#fff';c.beginPath();c.arc(cx+34+punchExt,ty+16,9,0,Math.PI*2);c.fill();
      c.fillStyle=this.color2;c.beginPath();c.arc(cx+34+punchExt,ty+16,6,0,Math.PI*2);c.fill();
    }
  } else {
    c.fillStyle=this.dark;c.beginPath();c.roundRect(cx+18,ty+8+armSwing,12,28,4);c.fill();
    c.fillStyle=this.color;c.beginPath();c.roundRect(cx-30,ty+8-armSwing,12,28-punchExt*0.5,4);c.fill();
    if (this.state==='punch'&&this.atk){
      c.fillStyle=this.color;c.beginPath();c.roundRect(cx-30-punchExt,ty+8,12+punchExt,16,4);c.fill();
      c.fillStyle='#fff';c.beginPath();c.arc(cx-34-punchExt,ty+16,9,0,Math.PI*2);c.fill();
      c.fillStyle=this.color2;c.beginPath();c.arc(cx-34-punchExt,ty+16,6,0,Math.PI*2);c.fill();
    }
  }

  // Pescoço
  c.fillStyle='#e8c090';c.beginPath();c.roundRect(cx-5,ty-6,10,12,2);c.fill();

  // Cabeça
  var hbob=bob*0.4,hy=ty-32;
  c.fillStyle=this.dark;
  c.beginPath();c.ellipse(cx+shk*0.3,hy+10+hbob,20,22*str,0,Math.PI,0);c.fill();
  c.fillStyle='#e8c090';
  c.beginPath();c.ellipse(cx+shk*0.3,hy+14+hbob,18,19*str,0,0,Math.PI*2);c.fill();
  c.fillStyle='rgba(0,0,0,0.08)';
  c.beginPath();c.ellipse(cx+shk*0.3+3*f,hy+15+hbob,10,14*str,0,0,Math.PI*2);c.fill();

  // Expressão
  if (this.state==='hurt'){
    c.fillStyle='#ff5500';c.beginPath();c.arc(cx+f*5+shk,hy+11+hbob,5,0,Math.PI*2);c.fill();
    c.fillStyle='#fff';c.beginPath();c.arc(cx+f*5+shk,hy+11+hbob,2.5,0,Math.PI*2);c.fill();
    c.strokeStyle='#cc3300';c.lineWidth=2;
    c.beginPath();c.arc(cx+shk*0.3,hy+20+hbob,5,0,Math.PI);c.stroke();
  } else {
    c.fillStyle='#111';c.beginPath();c.arc(cx+f*5+shk*0.3,hy+11+hbob,4.5,0,Math.PI*2);c.fill();
    c.fillStyle='#fff';c.beginPath();c.arc(cx+f*5+shk*0.3,hy+11+hbob,2,0,Math.PI*2);c.fill();
    c.fillStyle='rgba(0,0,0,0.3)';c.beginPath();c.roundRect(cx-5+shk*0.3,hy+21+hbob,10,3,1);c.fill();
  }

  // Viseira
  c.fillStyle=this.color;c.beginPath();c.roundRect(cx-19,hy+2+hbob,38,10,3);c.fill();
  c.fillStyle=this.color2;c.beginPath();c.roundRect(cx-15,hy+4+hbob,30,5,2);c.fill();

  // Stamina baixa — pisca vermelho na viseira
  if (this.st<25){
    c.fillStyle='rgba(255,50,50,'+(0.5+0.5*Math.sin(this.tick*0.3))+')';
    c.beginPath();c.roundRect(cx-19,hy+2+hbob,38,10,3);c.fill();
  }

  c.restore();
};

// Helper hex -> rgba
function hexToRgba(hex,alpha){
  var r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return 'rgba('+r+','+g+','+b+','+alpha+')';
}

// ── Instâncias ───────────────────────────────────────────────────
var p1=new Fighter(140,1);
var p2=new Fighter(610,2);

// ================================================================
// PREVIEW DO LOBBY
// ================================================================
var prevCanvas=document.getElementById('preview-canvas');
var prevCtx=prevCanvas?prevCanvas.getContext('2d'):null;

function drawPreview(){
  if(!prevCtx)return;
  var w=prevCanvas.width,h=prevCanvas.height;
  prevCtx.clearRect(0,0,w,h);
  var g=prevCtx.createLinearGradient(0,0,0,h);
  g.addColorStop(0,'#08080f');g.addColorStop(1,'#12121e');
  prevCtx.fillStyle=g;prevCtx.fillRect(0,0,w,h);
  var ng=prevCtx.createLinearGradient(0,0,w,0);
  ng.addColorStop(0,'transparent');ng.addColorStop(0.3,'rgba(255,51,85,.5)');
  ng.addColorStop(0.5,'rgba(255,215,0,.5)');ng.addColorStop(0.7,'rgba(34,153,255,.5)');
  ng.addColorStop(1,'transparent');
  prevCtx.fillStyle=ng;prevCtx.fillRect(0,h-2,w,2);
  prevCtx.font='bold 28px "Press Start 2P",monospace';
  prevCtx.fillStyle='rgba(255,215,0,0.8)';prevCtx.textAlign='center';
  prevCtx.fillText('VS',w/2,h/2+10);
  drawMiniChar(prevCtx,60,h-10,1,Date.now());
  drawMiniChar(prevCtx,w-60,h-10,2,Date.now());
}

function drawMiniChar(c,x,y,n,t){
  var bob=Math.sin(t*0.002)*3;
  var col=n===1?'#ff3355':'#2299ff',dk=n===1?'#880022':'#113366',col2=n===1?'#ff7799':'#66bbff',f=n===1?1:-1;
  c.fillStyle='rgba(0,0,0,0.4)';c.beginPath();c.ellipse(x,y+3,18,5,0,0,Math.PI*2);c.fill();
  c.fillStyle=dk;c.fillRect(x-10,y-30+bob,8,30);c.fillRect(x+2,y-30-bob,8,30);
  c.fillStyle=col;c.beginPath();if(c.roundRect)c.roundRect(x-13,y-60+bob,26,28,3);else c.rect(x-13,y-60+bob,26,28);c.fill();
  c.fillStyle=col2;c.beginPath();if(c.roundRect)c.roundRect(x-8,y-56+bob,16,10,2);else c.rect(x-8,y-56+bob,16,10);c.fill();
  c.fillStyle=col;c.fillRect(x-20,y-58+bob,8,20);c.fillRect(x+12,y-58+bob,8,20);
  c.fillStyle=dk;c.beginPath();c.ellipse(x,y-70+bob,13,14,0,Math.PI,0);c.fill();
  c.fillStyle='#e8c090';c.beginPath();c.ellipse(x,y-66+bob,12,13,0,0,Math.PI*2);c.fill();
  c.fillStyle=col;c.fillRect(x-12,y-77+bob,24,8);
  c.fillStyle='#111';c.beginPath();c.arc(x+f*4,y-68+bob,3,0,Math.PI*2);c.fill();
}

// ================================================================
// FUNDO DA ARENA
// ================================================================
var bgTime=0;
var stars=[];
for (var si=0;si<80;si++) stars.push({x:Math.random()*CW,y:Math.random()*GY*0.7,r:Math.random()*1.5,s:0.5+Math.random()*0.5});

function drawBg(){
  bgTime+=0.01;
  var sky=ctx.createLinearGradient(0,0,0,GY);
  sky.addColorStop(0,'#030308');sky.addColorStop(0.5,'#080814');sky.addColorStop(1,'#100820');
  ctx.fillStyle=sky;ctx.fillRect(0,0,CW,CH);
  for (var i=0;i<stars.length;i++){
    var st=stars[i];
    ctx.globalAlpha=st.s*(0.5+0.5*Math.sin(bgTime*2+i*1.3));
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(st.x,st.y,st.r,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
  ctx.fillStyle='rgba(15,10,30,0.9)';ctx.fillRect(0,GY*0.5,CW,GY*0.5);
  for (var d=0;d<6;d++){ctx.fillStyle='rgba(255,255,255,'+(0.04+d*0.015)+')';ctx.fillRect(0,GY*0.5+d*14,CW,2);}
  drawArenaLight(ctx,CW*0.15,GY*0.52,'#ff3355');
  drawArenaLight(ctx,CW*0.5,GY*0.48,'#ffffff');
  drawArenaLight(ctx,CW*0.85,GY*0.52,'#2299ff');
  drawPillar(ctx,55,GY-160);drawPillar(ctx,CW-55,GY-160);
  var floorGrad=ctx.createLinearGradient(0,GY-20,0,GY+CH);
  floorGrad.addColorStop(0,'#1a0a28');floorGrad.addColorStop(0.3,'#120820');floorGrad.addColorStop(1,'#080510');
  ctx.fillStyle=floorGrad;ctx.fillRect(0,GY-2,CW,CH-GY+2);
  ctx.strokeStyle='rgba(150,60,255,0.10)';ctx.lineWidth=1;
  var gy2=GY+2;
  for (var li=0;li<=8;li++){ctx.beginPath();ctx.moveTo(0,gy2+li*14);ctx.lineTo(CW,gy2+li*14);ctx.stroke();}
  for (var li=-9;li<=9;li++){ctx.beginPath();ctx.moveTo(CW/2,gy2);ctx.lineTo(CW/2+li*60,gy2+112);ctx.stroke();}
  ctx.save();ctx.globalAlpha=0.06;ctx.font='bold 48px "Press Start 2P",monospace';
  ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText('KOMBAT',CW/2,GY+50);ctx.restore();
  var nline=ctx.createLinearGradient(0,0,CW,0);
  nline.addColorStop(0,'transparent');nline.addColorStop(0.15,'rgba(255,51,85,0.9)');
  nline.addColorStop(0.5,'rgba(255,220,60,1)');nline.addColorStop(0.85,'rgba(34,153,255,0.9)');
  nline.addColorStop(1,'transparent');
  ctx.fillStyle=nline;ctx.fillRect(0,GY,CW,3);
  ctx.fillStyle='rgba(255,200,60,0.04)';ctx.fillRect(0,GY+3,CW,30);
}

function drawArenaLight(c,x,y,color){
  var hex=color.replace('#','');
  var r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
  var gr=c.createRadialGradient(x,y,0,x,y,80);
  gr.addColorStop(0,'rgba('+r+','+g+','+b+',0.15)');gr.addColorStop(1,'transparent');
  c.fillStyle=gr;c.beginPath();c.arc(x,y,80,0,Math.PI*2);c.fill();
}

function drawPillar(c,x,y){
  var pg=c.createLinearGradient(x-14,0,x+14,0);
  pg.addColorStop(0,'#0a0518');pg.addColorStop(0.5,'#1a0a30');pg.addColorStop(1,'#0a0518');
  c.fillStyle=pg;c.fillRect(x-14,y,28,GY-y+2);
  c.fillStyle='rgba(150,60,255,0.3)';c.fillRect(x-2,y,4,GY-y+2);
  c.fillStyle='#2a1048';c.fillRect(x-20,y-12,40,18);
  c.fillStyle='rgba(150,60,255,0.5)';c.fillRect(x-20,y-12,40,3);
  var tg=c.createRadialGradient(x,y-18,2,x,y-18,60);
  tg.addColorStop(0,'rgba(255,180,60,0.7)');tg.addColorStop(0.3,'rgba(255,100,30,0.3)');tg.addColorStop(1,'transparent');
  c.fillStyle=tg;c.beginPath();c.arc(x,y-18,60,0,Math.PI*2);c.fill();
  c.fillStyle='#ffcc40';c.beginPath();c.arc(x,y-18,5,0,Math.PI*2);c.fill();
  c.fillStyle='#ff8820';c.beginPath();c.arc(x,y-18+Math.sin(bgTime*8)*2,3,0,Math.PI*2);c.fill();
}

// ================================================================
// PARTÍCULAS DO LOBBY
// ================================================================
var lobbyCanvas=document.getElementById('lobby-particles');
var lobbyCtx=lobbyCanvas?lobbyCanvas.getContext('2d'):null;
var lobbyPts=[];
var lobbyAnim=true;

function initLobbyParticles(){
  if(!lobbyCanvas)return;
  lobbyCanvas.width=window.innerWidth;lobbyCanvas.height=window.innerHeight;
  lobbyPts=[];
  for(var i=0;i<60;i++){
    lobbyPts.push({x:Math.random()*lobbyCanvas.width,y:Math.random()*lobbyCanvas.height,
      vy:-0.2-Math.random()*0.5,vx:(Math.random()-0.5)*0.3,r:1+Math.random()*2,
      alpha:Math.random(),color:Math.random()<0.5?'#ff3355':'#2299ff'});
  }
}

function animateLobby(){
  if(!lobbyCanvas||!lobbyCtx||!lobbyAnim)return;
  lobbyCtx.clearRect(0,0,lobbyCanvas.width,lobbyCanvas.height);
  var bg=lobbyCtx.createRadialGradient(lobbyCanvas.width/2,lobbyCanvas.height,0,lobbyCanvas.width/2,lobbyCanvas.height,lobbyCanvas.height);
  bg.addColorStop(0,'rgba(30,5,60,0.6)');bg.addColorStop(0.5,'rgba(10,5,25,0.4)');bg.addColorStop(1,'rgba(0,0,0,0)');
  lobbyCtx.fillStyle=bg;lobbyCtx.fillRect(0,0,lobbyCanvas.width,lobbyCanvas.height);
  for(var i=0;i<lobbyPts.length;i++){
    var p=lobbyPts[i];p.x+=p.vx;p.y+=p.vy;p.alpha+=0.01;if(p.alpha>1)p.alpha=0;
    if(p.y<-10){p.y=lobbyCanvas.height+10;p.x=Math.random()*lobbyCanvas.width;}
    lobbyCtx.globalAlpha=p.alpha*(0.3+0.7*Math.abs(Math.sin(Date.now()*0.001+i)));
    lobbyCtx.fillStyle=p.color;lobbyCtx.beginPath();lobbyCtx.arc(p.x,p.y,p.r,0,Math.PI*2);lobbyCtx.fill();
  }
  lobbyCtx.globalAlpha=1;
  if(prevCtx)drawPreview();
  requestAnimationFrame(animateLobby);
}

window.addEventListener('resize',function(){
  if(lobbyCanvas){lobbyCanvas.width=window.innerWidth;lobbyCanvas.height=window.innerHeight;}
  initLobbyParticles();
});
initLobbyParticles();
animateLobby();

// ================================================================
// BOT IA
// ================================================================
var botState={
  action:'idle',
  actionTimer:0,
  reactionDelay:18, // frames
  frameCount:0
};

function updateBot(){
  if (!running||gameMode!=='bot') return;
  var bot=p2; // bot é sempre P2 no modo bot
  var player=p1;
  if (bot.state==='dead'||bot.state==='hurt') return;

  botState.frameCount++;
  if (botState.frameCount<botState.reactionDelay) return;
  botState.frameCount=0;
  // Bot mais difícil: reação mais rápida com mais HP perdido
  botState.reactionDelay=Math.max(6, 18-Math.floor((MAX_HP-bot.hp)/15));

  var dx=player.x-bot.x;
  var dist=Math.abs(dx);
  var inRange=dist<ARANGE+40;

  // Vira para o jogador
  bot.facing=dx>0?1:-1;

  // Decisão de IA
  var r=Math.random();

  if (inRange){
    // Perto: ataca com variação
    if (r<0.35&&bot.st>=ST_COST_PUNCH){ bot.doAtk('punch'); }
    else if (r<0.55&&bot.st>=ST_COST_KICK){ bot.doAtk('kick'); }
    else if (r<0.65&&bot.onGround){ bot.jump(); }
    else {
      // Recua um pouco
      bot.vx=bot.facing>0?-SPD*0.7:SPD*0.7;
      if(bot.state==='walk'||bot.state==='idle')bot.ss('walk');
    }
  } else if (dist<300){
    // Distância média: avança
    bot.vx=dx>0?SPD:(-SPD);
    if(bot.onGround&&!bot.atk)bot.ss('walk');
    // Pulo ocasional
    if(r<0.08&&bot.onGround)bot.jump();
  } else {
    // Longe: corre em direção
    bot.vx=dx>0?SPD*1.2:(-SPD*1.2);
    if(bot.onGround&&!bot.atk)bot.ss('walk');
  }

  // Para o movimento se está atacando
  if (bot.atk) bot.vx=0;
}

// ================================================================
// INPUT TECLADO
// ================================================================
var keys={};
window.addEventListener('keydown',function(e){
  keys[e.code]=true;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.code)>=0)e.preventDefault();
});
window.addEventListener('keyup',function(e){keys[e.code]=false;});

function doInput(){
  if(!running||!myNum)return;
  var me=myNum===1?p1:p2;
  if(me.state==='dead')return;
  var K=myNum===1
    ?{L:'KeyA',R:'KeyD',U:'KeyW',P:'KeyF',K:'KeyG'}
    :{L:'ArrowLeft',R:'ArrowRight',U:'ArrowUp',P:'Comma',K:'Period'};
  var goL=keys[K.L]||touchKeys.L;
  var goR=keys[K.R]||touchKeys.R;
  var goU=keys[K.U]||touchKeys.U;
  var goP=keys[K.P]||touchKeys.P;
  var goK=keys[K.K]||touchKeys.K;
  if(goL){me.vx=-SPD;me.facing=-1;if(me.onGround&&!me.atk)me.ss('walk');}
  else if(goR){me.vx=SPD;me.facing=1;if(me.onGround&&!me.atk)me.ss('walk');}
  else{me.vx=0;if(me.state==='walk')me.ss('idle');}
  if(goU)me.jump();
  if(goP)me.doAtk('punch');
  if(goK)me.doAtk('kick');
}

// Input no modo bot: P1 joga, P2 é bot
function doInputBot(){
  if(!running)return;
  var me=p1;
  if(me.state==='dead')return;
  var K={L:'KeyA',R:'KeyD',U:'KeyW',P:'KeyF',K:'KeyG'};
  // Mobile também funciona no bot
  var goL=keys[K.L]||touchKeys.L;
  var goR=keys[K.R]||touchKeys.R;
  var goU=keys[K.U]||touchKeys.U;
  var goP=keys[K.P]||touchKeys.P;
  var goK=keys[K.K]||touchKeys.K;
  if(goL){me.vx=-SPD;me.facing=-1;if(me.onGround&&!me.atk)me.ss('walk');}
  else if(goR){me.vx=SPD;me.facing=1;if(me.onGround&&!me.atk)me.ss('walk');}
  else{me.vx=0;if(me.state==='walk')me.ss('idle');}
  if(goU)me.jump();
  if(goP)me.doAtk('punch');
  if(goK)me.doAtk('kick');
}

// ================================================================
// CONTROLES MOBILE
// ================================================================
function setupMobileControls(){
  var mc=document.getElementById('mobile-controls');
  if(!mc)return;
  mc.style.display='flex'; // sempre mostra no jogo
  function bind(id,key){
    var el=document.getElementById(id);if(!el)return;
    function on(e){e.preventDefault();touchKeys[key]=true;el.classList.add('pressed');}
    function off(e){e.preventDefault();touchKeys[key]=false;el.classList.remove('pressed');}
    el.addEventListener('touchstart',on,{passive:false});
    el.addEventListener('touchend',off,{passive:false});
    el.addEventListener('touchcancel',off,{passive:false});
    el.addEventListener('mousedown',on);
    el.addEventListener('mouseup',off);
    el.addEventListener('mouseleave',off);
  }
  bind('mb-left','L');bind('mb-right','R');bind('mb-up','U');
  bind('mb-punch','P');bind('mb-kick','K');
  // Recalcula canvas depois de mostrar controles
  setTimeout(fitCanvas,100);
}

// ================================================================
// REDE — WebSocket (URL do servidor Render)
// ================================================================
var SERVER_URL='wss://kombat-io.onrender.com';

function wsSend(type,extra){
  if(!socket||socket.readyState!==WebSocket.OPEN)return;
  var msg={type:type};
  if(extra)for(var k in extra)msg[k]=extra[k];
  socket.send(JSON.stringify(msg));
}

function connectAndDo(action,data){
  if(socket&&socket.readyState!==WebSocket.CLOSED){
    socket.onclose=null;socket.onerror=null;socket.onmessage=null;socket.close();
  }
  setStatus('Conectando ao servidor...');
  try{socket=new WebSocket(SERVER_URL);}
  catch(e){setStatus('❌ Erro: '+e.message);return;}
  socket.onopen=function(){
    var msg={type:action};
    if(data)for(var k in data)msg[k]=data[k];
    socket.send(JSON.stringify(msg));
    setStatus('');
  };
  socket.onerror=function(){setStatus('❌ Servidor offline. Tente em instantes ou jogue vs Bot!');};
  socket.onclose=function(e){console.log('WS fechou',e.code);};
  socket.onmessage=function(ev){
    var msg;try{msg=JSON.parse(ev.data);}catch(e){return;}
    handleMsg(msg);
  };
}

function handleMsg(msg){
  if(msg.type==='room_created'){
    roomId=msg.roomId;myNum=msg.playerNumber;
    document.getElementById('room-code-display').textContent=roomId;
    showScreen('waiting-screen');
  }
  else if(msg.type==='room_joined'){roomId=msg.roomId;myNum=msg.playerNumber;}
  else if(msg.type==='game_start'){gameMode='online';startGame();}
  else if(msg.type==='opponent_update'){
    var opp=myNum===1?p2:p1;
    opp.x=msg.x;opp.y=msg.y;opp.vx=msg.vx;opp.vy=msg.vy;
    opp.facing=msg.facing;opp.state=msg.state;
    opp.atk=msg.atk;opp.atkT=msg.atkT;opp.frame=msg.frame;
    if(msg.hp!==undefined)opp.hp=msg.hp;
    if(msg.st!==undefined)opp.st=msg.st;
  }
  else if(msg.type==='hit_registered'){
    if(msg.attackerPlayer!==myNum){
      var me=myNum===1?p1:p2;
      me.hit(msg.damage,msg.atkT==='kick');
      flashScreen();updateHUD();
      if(me.hp<=0&&!overFired)endGame(msg.attackerPlayer);
    }
  }
  else if(msg.type==='game_over_broadcast'){
    if(!overFired){overFired=true;running=false;if(timerIv)clearInterval(timerIv);showResultScreen(msg.winner);}
  }
  else if(msg.type==='rematch_requested'){
    document.getElementById('result-status').textContent='⚔️ Oponente quer revanche!';
    wsSend('accept_rematch');
  }
  else if(msg.type==='rematch_start'){gameMode='online';startGame();}
  else if(msg.type==='opponent_disconnected'){
    running=false;if(timerIv)clearInterval(timerIv);
    showScreen('result-screen');
    document.getElementById('result-label').textContent='OPONENTE SAIU';
    document.getElementById('result-name').textContent='— VOCÊ VENCEU —';
    document.getElementById('result-status').textContent='Oponente desconectou.';
    document.getElementById('btn-rematch').disabled=true;
  }
  else if(msg.type==='join_error'){setStatus('❌ '+(msg.msg||'Erro'));showScreen('lobby-screen');}
}

// ================================================================
// SINCRONIZAÇÃO
// ================================================================
function sendState(){
  if(!running||!myNum||!socket||socket.readyState!==WebSocket.OPEN)return;
  var me=myNum===1?p1:p2;
  var s={x:Math.round(me.x),y:Math.round(me.y),vx:me.vx,vy:me.vy,
         facing:me.facing,state:me.state,atk:me.atk,atkT:me.atkT,
         frame:me.frame,hp:me.hp,st:Math.round(me.st)};
  var str=JSON.stringify(s);
  if(str!==lastSent){wsSend('player_update',s);lastSent=str;}
}

// ================================================================
// HIT DETECTION (online e bot)
// ================================================================
function checkHits(){
  if(!running)return;
  var atk,def;
  if(gameMode==='bot'){
    // Verifica P1 acertando bot
    checkHitPair(p1,p2);
    // Verifica bot acertando P1
    checkHitPair(p2,p1);
  } else {
    if(!myNum)return;
    atk=myNum===1?p1:p2;
    def=myNum===1?p2:p1;
    checkHitPairOnline(atk,def);
  }
}

function checkHitPair(atk,def){
  if(!atk.atk)return;
  var now=Date.now();
  if(now-atk.lastHit<HCD)return;
  var ab=atk.atkBox(),bb=def.bodyBox();
  if(!ab)return;
  if(ab.x<bb.x+bb.w&&ab.x+ab.w>bb.x&&ab.y<bb.y+bb.h&&ab.y+ab.h>bb.y){
    atk.lastHit=now;
    var dmg=atk.atkT==='kick'?KDMG:PDMG;
    def.hit(dmg,atk.atkT==='kick');
    flashScreen();updateHUD();
    if(def.hp<=0&&!overFired){
      // Determina vencedor: P1=1, P2(bot)=2
      endGame(atk.n);
    }
  }
}

function checkHitPairOnline(atk,def){
  if(!atk.atk)return;
  var now=Date.now();
  if(now-atk.lastHit<HCD)return;
  var ab=atk.atkBox(),bb=def.bodyBox();
  if(!ab)return;
  if(ab.x<bb.x+bb.w&&ab.x+ab.w>bb.x&&ab.y<bb.y+bb.h&&ab.y+ab.h>bb.y){
    atk.lastHit=now;
    var dmg=atk.atkT==='kick'?KDMG:PDMG;
    def.hit(dmg,atk.atkT==='kick');
    wsSend('attack_hit',{damage:dmg,atkT:atk.atkT});
    flashScreen();updateHUD();
    if(def.hp<=0&&!overFired)endGame(myNum);
  }
}

// ================================================================
// HUD — com barra de stamina
// ================================================================
function updateHUD(){
  var h1=Math.max(0,p1.hp),h2=Math.max(0,p2.hp);
  var s1=Math.max(0,p1.st),s2=Math.max(0,p2.st);
  document.getElementById('bar-p1').style.width=(h1/MAX_HP*100)+'%';
  document.getElementById('bar-p2').style.width=(h2/MAX_HP*100)+'%';
  document.getElementById('hp-p1').textContent=h1;
  document.getElementById('hp-p2').textContent=h2;
  var st1=document.getElementById('st-bar-p1');
  var st2=document.getElementById('st-bar-p2');
  if(st1)st1.style.width=(s1/MAX_ST*100)+'%';
  if(st2)st2.style.width=(s2/MAX_ST*100)+'%';
}

// ================================================================
// TIMER
// ================================================================
function startTimer(){
  timeLeft=RSEC;
  var el=document.getElementById('game-timer');
  el.className='hud-timer';el.textContent=timeLeft;
  if(timerIv)clearInterval(timerIv);
  timerIv=setInterval(function(){
    if(!running){clearInterval(timerIv);return;}
    timeLeft--;el.textContent=timeLeft;
    if(timeLeft<=10)el.className='hud-timer urgent';
    if(timeLeft<=0){
      clearInterval(timerIv);
      if(!overFired){var w=p1.hp>=p2.hp?1:2;endGame(w,'TIME OUT');}
    }
  },1000);
}

// ================================================================
// FIM DE JOGO
// ================================================================
function endGame(winner,reason){
  if(overFired)return;
  overFired=true;running=false;
  if(timerIv)clearInterval(timerIv);
  if(!reason)reason='KO';
  if(gameMode==='online')wsSend('game_over',{winner:winner,reason:reason});
  showOverlay(reason==='KO'?'K.O.!':'TIME OUT!','PLAYER '+winner+' VENCEU');
  setTimeout(function(){hideOverlay();showResultScreen(winner);},2600);
}

function showResultScreen(w){
  showScreen('result-screen');
  var isWinner=(gameMode==='bot')?(w===1):(w===myNum);
  document.getElementById('result-label').textContent=isWinner?'VOCÊ VENCEU! 🏆':'VOCÊ PERDEU 💀';
  document.getElementById('result-name').textContent='PLAYER '+w;
  document.getElementById('result-status').textContent='';
  document.getElementById('btn-rematch').disabled=false;
}

// ================================================================
// OVERLAY + FLASH
// ================================================================
function showOverlay(t,s){
  document.getElementById('overlay-text').textContent=t||'';
  document.getElementById('overlay-sub').textContent=s||'';
  document.getElementById('game-overlay').style.display='flex';
}
function hideOverlay(){document.getElementById('game-overlay').style.display='none';}
function flashScreen(){
  canvas.style.filter='brightness(2.5)';
  setTimeout(function(){canvas.style.filter='';},60);
}

// ================================================================
// INICIAR PARTIDA
// ================================================================
function startGame(){
  p1=new Fighter(140,1);p2=new Fighter(610,2);
  p1.facing=1;p2.facing=-1;
  if(gameMode==='bot'){p2.isBot=true;}
  particles=[];overFired=false;running=false;lastSent='';
  lobbyAnim=false;
  botState.frameCount=0;botState.reactionDelay=18;
  updateHUD();
  showScreen('game-screen');
  setupMobileControls();
  setTimeout(fitCanvas,50);
  setTimeout(fitCanvas,200);
  var steps=['ROUND 1','3','2','1','FIGHT! 🥊'];
  var idx=0;
  function tick(){
    showOverlay(steps[idx]);idx++;
    if(idx<steps.length){setTimeout(tick,750);}
    else{hideOverlay();running=true;startTimer();}
  }
  tick();
}

// ================================================================
// LOOP PRINCIPAL
// ================================================================
function loop(){
  ctx.save();
  ctx.translate(camShake.x,camShake.y);
  ctx.clearRect(-10,-10,CW+20,CH+20);
  drawBg();
  if(running){
    if(gameMode==='bot'){doInputBot();updateBot();}
    else{doInput();}
  }
  updateCamera();
  p1.update();p2.update();
  updateParticles();
  p1.draw(ctx);p2.draw(ctx);
  drawParticles();
  // Stamina HUD no canvas (barrinhas embaixo dos personagens)
  drawStaminaBars();
  ctx.restore();
  if(running){checkHits();if(gameMode==='online')sendState();}
  requestAnimationFrame(loop);
}

// Barras de stamina desenhadas no canvas
function drawStaminaBars(){
  if(!running)return;
  drawStBar(p1);
  drawStBar(p2);
}

function drawStBar(f){
  var bw=60,bh=6;
  var bx=f.x+f.w/2-bw/2;
  var by=f.y-f.h-16;
  // Fundo
  ctx.fillStyle='rgba(0,0,0,0.6)';
  ctx.fillRect(bx-1,by-1,bw+2,bh+2);
  // Barra
  var ratio=f.st/MAX_ST;
  var barColor=ratio>0.5?'#00ff88':ratio>0.25?'#ffaa00':'#ff3333';
  ctx.fillStyle=barColor;
  ctx.fillRect(bx,by,bw*ratio,bh);
  // Ícone
  ctx.fillStyle='rgba(255,255,255,0.6)';
  ctx.font='8px Arial';
  ctx.textAlign='center';
  ctx.fillText('ST',f.x+f.w/2,by-2);
}

// ================================================================
// TELAS
// ================================================================
function showScreen(id){
  var all=document.querySelectorAll('.screen');
  for(var i=0;i<all.length;i++)all[i].classList.remove('active');
  var el=document.getElementById(id);
  if(el)el.classList.add('active');
  if(id==='lobby-screen'){lobbyAnim=true;animateLobby();}
  if(id==='game-screen'){setTimeout(fitCanvas,100);}
}

function setStatus(msg){
  var el=document.getElementById('lobby-status');
  if(el)el.textContent=msg;
}

// ================================================================
// BOTÕES
// ================================================================
document.getElementById('btn-quick-match').addEventListener('click',function(){
  setStatus('⚡ Procurando oponente...');connectAndDo('quick_match');
});
document.getElementById('btn-create-room').addEventListener('click',function(){
  setStatus('🏠 Criando sala...');connectAndDo('create_room');
});
document.getElementById('btn-join-room').addEventListener('click',function(){
  document.getElementById('join-panel').style.display='flex';
  document.getElementById('btn-join-room').style.display='none';
  document.getElementById('room-code-input').focus();
});
document.getElementById('btn-confirm-join').addEventListener('click',function(){
  var code=document.getElementById('room-code-input').value.trim().toUpperCase();
  if(code.length<4){setStatus('⚠️ Digite 4 caracteres!');return;}
  setStatus('🔗 Entrando...');connectAndDo('join_room',{roomId:code});
});
document.getElementById('room-code-input').addEventListener('keydown',function(e){
  if(e.key==='Enter')document.getElementById('btn-confirm-join').click();
});
document.getElementById('btn-cancel-join').addEventListener('click',function(){
  document.getElementById('join-panel').style.display='none';
  document.getElementById('btn-join-room').style.display='';
  document.getElementById('room-code-input').value='';setStatus('');
});
document.getElementById('btn-cancel-wait').addEventListener('click',function(){
  if(socket)socket.close();roomId='';myNum=0;
  showScreen('lobby-screen');setStatus('');
});
document.getElementById('btn-rematch').addEventListener('click',function(){
  if(gameMode==='bot'){gameMode='bot';startGame();}
  else{wsSend('request_rematch');document.getElementById('result-status').textContent='⏳ Aguardando...';document.getElementById('btn-rematch').disabled=true;}
});
document.getElementById('btn-back-lobby').addEventListener('click',function(){
  if(socket)socket.close();roomId='';myNum=0;gameMode='';
  showScreen('lobby-screen');setStatus('');
});

// Botão VS BOT (adicionado dinamicamente se não existir no HTML)
var btnBot=document.getElementById('btn-vs-bot');
if(btnBot){
  btnBot.addEventListener('click',function(){
    gameMode='bot';myNum=1;
    startGame();
  });
}

// ================================================================
// INICIA
// ================================================================
loop();
