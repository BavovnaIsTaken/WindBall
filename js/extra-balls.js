"use strict";

  // ---------- billiard mode: extra colored balls ----------
  let extraBalls = [];
  const EXTRA_BALL_COLORS = ['#ffcf40','#ff5c5c','#4ea1ff','#8a5cff','#ff8fd1','#4fe0a8','#ff9f43','#5ce1e6','#ffe14d','#c25cff'];
  function spawnExtraBall(){
    const angle = Math.random()*Math.PI*2;
    const rr = Math.random()*Math.min(PLAY_W,H)*0.22;
    let ex = PLAY_W*0.5 + Math.cos(angle)*rr;
    let ey = H*0.4 + Math.sin(angle)*rr*0.6;
    ex = Math.max(WALL_MARGIN+BALL_R*1.6, Math.min(PLAY_W-WALL_MARGIN-BALL_R*1.6, ex));
    ey = Math.max(WALL_MARGIN+BALL_R*1.6, Math.min(H-WALL_MARGIN-BALL_R*1.6, ey));
    extraBalls.push({
      x: ex, y: ey, vx:0, vy:0, rot:0,
      color: EXTRA_BALL_COLORS[extraBalls.length % EXTRA_BALL_COLORS.length]
    });
  }
  function updateExtraBalls(dt){
    for(const eb of extraBalls){
      const speed = Math.hypot(eb.vx, eb.vy);
      if(speed > 1){
        const decel = Math.min(speed, frictionLevel*900*dt + 30*dt);
        const nx = eb.vx/speed, ny = eb.vy/speed;
        eb.vx -= nx*decel; eb.vy -= ny*decel;
      } else { eb.vx = 0; eb.vy = 0; }

      if(mode==='gravity' || gravityEnabled){ eb.vy += gravityStrength*dt; }

      eb.x += eb.vx*dt; eb.y += eb.vy*dt;

      if(eb.x < WALL_MARGIN+BALL_R){ eb.x = WALL_MARGIN+BALL_R; eb.vx = -eb.vx*RESTITUTION; }
      if(eb.x > PLAY_W-WALL_MARGIN-BALL_R){ eb.x = PLAY_W-WALL_MARGIN-BALL_R; eb.vx = -eb.vx*RESTITUTION; }
      if(eb.y < WALL_MARGIN+BALL_R){ eb.y = WALL_MARGIN+BALL_R; eb.vy = -eb.vy*RESTITUTION; }
      if(eb.y > H-WALL_MARGIN-BALL_R){ eb.y = H-WALL_MARGIN-BALL_R; eb.vy = -eb.vy*RESTITUTION; }

      eb.rot += Math.hypot(eb.vx,eb.vy)*dt*0.012;
    }

    // ball-to-ball collisions — the cue ball and every extra ball, all pairs,
    // simple equal-mass elastic exchange along the collision normal
    const all = [ball, ...extraBalls];
    for(let i=0;i<all.length;i++){
      for(let j=i+1;j<all.length;j++){
        const a = all[i], b2 = all[j];
        const dx = b2.x-a.x, dy = b2.y-a.y;
        const d = Math.hypot(dx,dy);
        const minD = BALL_R*2;
        if(d>0 && d<minD){
          const nx = dx/d, ny = dy/d;
          const overlap = minD-d;
          a.x -= nx*overlap*0.5; a.y -= ny*overlap*0.5;
          b2.x += nx*overlap*0.5; b2.y += ny*overlap*0.5;
          const avn = a.vx*nx+a.vy*ny, bvn = b2.vx*nx+b2.vy*ny;
          const avtX = a.vx-avn*nx, avtY = a.vy-avn*ny;
          const bvtX = b2.vx-bvn*nx, bvtY = b2.vy-bvn*ny;
          a.vx = avtX + bvn*nx*RESTITUTION; a.vy = avtY + bvn*ny*RESTITUTION;
          b2.vx = bvtX + avn*nx*RESTITUTION; b2.vy = bvtY + avn*ny*RESTITUTION;
        }
      }
    }

    // pocketing — a potted extra ball scores and is removed from the table
    if(mode==='billiard'){
      for(let i=extraBalls.length-1;i>=0;i--){
        const eb = extraBalls[i];
        for(const p of getPockets()){
          if(dist(eb.x,eb.y,p.x,p.y) < POCKET_R - BALL_R*0.15){
            score++; scoreN.textContent = score;
            if(score > best){ best = score; bestN.textContent = best; saveBest(); }
            spawnBurst(p.x, p.y);
            extraBalls.splice(i,1);
            break;
          }
        }
      }
    }
  }
  function drawExtraBalls(){
    for(const eb of extraBalls){
      ctx.save();
      ctx.translate(eb.x+3, eb.y+4);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.arc(0,0,BALL_R*0.92,0,Math.PI*2); ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(eb.x, eb.y);
      ctx.rotate(eb.rot);
      const bg = ctx.createRadialGradient(-BALL_R*0.35,-BALL_R*0.4,2, 0,0, BALL_R*1.15);
      bg.addColorStop(0,'#ffffff');
      bg.addColorStop(0.35, eb.color);
      bg.addColorStop(1, eb.color);
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(0,0,BALL_R,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0,0,BALL_R*0.98,0,Math.PI*2); ctx.stroke();
      ctx.restore();
    }
  }

  
  function buildBgTiles(){
    bgTiles = [];
    const cols = Math.ceil(PLAY_W/TILE)+1;
    const rows = Math.ceil(H/TILE)+1;
    for(let gy=0; gy<rows; gy++){
      for(let gx=0; gx<cols; gx++){
        const seed = (gx*928371 + gy*123457) % 1000;
        const topRightBias = (gx/cols) - (gy/rows);
        const checker = (topRightBias > 0.15) && (seed%3!==0);
        const pal = TILE_PALETTES[checker ? 1 : 0];
        const cTop = hexToRgb(pal.top), cBot = hexToRgb(pal.bot);
        bgTiles.push({
          gx, gy, checker,
          colorTop: cTop, colorBot: cBot,
          targetTop: {...cTop}, targetBot: {...cBot}
        });
      }
    }
  }

  function updateBgTileColors(dt){
    const rate = Math.min(1, dt*1.2); // slow, ambient drift — not attention-grabbing
    for(const t of bgTiles){
      t.colorTop.r += (t.targetTop.r-t.colorTop.r)*rate;
      t.colorTop.g += (t.targetTop.g-t.colorTop.g)*rate;
      t.colorTop.b += (t.targetTop.b-t.colorTop.b)*rate;
      t.colorBot.r += (t.targetBot.r-t.colorBot.r)*rate;
      t.colorBot.g += (t.targetBot.g-t.colorBot.g)*rate;
      t.colorBot.b += (t.targetBot.b-t.colorBot.b)*rate;
    }
  }

  function maybeCycleBgTileColors(dt){
    bgColorCycleTimer += dt;
    if(bgColorCycleTimer < bgCycleDelay) return;
    bgColorCycleTimer = 0;
    if(!bgTiles.length) return;
    const n = Math.min(bgTiles.length, 1 + Math.floor(Math.random()*bgCycleCount));
    for(let i=0;i<n;i++){
      const t = bgTiles[Math.floor(Math.random()*bgTiles.length)];
      const pal = TILE_PALETTES[Math.floor(Math.random()*TILE_PALETTES.length)];
      t.targetTop = hexToRgb(pal.top);
      t.targetBot = hexToRgb(pal.bot);
    }
  }

  function resize(){
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    W = viewW;
    if(bigFieldMode){ PLAY_W = bigFieldW; H = bigFieldH; }
    else { PLAY_W = viewW; H = viewH; }
    canvas.width = Math.round(viewW * DPR);
    canvas.height = Math.round(viewH * DPR);
    canvas.style.width = viewW + 'px';
    canvas.style.height = viewH + 'px';
    ctx.setTransform(DPR,0,0,DPR,0,0);
    if (fan) fan.x = Math.min(fan.x, PLAY_W - 20), fan.y = Math.min(fan.y, H - 20);
    buildBgTiles();
    if(bigFieldMode) clampCamera(); else { camera.x = PLAY_W/2; camera.y = H/2; camera.zoom = 1; }
  }

  function minFitZoom(){ return viewW/PLAY_W; }
  function clampCamera(){
    const minZ = minFitZoom();
    camera.zoom = Math.max(minZ, Math.min(2.5, camera.zoom));
    const halfW = (viewW/2)/camera.zoom, halfH = (viewH/2)/camera.zoom;
    camera.x = (halfW*2 > PLAY_W) ? PLAY_W/2 : Math.max(halfW, Math.min(PLAY_W-halfW, camera.x));
    camera.y = (halfH*2 > H) ? H/2 : Math.max(halfH, Math.min(H-halfH, camera.y));
  }
  function screenToWorld(sx, sy){
    return { x: camera.x + (sx - viewW/2)/camera.zoom, y: camera.y + (sy - viewH/2)/camera.zoom };
  }

