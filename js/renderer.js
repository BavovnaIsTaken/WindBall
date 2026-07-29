"use strict";

  // ---------- rendering ----------
  function roundRect(c,x,y,w,h,r){
    c.beginPath();
    c.moveTo(x+r,y);
    c.arcTo(x+w,y,x+w,y+h,r);
    c.arcTo(x+w,y+h,x,y+h,r);
    c.arcTo(x,y+h,x,y,r);
    c.arcTo(x,y,x+w,y,r);
    c.closePath();
  }

  function drawBackground(){
    const FRAME_INSET = 2; // matches the ~1-2px gap already used between tiles, not the physics WALL_MARGIN
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, FRAME_INSET,FRAME_INSET,PLAY_W-FRAME_INSET*2,H-FRAME_INSET*2,14);
    ctx.clip(); // tiles get cut cleanly at the frame's own shape, so far edges can never overshoot or fall short of it

    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#0c1730');
    g.addColorStop(1,'#0a1226');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,PLAY_W,H);

    for(const t of bgTiles){
      const px = t.gx*TILE, py = t.gy*TILE;
      if(px>PLAY_W || py>H) continue;
      const tg = ctx.createLinearGradient(px,py,px+TILE,py+TILE);
      tg.addColorStop(0, rgbCss(t.colorTop));
      tg.addColorStop(1, rgbCss(t.colorBot));
      ctx.fillStyle = tg;
      roundRect(ctx, px+1,py+1,TILE-2,TILE-2,6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(ctx, px+4,py+4,TILE-8,TILE*0.32,5);
      ctx.fill();
    }

    if(mode==='billiard'){
      ctx.fillStyle = 'rgba(18,92,56,0.58)';
      ctx.fillRect(0,0,PLAY_W,H);
    }

    const vg = ctx.createRadialGradient(PLAY_W/2,H/2, Math.min(PLAY_W,H)*0.2, PLAY_W/2,H/2, Math.max(PLAY_W,H)*0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = vg;
    ctx.fillRect(0,0,PLAY_W,H);
    ctx.restore();

    ctx.strokeStyle = 'rgba(127,215,255,0.5)';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(127,215,255,0.35)';
    ctx.shadowBlur = 10;
    roundRect(ctx, FRAME_INSET,FRAME_INSET,PLAY_W-FRAME_INSET*2,H-FRAME_INSET*2,14);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function blockShapePath(c, b, pad){
    pad = pad || 0;
    if(b.shape === 'circle' || b.shape === 'fan'){
      const r = b.r + pad;
      c.beginPath();
      if(b.visual === 'quarter'){ c.moveTo(0,0); c.arc(0,0,r,-Math.PI/2,0); c.closePath(); }
      else { c.arc(0,0,r,0,Math.PI*2); }
    } else if(b.shape === 'wave'){
      const hw = b.w/2+pad, hh = b.h/2+pad;
      roundRect(c, -hw,-hh,hw*2,hh*2, Math.min(hw,hh,20));
    } else {
      const hw = b.w/2+pad, hh = b.h/2+pad;
      const r = b.capsule ? Math.min(hw,hh) : 10;
      roundRect(c, -hw,-hh,hw*2,hh*2,r);
    }
  }

  function renderBlockShape(c, b, held){
    if(held){
      // the glow is drawn as its own simple, solid-color pass — combining a
      // large shadowBlur directly with a gradient stroke/fill on a curved path
      // causes visible rendering seams in canvas, so blur never touches the
      // gradient pass at all
      c.shadowColor = 'rgba(127,215,255,0.85)';
      c.shadowBlur = 24;
      c.fillStyle = 'rgba(127,215,255,0.02)';
      c.strokeStyle = 'rgba(127,215,255,0.02)';
      if(b.shape === 'wave'){
        c.lineCap = 'round'; c.lineWidth = b.thick;
        for(const seg of waveSegments(b.bumps, b.r)){
          c.beginPath(); c.arc(seg.cx, seg.cy, b.r, seg.spanStart, seg.spanEnd); c.stroke();
        }
      } else if(b.shape === 'spinner'){
        c.lineCap = 'round'; c.lineWidth = b.bladeW;
        for(let k=0;k<b.blades;k++){
          const a = k*(Math.PI*2/b.blades);
          c.save(); c.rotate(a);
          c.beginPath(); c.moveTo(0,0); c.lineTo(b.bladeLen,0); c.stroke();
          c.restore();
        }
      } else if(b.shape === 'pipe'){
        c.lineCap = 'round'; c.lineWidth = b.pipeW;
        c.beginPath();
        const p0 = pipeLocalPointAt(b,0);
        c.moveTo(p0.x,p0.y);
        for(let i=1;i<=16;i++){ const p = pipeLocalPointAt(b,i/16); c.lineTo(p.x,p.y); }
        c.stroke();
      } else {
        blockShapePath(c, b);
        c.fill();
      }
    }
    c.shadowBlur = 0; // detail rendering below is always crisp, regardless of held state

    if(b.shape === 'pipe'){
      c.lineCap = 'round'; c.lineJoin = 'round';

      if(b.showRangeHighlight){
        const capR = (BALL_R+8) * b.suctionRange;
        const inletP0 = pipeLocalPointAt(b,0);
        const localR = capR / Math.max(0.05, b.scale);
        const rg = c.createRadialGradient(inletP0.x,inletP0.y,0, inletP0.x,inletP0.y, localR);
        rg.addColorStop(0,    'rgba(255,70,70,0.5)');   // red — strongest pull, right at the inlet
        rg.addColorStop(0.35, 'rgba(255,150,60,0.36)'); // orange
        rg.addColorStop(0.65, 'rgba(255,224,90,0.24)'); // yellow
        rg.addColorStop(1,    'rgba(90,160,255,0.12)'); // blue — weakest, at the edge of the zone
        c.fillStyle = rg;
        c.beginPath();
        c.arc(inletP0.x, inletP0.y, localR, 0, Math.PI*2);
        c.fill();
        c.strokeStyle = 'rgba(120,170,255,0.55)';
        c.lineWidth = 1.5;
        c.stroke();
      }

      const N = 24;
      const samples = [];
      for(let i=0;i<=N;i++){
        const t = i/N;
        const p = pipeLocalPointAt(b,t);
        const tPrev = pipeLocalPointAt(b, Math.max(0,t-0.01));
        const tNext = pipeLocalPointAt(b, Math.min(1,t+0.01));
        let tx = tNext.x-tPrev.x, ty = tNext.y-tPrev.y;
        const tl = Math.hypot(tx,ty)||1; tx/=tl; ty/=tl;
        samples.push({ x:p.x, y:p.y, nx:-ty, ny:tx, hw: pipeWidthAt(b,t)/2 });
      }

      // filled body — tapered, wider right at the inlet, using the block's own palette like every other block
      c.beginPath();
      c.moveTo(samples[0].x+samples[0].nx*samples[0].hw, samples[0].y+samples[0].ny*samples[0].hw);
      for(let i=1;i<samples.length;i++){ const s=samples[i]; c.lineTo(s.x+s.nx*s.hw, s.y+s.ny*s.hw); }
      for(let i=samples.length-1;i>=0;i--){ const s=samples[i]; c.lineTo(s.x-s.nx*s.hw, s.y-s.ny*s.hw); }
      c.closePath();

      const bodyGrad = c.createLinearGradient(-b.w/2,-b.h/2,b.w/2,b.h/2);
      bodyGrad.addColorStop(0,rgbCss(b.colorLight)); bodyGrad.addColorStop(0.5,rgbCss(b.colorMid)); bodyGrad.addColorStop(1,rgbCss(b.colorDark));
      c.fillStyle = bodyGrad;
      c.fill();
      c.strokeStyle = held ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.65)';
      c.lineWidth = 2;
      c.stroke();

      // glossy highlight tracing one side of the contour, fading in and out at the ends
      c.beginPath();
      const s0 = samples[0];
      c.moveTo(s0.x+s0.nx*s0.hw*0.55, s0.y+s0.ny*s0.hw*0.55);
      for(let i=1;i<samples.length;i++){ const s=samples[i]; c.lineTo(s.x+s.nx*s.hw*0.55, s.y+s.ny*s.hw*0.55); }
      const sN = samples[samples.length-1];
      const shineGrad = c.createLinearGradient(s0.x,s0.y, sN.x,sN.y);
      shineGrad.addColorStop(0,'rgba(255,255,255,0.05)');
      shineGrad.addColorStop(0.5,'rgba(255,255,255,0.6)');
      shineGrad.addColorStop(1,'rgba(255,255,255,0.05)');
      c.strokeStyle = shineGrad;
      c.lineWidth = Math.max(2.5, b.pipeW*0.16);
      c.stroke();

      // dashed centerline, like lane markings on a road
      c.save();
      c.setLineDash([9,7]);
      c.strokeStyle = 'rgba(255,255,255,0.55)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(samples[0].x, samples[0].y);
      for(let i=1;i<samples.length;i++) c.lineTo(samples[i].x, samples[i].y);
      c.stroke();
      c.restore();

      return;
    }

    if(b.shape === 'fan'){
      const hg = c.createRadialGradient(0,-b.r*0.15,2,0,0,b.r);
      hg.addColorStop(0,'#3a4a58'); hg.addColorStop(1,'#151c22');
      c.fillStyle = hg;
      c.beginPath(); c.arc(0,0,b.r,0,Math.PI*2); c.fill();
      c.strokeStyle = held ? 'rgba(255,255,255,0.95)' : 'rgba(127,215,255,0.55)';
      c.lineWidth = 2; c.stroke();

      c.save();
      c.rotate(b.bladeSpin);
      for(let i=0;i<4;i++){
        c.save();
        c.rotate(i*Math.PI/2);
        const isBlue = (i%2===0);
        const bg = c.createLinearGradient(0,-b.r*0.08,0,-b.r*0.82);
        if(isBlue){ bg.addColorStop(0,'#a9e3ff'); bg.addColorStop(1,'#1a78d6'); }
        else { bg.addColorStop(0,'#fff3b0'); bg.addColorStop(1,'#f2b400'); }
        c.fillStyle = bg;
        c.beginPath();
        c.ellipse(0,-b.r*0.42, b.r*0.24, b.r*0.46, 0, 0, Math.PI*2);
        c.fill();
        c.restore();
      }
      c.restore();
      return;
    }

    if(b.shape === 'wave'){
      c.lineCap = 'round';
      const segs = waveSegments(b.bumps, b.r);
      const grad = c.createLinearGradient(-b.w/2,0,b.w/2,0);
      grad.addColorStop(0,rgbCss(b.colorLight)); grad.addColorStop(0.5,rgbCss(b.colorMid)); grad.addColorStop(1,rgbCss(b.colorDark));
      c.strokeStyle = grad;
      c.lineWidth = b.thick;
      for(const seg of segs){
        c.beginPath();
        c.arc(seg.cx, seg.cy, b.r, seg.spanStart, seg.spanEnd);
        c.stroke();
      }
      c.strokeStyle = 'rgba(255,255,255,0.3)';
      c.lineWidth = b.thick*0.32;
      for(const seg of segs){
        c.beginPath();
        c.arc(seg.cx, seg.cy, Math.max(1,b.r - b.thick*0.26), seg.spanStart, seg.spanEnd);
        c.stroke();
      }
      c.strokeStyle = held ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.65)';
      c.lineWidth = 2;
      for(const seg of segs){
        c.beginPath(); c.arc(seg.cx, seg.cy, b.r + b.thick/2, seg.spanStart, seg.spanEnd); c.stroke();
        c.beginPath(); c.arc(seg.cx, seg.cy, Math.max(1,b.r - b.thick/2), seg.spanStart, seg.spanEnd); c.stroke();
      }
      return;
    }

    if(b.shape === 'spinner'){
      c.lineCap = 'round';
      const grad = c.createLinearGradient(-b.bladeLen,0,b.bladeLen,0);
      grad.addColorStop(0,rgbCss(b.colorLight)); grad.addColorStop(0.5,rgbCss(b.colorMid)); grad.addColorStop(1,rgbCss(b.colorDark));
      for(let k=0;k<b.blades;k++){
        const a = k*(Math.PI*2/b.blades);
        c.save();
        c.rotate(a);
        c.strokeStyle = grad;
        c.lineWidth = b.bladeW;
        c.beginPath(); c.moveTo(0,0); c.lineTo(b.bladeLen,0); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.3)';
        c.lineWidth = b.bladeW*0.35;
        c.beginPath(); c.moveTo(b.bladeLen*0.12,0); c.lineTo(b.bladeLen*0.85,0); c.stroke();
        c.strokeStyle = held ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.65)';
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(0,0); c.lineTo(b.bladeLen,0); c.stroke();
        c.restore();
      }
      const hubR = b.bladeW*0.55;
      c.fillStyle = '#12181F';
      c.beginPath(); c.arc(0,0,hubR,0,Math.PI*2); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth=1.5; c.stroke();
      return;
    }

    if(b.bouncy){
      const g = c.createLinearGradient(-b.w/2,-b.h/2,b.w/2,b.h/2);
      g.addColorStop(0,'#fff3a0'); g.addColorStop(0.5,'#ffb238'); g.addColorStop(1,'#e0740a');
      c.fillStyle = g;
      blockShapePath(c, b);
      c.fill();

      c.strokeStyle = 'rgba(140,60,0,0.55)';
      c.lineWidth = Math.max(2, b.h*0.12);
      c.lineCap = 'round'; c.lineJoin = 'round';
      const hw = b.w/2, hh = b.h/2, zig = hh*0.55, segs = 6;
      c.beginPath();
      for(let i=0;i<=segs;i++){
        const px = -hw*0.78 + (hw*1.56)*(i/segs);
        const py = (i%2===0) ? -zig : zig;
        if(i===0) c.moveTo(px,py); else c.lineTo(px,py);
      }
      c.stroke();

      c.strokeStyle = held ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.65)';
      c.lineWidth = 2;
      blockShapePath(c, b);
      c.stroke();
      return;
    }

    const g = c.createLinearGradient(-b.w/2,-b.h/2,b.w/2,b.h/2);
    g.addColorStop(0,rgbCss(b.colorLight)); g.addColorStop(0.5,rgbCss(b.colorMid)); g.addColorStop(1,rgbCss(b.colorDark));
    c.fillStyle = g;
    blockShapePath(c, b);
    c.fill();

    c.fillStyle='rgba(255,255,255,0.32)';
    if(b.visual === 'quarter'){
      const r = b.r;
      const arcR = r * 0.82;
      const aStart = -Math.PI/2 + 0.15;
      const aEnd = -0.15;
      const grad = c.createLinearGradient(
        Math.cos(aStart)*arcR, Math.sin(aStart)*arcR,
        Math.cos(aEnd)*arcR, Math.sin(aEnd)*arcR
      );
      grad.addColorStop(0, 'rgba(255,255,255,0.04)');
      grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0.04)');
      c.strokeStyle = grad;
      c.lineWidth = r*0.14;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(0,0, arcR, aStart, aEnd, false);
      c.stroke();
    } else if(b.shape === 'circle'){
      const r = b.r;
      c.beginPath();
      c.ellipse(-r*0.25,-r*0.3, r*0.42, r*0.24, -0.5, 0, Math.PI*2);
      c.fill();
    } else {
      const hw=b.w/2, hh=b.h/2;
      roundRect(c, -hw+4,-hh+4,b.w-8,hh*0.55,8); c.fill();
    }

    c.strokeStyle = held ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.65)';
    c.lineWidth=2;
    blockShapePath(c, b);
    c.stroke();
  }

  function drawBlocks(){
    for(const b of blocks){
      if(b.spawnT===null || b.scale<=0.001) continue;
      const held = (b === draggedBlock);
      ctx.save();
      ctx.translate(b.x,b.y);
      ctx.rotate(b.rot||0);
      ctx.scale(b.scale * (held?1.06:1), b.scale * (held?1.06:1));
      renderBlockShape(ctx, b, held);
      ctx.restore();
    }
  }

  function updateConfettiPiece(c, ax, ay, baseAngle, dt){
    const w = windAt(ax, ay);
    // each ribbon only knows about the wind at its OWN anchor point — this is
    // what makes it work automatically for sector fans: anchors outside the
    // blown sector just see zero wind and hang still.
    const targetAngle = (w.strength > 5) ? Math.atan2(w.vy, w.vx) : baseAngle;
    let diff = targetAngle - c.curAngle;
    while(diff > Math.PI) diff -= Math.PI*2;
    while(diff < -Math.PI) diff += Math.PI*2;
    const K = 20, D = 2*Math.sqrt(K)*0.65;
    const acc = diff*K - c.curAngleVel*D;
    c.curAngleVel += acc*dt;
    c.curAngle += c.curAngleVel*dt;
    c.flutterT += dt;
  }

  function drawConfettiPiece(targetCtx, piece, ax, ay){
    const flutter = Math.sin(piece.flutterT*piece.swaySpeed + piece.swayPhase) * 0.22;
    const drawAngle = piece.curAngle + flutter;
    const perpX = -Math.sin(drawAngle), perpY = Math.cos(drawAngle);
    const wobble = Math.sin(piece.flutterT*piece.swaySpeed*1.8 + piece.swayPhase) * piece.len*0.18;
    const tipX = ax + Math.cos(drawAngle)*piece.len;
    const tipY = ay + Math.sin(drawAngle)*piece.len;
    const midX = ax + Math.cos(drawAngle)*piece.len*0.5 + perpX*wobble;
    const midY = ay + Math.sin(drawAngle)*piece.len*0.5 + perpY*wobble;
    targetCtx.strokeStyle = piece.color;
    targetCtx.lineWidth = 3;
    targetCtx.lineCap = 'round';
    targetCtx.beginPath();
    targetCtx.moveTo(ax,ay);
    targetCtx.quadraticCurveTo(midX,midY, tipX,tipY);
    targetCtx.stroke();
  }

  function updateConfetti(dt){
    if(mode==='ball') return;
    if(fanEnabled){
      const anchorR = fan.bodyR + 6;
      for(const c of confettiPieces){
        const ax = fan.x + Math.cos(c.anchorAngle)*anchorR;
        const ay = fan.y + Math.sin(c.anchorAngle)*anchorR;
        updateConfettiPiece(c, ax, ay, c.anchorAngle, dt);
      }
    }
    if(blocksActive()){
      for(const b of blocks){
        if(b.shape !== 'fan' || !b.confetti || b.spawnT===null) continue;
        const r = b.r*b.scale + 6;
        for(const c of b.confetti){
          const worldAngle = (b.rot||0) + c.anchorAngle;
          const ax = b.x + Math.cos(worldAngle)*r;
          const ay = b.y + Math.sin(worldAngle)*r;
          updateConfettiPiece(c, ax, ay, worldAngle, dt);
        }
      }
    }
  }

  function drawConfetti(){
    if(mode==='ball') return;
    if(fanEnabled){
      const anchorR = fan.bodyR + 6;
      for(const c of confettiPieces){
        const ax = fan.x + Math.cos(c.anchorAngle)*anchorR;
        const ay = fan.y + Math.sin(c.anchorAngle)*anchorR;
        drawConfettiPiece(ctx, c, ax, ay);
      }
    }
    if(blocksActive()){
      for(const b of blocks){
        if(b.shape !== 'fan' || !b.confetti || b.spawnT===null) continue;
        const r = b.r*b.scale + 6;
        for(const c of b.confetti){
          const worldAngle = (b.rot||0) + c.anchorAngle;
          const ax = b.x + Math.cos(worldAngle)*r;
          const ay = b.y + Math.sin(worldAngle)*r;
          drawConfettiPiece(ctx, c, ax, ay);
        }
      }
    }
  }

  function drawFan(){
    const x=fan.x,y=fan.y;
    ctx.save();
    ctx.translate(x,y);
    const hg = ctx.createRadialGradient(0,-6,4,0,0,fan.bodyR+6);
    hg.addColorStop(0,'#3a4a58');
    hg.addColorStop(1,'#141b22');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(0,0,fan.bodyR+6,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(76,211,255,0.55)'; ctx.lineWidth=2; ctx.stroke();

    ctx.rotate(fan.bladeSpin);
    for(let i=0;i<4;i++){
      ctx.save();
      ctx.rotate(i*Math.PI/2);
      const isBlue = (i%2===0);
      const bg = ctx.createLinearGradient(0,-fan.bodyR*0.1,0,-fan.bodyR*1.05);
      if(isBlue){ bg.addColorStop(0,'#a9e3ff'); bg.addColorStop(1,'#1a78d6'); }
      else { bg.addColorStop(0,'#fff3b0'); bg.addColorStop(1,'#f2b400'); }
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.ellipse(0,-fan.bodyR*0.5, fan.bodyR*0.32, fan.bodyR*0.62, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=1;
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle='#0B0F14';
    ctx.beginPath(); ctx.arc(0,0,fan.bodyR*0.28,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(255,122,69,0.75)'; ctx.lineWidth=2; ctx.stroke();
    ctx.restore();
  }

  const POCKET_R = 27;
  function getPockets(){
    const inset = WALL_MARGIN + POCKET_R*0.55;
    return [
      { x: inset,             y: inset },
      { x: PLAY_W - inset,    y: inset },
      { x: inset,             y: H - inset },
      { x: PLAY_W - inset,    y: H - inset },
      { x: WALL_MARGIN + POCKET_R*0.35, y: H/2 },
      { x: PLAY_W - WALL_MARGIN - POCKET_R*0.35, y: H/2 }
    ];
  }
  function drawPockets(){
    for(const p of getPockets()){
      const rg = ctx.createRadialGradient(p.x,p.y,0, p.x,p.y,POCKET_R);
      rg.addColorStop(0, 'rgba(0,0,0,0.95)');
      rg.addColorStop(0.7, 'rgba(10,8,6,0.9)');
      rg.addColorStop(1, 'rgba(10,8,6,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(p.x,p.y,POCKET_R,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(120,90,55,0.85)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(p.x,p.y,POCKET_R*0.82,0,Math.PI*2); ctx.stroke();
    }
  }

  function drawRing(){
    ctx.save();
    ctx.translate(ring.curX, ring.curY);
    ctx.beginPath();
    ctx.arc(0,0,ring.r,0,Math.PI*2);
    ctx.strokeStyle='rgba(55,209,122,0.9)';
    ctx.lineWidth=6;
    ctx.shadowColor='rgba(55,209,122,0.6)';
    ctx.shadowBlur=16;
    ctx.stroke();
    ctx.restore();
  }

  function drawAimGuide(){
    if(mode!=='billiard' || aimId===null) return;

    const pullX = aimPX - aimStartX, pullY = aimPY - aimStartY;
    const pullDistRaw = Math.hypot(pullX, pullY);
    if(pullDistRaw < 4) return;
    const pullDist = Math.min(AIM_MAX_PULL, pullDistRaw);
    const power = pullDist / AIM_MAX_PULL;
    const ux = pullX/pullDistRaw, uy = pullY/pullDistRaw; // toward the pull point — where the ball currently sits
    const sx = -ux, sy = -uy; // shoot direction — opposite the pull, where it flies once released

    // single arrow showing where the ball will fly, length scales with shot power
    const aimLen = 60 + power*140;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ball.x + sx*(BALL_R+6), ball.y + sy*(BALL_R+6));
    ctx.lineTo(ball.x + sx*aimLen, ball.y + sy*aimLen);
    ctx.stroke();

    const ax = ball.x + sx*aimLen, ay = ball.y + sy*aimLen;
    const perpX = -sy, perpY = sx;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(ax + sx*14, ay + sy*14);
    ctx.lineTo(ax - perpX*7, ay - perpY*7);
    ctx.lineTo(ax + perpX*7, ay + perpY*7);
    ctx.closePath();
    ctx.fill();
  }

  function drawBall(){
    ctx.save();
    ctx.translate(ball.x+3, ball.y+4);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.arc(0,0,BALL_R*0.92,0,Math.PI*2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.rot);
    ctx.scale(ball.sx, ball.sy);
    const bg = ctx.createRadialGradient(-BALL_R*0.35,-BALL_R*0.4,2, 0,0, BALL_R*1.15);
    bg.addColorStop(0,'#FFFFFF');
    bg.addColorStop(0.55,'#EAF3F8');
    bg.addColorStop(1,'#B9C6D0');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(0,0,BALL_R,0,Math.PI*2); ctx.fill();

    ctx.strokeStyle='rgba(120,140,155,0.55)';
    ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(0,0,BALL_R*0.72,0.3,Math.PI-0.3); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,BALL_R*0.72,Math.PI+0.3,Math.PI*2-0.3); ctx.stroke();
    ctx.restore();
  }

  function drawBurst(){
    for(const p of burstParticles){
      const t = 1 - p.life/p.maxLife;
      ctx.fillStyle = `rgba(55,209,122,${t})`;
      ctx.beginPath(); ctx.arc(p.x,p.y,3*t+1,0,Math.PI*2); ctx.fill();
    }
  }

  let velourPattern = null;
  function createVelourPattern(){
    const size = 72;
    const pc = document.createElement('canvas');
    pc.width = size; pc.height = size;
    const pctx = pc.getContext('2d');
    const g = pctx.createLinearGradient(0,0,size,size);
    g.addColorStop(0,'#0d1a3a'); g.addColorStop(1,'#0a1530');
    pctx.fillStyle = g;
    pctx.fillRect(0,0,size,size);
    // fine grain speckle to fake a velour/felt weave
    for(let i=0;i<420;i++){
      const gx = Math.random()*size, gy = Math.random()*size;
      const light = Math.random() < 0.5;
      pctx.fillStyle = light ? 'rgba(140,170,230,0.05)' : 'rgba(0,0,0,0.07)';
      pctx.fillRect(gx, gy, 1, 1);
    }
    velourPattern = ctx.createPattern(pc, 'repeat');
  }

  function render(){
    ctx.save();
    ctx.clearRect(0,0,viewW,viewH);
    if(velourPattern){ ctx.fillStyle = velourPattern; ctx.fillRect(0,0,viewW,viewH); }
    ctx.translate(viewW/2, viewH/2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    drawBackground();
    if(blocksActive()) drawBlocks();
    if(mode!=='ball') drawConfetti();
    if(mode==='billiard') drawPockets(); else drawRing();
    if(fanActive()) drawFan();
    drawAimGuide();
    drawExtraBalls();
    drawBall();
    drawBurst();
    ctx.restore();
  }

