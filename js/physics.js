"use strict";

  // ---------- wind field ----------
  // ---------- pipes: local channel path + world endpoints ----------
  function pipeLocalPointAt(b, t){
    if(b.pipeType === 'straight'){
      const half = b.length/2;
      const tt = b.flipped ? 1-t : t;
      return { x: -half + tt*b.length, y: 0 };
    }
    const arm = b.armLen;
    const flip = b.flipped ? -1 : 1;
    const p0x=-arm,p0y=0, p1x=0,p1y=0, p2x=0,p2y=-arm*flip; // quadratic bezier through the corner
    const mt = 1-t;
    return { x: mt*mt*p0x + 2*mt*t*p1x + t*t*p2x, y: mt*mt*p0y + 2*mt*t*p1y + t*t*p2y };
  }
  function pipeToWorld(b, lx, ly){
    const rot = b.rot||0, s = b.scale;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    return { x: b.x + (lx*cosR - ly*sinR)*s, y: b.y + (lx*sinR + ly*cosR)*s };
  }
  function pipeWorldPointAt(b, t){
    const lp = pipeLocalPointAt(b, t);
    return pipeToWorld(b, lp.x, lp.y);
  }
  function getPipeEndpoints(b){
    const rot = b.rot||0;
    const straightFlip = (b.pipeType==='straight' && b.flipped) ? Math.PI : 0;
    const dir0 = { x: Math.cos(rot+straightFlip), y: Math.sin(rot+straightFlip) }; // inlet faces local +x (inward), reversed if this straight pipe is flipped
    const outAngle = b.pipeType==='straight' ? (rot+straightFlip) : rot + (b.flipped ? Math.PI/2 : -Math.PI/2);
    const dirOut = { x: Math.cos(outAngle), y: Math.sin(outAngle) };
    return {
      inlet: pipeWorldPointAt(b, 0), inletDir: dir0,
      outlet: pipeWorldPointAt(b, 1), outletDir: dirOut
    };
  }
  function pipePathLength(b){
    return b.pipeType==='straight' ? b.length : b.armLen*1.57; // quarter-circle-ish estimate
  }
  function pipeWidthAt(b, t){
    // width tapers from a flared mouth at the inlet down to the normal channel width —
    // shared by rendering, hit-testing, and block-block separation so they all agree
    const tt = (b.pipeType==='straight' && b.flipped) ? 1-t : t;
    const flareT = Math.max(0, 1 - tt/0.3);
    return b.pipeW * (1 + flareT*flareT*0.6);
  }

  // ============================================================================
  // RECURRING BUG CLASS — READ THIS BEFORE TOUCHING ANY BLOCK GEOMETRY CODE.
  //
  // Not every block shape is centered on its own origin (b.x, b.y). The quarter-circle
  // (shape:'circle', visual:'quarter') and the elbow pipe (shape:'pipe', pipeType:'elbow')
  // both anchor their origin at a CORNER of their visual footprint, not the middle — the
  // actual shape only exists in ONE quadrant relative to (b.x, b.y), unlike every other
  // block, which IS symmetric around its origin.
  //
  // This exact mismatch has independently caused the SAME bug in multiple places:
  //   - the drawer tile preview's bounding box (renderTilePreview)
  //   - block-block separation circles (getBlockCircles)
  //   - the wall-drag clamp (onPointerMove's blockDragId branch)
  // Every single time, the "fix" was identical: stop assuming a symmetric
  // [-w/2,+w/2] x [-h/2,+h/2] box around the origin, and use the shape's REAL local
  // bounds instead.
  //
  // getBlockLocalBounds() below is the single source of truth for this. ANY new code
  // that needs a block's spatial extent — bounding box, collision radius, wall clamp,
  // hit-test, preview centering, whatever — MUST go through getBlockLocalBounds() /
  // getRotatedWorldExtent(). Do not hand-roll a symmetric w/2,h/2 assumption again.
  // If a new asymmetric-origin shape gets added later, its bounds belong HERE, not
  // reinvented ad-hoc in whatever function happens to need them next.
  // ============================================================================
  function getBlockLocalBounds(b){
    // the shape's true footprint relative to its own origin — several shapes are NOT
    // centered on their origin (quarter-circle and elbow pipes anchor at a corner),
    // so a naive symmetric w/2,h/2 box is wrong for those
    if(b.shape === 'circle' && b.visual === 'quarter'){
      return { minX:0, maxX:b.r, minY:-b.r, maxY:0 };
    }
    if(b.shape === 'circle' || b.shape === 'fan'){
      return { minX:-b.r, maxX:b.r, minY:-b.r, maxY:b.r };
    }
    if(b.shape === 'pipe' && b.pipeType === 'elbow'){
      const half = b.pipeW*0.5 + 8;
      return { minX:-b.armLen-half, maxX:half, minY:-b.armLen-half, maxY:half };
    }
    return { minX:-b.w/2, maxX:b.w/2, minY:-b.h/2, maxY:b.h/2 };
  }

  function getRotatedWorldExtent(b){
    // rotate the block's actual (possibly off-center) local bounds and return how far
    // it reaches in each direction from b.x/b.y in world space — used for wall clamping
    const bounds = getBlockLocalBounds(b);
    const s = b.scale;
    const rot = b.rot||0;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const corners = [
      {x:bounds.minX, y:bounds.minY}, {x:bounds.maxX, y:bounds.minY},
      {x:bounds.maxX, y:bounds.maxY}, {x:bounds.minX, y:bounds.maxY}
    ];
    let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
    for(const c of corners){
      const wx = (c.x*cosR - c.y*sinR)*s;
      const wy = (c.x*sinR + c.y*cosR)*s;
      minX = Math.min(minX, wx); maxX = Math.max(maxX, wx);
      minY = Math.min(minY, wy); maxY = Math.max(maxY, wy);
    }
    return { minX, maxX, minY, maxY };
  }

  function fanBlockWindAt(b, px, py){
    const dx = px-b.x, dy = py-b.y;
    const d = Math.hypot(dx,dy);
    if(d < 1e-3) return {vx:0, vy:0};

    const ringR = b.r + 6;
    if(d < ringR){
      // same swirling vortex as the original fan — omnidirectional inside the
      // housing regardless of this block's outer blow sector
      const swirlSpeed = 900 * b.fanPower * (0.4 + 0.6*(d/ringR));
      const tx = -dy/d, ty = dx/d;
      const rx = dx/d, ry = dy/d;
      const radialSpeed = swirlSpeed * 0.55;
      return { vx: tx*swirlSpeed + rx*radialSpeed, vy: ty*swirlSpeed + ry*radialSpeed };
    }

    const range = 90 + b.fanPower*260;
    if(d > range) return {vx:0, vy:0};
    if(b.sectorAngle < Math.PI*2 - 0.01){
      let ang = Math.atan2(dy,dx) - (b.rot||0);
      while(ang > Math.PI) ang -= Math.PI*2;
      while(ang < -Math.PI) ang += Math.PI*2;
      if(Math.abs(ang) > b.sectorAngle/2) return {vx:0, vy:0};
    }
    const distT = Math.max(0, 1 - d/range);
    const falloff = Math.pow(distT, 1.25);
    const speed = 4200 * b.fanPower * falloff;
    return { vx: (dx/d)*speed, vy: (dy/d)*speed };
  }

  function windAt(px, py){
    let totalVx = 0, totalVy = 0;

    const dx = px - fan.x, dy = py - fan.y;
    const distToPoint = Math.hypot(dx, dy);
    if(distToPoint > 1e-3 && fan.power >= 0.03){
      const ringR = fan.bodyR + 6;
      if(distToPoint < ringR){
        // trapped inside the fan's chamber — air swirls in a vortex instead of
        // blowing straight out. Direction matches the blades' own clockwise spin.
        // Also spirals slightly outward so the ball keeps pressing into the wall
        // for frequent bounces, rather than settling into a smooth clean orbit.
        const swirlSpeed = 900 * fan.power * (0.4 + 0.6*(distToPoint/ringR));
        const tx = -dy/distToPoint, ty = dx/distToPoint;
        const rx = dx/distToPoint, ry = dy/distToPoint;
        const radialSpeed = swirlSpeed * 0.55;
        return { vx: tx*swirlSpeed + rx*radialSpeed, vy: ty*swirlSpeed + ry*radialSpeed, strength: swirlSpeed };
      }
      const range = 150 + fan.power*430;
      if(distToPoint <= range){
        const distT = Math.max(0, 1 - distToPoint/range);
        const distFalloff = Math.pow(distT, 1.25);
        const peakSpeed = 7200 * fan.power;
        const strength = peakSpeed * distFalloff;
        totalVx += (dx/distToPoint)*strength;
        totalVy += (dy/distToPoint)*strength;
      }
    }

    if(blocksActive()){
      for(const b of blocks){
        if(b.shape !== 'fan') continue;
        const w = fanBlockWindAt(b, px, py);
        totalVx += w.vx; totalVy += w.vy;
      }
    }

    return { vx: totalVx, vy: totalVy, strength: Math.hypot(totalVx, totalVy) };
  }

  // ---------- block collision & spawn dynamics ----------
  function waveSegments(bumps, r){
    // local-space centers + angular span for each alternating up/down bump
    const segs = [];
    for(let i=0;i<bumps;i++){
      const cx = (i - (bumps-1)/2) * 2*r;
      if(i % 2 === 0) segs.push({cx, cy:0, spanStart:0, spanEnd:Math.PI});
      else segs.push({cx, cy:0, spanStart:Math.PI, spanEnd:Math.PI*2});
    }
    return segs;
  }

  function arcSegmentPenetration(lx, ly, cx, cy, r, thick, spanStart, spanEnd){
    const dx = lx-cx, dy = ly-cy;
    const d = Math.hypot(dx,dy);
    if(d < 1e-4) return null;
    let ang = Math.atan2(dy,dx); if(ang<0) ang += Math.PI*2;
    // widen the valid angle range by however much the ball's own radius subtends,
    // so it doesn't visually clip through right at the segment's tip
    const angPad = d>BALL_R ? Math.asin(Math.min(1,BALL_R/d)) : Math.PI/2;
    if(ang < spanStart-angPad || ang > spanEnd+angPad) return null;
    const outerR = r + thick/2, innerR = Math.max(2, r - thick/2);
    if(d >= r){
      if(d - BALL_R < outerR) return { nx: dx/d, ny: dy/d, pen: outerR - (d-BALL_R) };
    } else {
      if(d + BALL_R > innerR) return { nx: -dx/d, ny: -dy/d, pen: (d+BALL_R) - innerR };
    }
    return null;
  }

  function applyImpactSquash(vn, nx, ny){
    // deformation is driven purely by how hard the ball hit something — soft
    // touches barely deform it, fast impacts squash it noticeably. Rotation/spin
    // never factors into this at all.
    const impactSpeed = Math.abs(vn);
    const t = Math.min(1, impactSpeed / squashThreshold);
    const compress = 1 - t*0.38;
    const stretch = 1 + t*0.32;
    if(Math.abs(nx) > Math.abs(ny)){ ball.sx=compress; ball.sy=stretch; }
    else { ball.sy=compress; ball.sx=stretch; }
  }

  function closestPointOnSegment(px,py, ax,ay, bx,by){
    const abx=bx-ax, aby=by-ay;
    const abLen2 = abx*abx+aby*aby || 1e-6;
    let t = ((px-ax)*abx+(py-ay)*aby)/abLen2;
    t = Math.max(0, Math.min(1, t));
    return { x: ax+abx*t, y: ay+aby*t };
  }

  function collideBallWithBlocks(){
    for(const b of blocks){
      if(b.spawnT===null || b.scale < 0.35) continue;

      if(b.shape === 'fan'){
        const br = b.r * Math.min(b.scale,1);
        collideBallWithFanRingAt(b.x, b.y, br);
        continue;
      }

      if(b.shape === 'pipe'){
        continue; // not solid — capture/travel/eject is handled separately in step()
      }

      if(b.shape === 'circle'){
        const br = b.r * Math.min(b.scale,1);

        if(b.visual === 'quarter'){
          const rot = b.rot||0;
          const cosA = Math.cos(-rot), sinA = Math.sin(-rot);
          const dx0 = ball.x-b.x, dy0 = ball.y-b.y;
          const lx = dx0*cosA - dy0*sinA;
          const ly = dx0*sinA + dy0*cosA;
          const angStart = -Math.PI/2, angEnd = 0;
          const d = Math.hypot(lx,ly);
          const ang = Math.atan2(ly,lx);
          const insideWedge = (ang>=angStart && ang<=angEnd && d<=br);

          const candidates = [];
          if(d>1e-4){
            const clampedAng = Math.max(angStart, Math.min(angEnd, ang));
            candidates.push({x:br*Math.cos(clampedAng), y:br*Math.sin(clampedAng)});
          }
          candidates.push(closestPointOnSegment(lx,ly, 0,0, br,0));
          candidates.push(closestPointOnSegment(lx,ly, 0,0, 0,-br));

          let best=null, bestD=Infinity;
          for(const c of candidates){
            const dd = Math.hypot(lx-c.x, ly-c.y);
            if(dd<bestD){ bestD=dd; best=c; }
          }

          const hit = insideWedge || bestD < BALL_R;
          if(hit){
            let lnx = lx-best.x, lny = ly-best.y;
            const nlen = Math.hypot(lnx,lny) || 1;
            lnx/=nlen; lny/=nlen;
            if(insideWedge){ lnx=-lnx; lny=-lny; } // ball center is inside the solid wedge — push it back out
            const pen = insideWedge ? (BALL_R+bestD) : (BALL_R-bestD);
            const cosB = Math.cos(rot), sinB = Math.sin(rot);
            const nx = lnx*cosB - lny*sinB;
            const ny = lnx*sinB + lny*cosB;
            ball.x += nx*pen; ball.y += ny*pen;
            const vn = ball.vx*nx + ball.vy*ny;
            if(vn < 0){
              ball.vx -= (1+RESTITUTION)*vn*nx;
              ball.vy -= (1+RESTITUTION)*vn*ny;
              ball.spin += (ball.vx*ny - ball.vy*nx)*0.03;
              applyImpactSquash(vn, nx, ny);
            }
          }
          continue;
        }

        const dx = ball.x-b.x, dy = ball.y-b.y;
        const d = Math.hypot(dx,dy);
        const minDist = br + BALL_R;
        if(d < minDist && d > 1e-4){
          const nx = dx/d, ny = dy/d;
          const pen = minDist - d;
          ball.x += nx*pen; ball.y += ny*pen;
          const vn = ball.vx*nx + ball.vy*ny;
          if(vn < 0){
            ball.vx -= (1+RESTITUTION)*vn*nx;
            ball.vy -= (1+RESTITUTION)*vn*ny;
            ball.spin += (ball.vx*ny - ball.vy*nx)*0.03;
            applyImpactSquash(vn, nx, ny);
          }
        }
        continue;
      }

      if(b.shape === 'spinner'){
        const s = Math.min(b.scale,1);
        const bladeLen = b.bladeLen*s, bladeW = b.bladeW*s;
        let best = null;
        for(let k=0;k<b.blades;k++){
          const bladeRot = (b.rot||0) + k*(Math.PI*2/b.blades);
          const cosA = Math.cos(-bladeRot), sinA = Math.sin(-bladeRot);
          const dx0 = ball.x-b.x, dy0 = ball.y-b.y;
          const lx = dx0*cosA - dy0*sinA;
          const ly = dx0*sinA + dy0*cosA;
          const cx = Math.max(0, Math.min(lx, bladeLen));
          const cy = 0; // closest point on the blade's centerline — capsule collision, not rectangle
          const ldx = lx-cx, ldy = ly-cy;
          const d2 = ldx*ldx+ldy*ldy;
          const capMinDist = bladeW/2 + BALL_R;
          if(d2 < capMinDist*capMinDist){
            const d = Math.sqrt(d2) || 0.001;
            const lnx=ldx/d, lny=ldy/d;
            const pen = capMinDist-d;
            const cosB=Math.cos(bladeRot), sinB=Math.sin(bladeRot);
            const nx = lnx*cosB - lny*sinB;
            const ny = lnx*sinB + lny*cosB;
            if(!best || pen>best.pen) best={nx,ny,pen,cosB,sinB,cx};
          }
        }
        if(best){
          ball.x += best.nx*best.pen; ball.y += best.ny*best.pen;
          const vn = ball.vx*best.nx + ball.vy*best.ny;
          if(vn < 0){
            ball.vx -= (1+RESTITUTION)*vn*best.nx;
            ball.vy -= (1+RESTITUTION)*vn*best.ny;
            const tangSpeed = b.rotSpeed * best.cx * 0.6; // the blade sweeps the ball along with it a bit
            ball.vx += -best.sinB*tangSpeed;
            ball.vy += best.cosB*tangSpeed;
            ball.spin += (ball.vx*best.ny - ball.vy*best.nx)*0.03;
            applyImpactSquash(vn, best.nx, best.ny);
          }
        }
        continue;
      }

      if(b.shape === 'wave'){
        const s = Math.min(b.scale,1);
        const effR = b.r*s, effThick = b.thick*s;
        const capR = effThick/2;
        const rot = b.rot||0;
        const cosA = Math.cos(-rot), sinA = Math.sin(-rot);
        const dx0 = ball.x-b.x, dy0 = ball.y-b.y;
        const lx = dx0*cosA - dy0*sinA;
        const ly = dx0*sinA + dy0*cosA;
        let bestW = null;
        for(const seg of waveSegments(b.bumps, effR)){
          const res = arcSegmentPenetration(lx,ly, seg.cx,seg.cy, effR, effThick, seg.spanStart, seg.spanEnd);
          if(res && (!bestW || res.pen > bestW.pen)) bestW = res;

          // round end caps — catches the ball approaching a tip from outside
          // the arc's angular band, matching the visual lineCap:'round' ends
          for(const ang of [seg.spanStart, seg.spanEnd]){
            const capX = seg.cx + effR*Math.cos(ang), capY = seg.cy + effR*Math.sin(ang);
            const cdx = lx-capX, cdy = ly-capY;
            const cd = Math.hypot(cdx,cdy);
            const minDist = capR + BALL_R;
            if(cd < minDist && cd > 1e-4){
              const pen = minDist-cd;
              if(!bestW || pen > bestW.pen) bestW = { nx: cdx/cd, ny: cdy/cd, pen };
            }
          }
        }
        if(bestW){
          const cosB = Math.cos(rot), sinB = Math.sin(rot);
          const nx = bestW.nx*cosB - bestW.ny*sinB;
          const ny = bestW.nx*sinB + bestW.ny*cosB;
          ball.x += nx*bestW.pen; ball.y += ny*bestW.pen;
          const vn = ball.vx*nx + ball.vy*ny;
          if(vn < 0){
            ball.vx -= (1+RESTITUTION)*vn*nx;
            ball.vy -= (1+RESTITUTION)*vn*ny;
            ball.spin += (ball.vx*ny - ball.vy*nx)*0.03;
            applyImpactSquash(vn, nx, ny);
          }
        }
        continue;
      }

      const hw = b.w*0.5*Math.min(b.scale,1);
      const hh = b.h*0.5*Math.min(b.scale,1);
      const rot = b.rot||0;
      const cosA = Math.cos(-rot), sinA = Math.sin(-rot);
      const dx0 = ball.x-b.x, dy0 = ball.y-b.y;
      const lx = dx0*cosA - dy0*sinA;   // ball center in the block's local (unrotated) space
      const ly = dx0*sinA + dy0*cosA;

      if(b.capsule){
        const capR = Math.min(hw,hh);
        let segAx,segAy,segBx,segBy;
        if(hh>=hw){ segAx=0; segAy=-(hh-capR); segBx=0; segBy=(hh-capR); }
        else { segAx=-(hw-capR); segAy=0; segBx=(hw-capR); segBy=0; }
        const cp = closestPointOnSegment(lx,ly, segAx,segAy, segBx,segBy);
        const ldx = lx-cp.x, ldy = ly-cp.y;
        const d = Math.hypot(ldx,ldy);
        const minDist = capR+BALL_R;
        if(d < minDist && d > 1e-4){
          const lnx = ldx/d, lny = ldy/d;
          const pen = minDist-d;
          const cosB = Math.cos(rot), sinB = Math.sin(rot);
          const nx = lnx*cosB - lny*sinB;
          const ny = lnx*sinB + lny*cosB;
          ball.x += nx*pen; ball.y += ny*pen;
          const vn = ball.vx*nx + ball.vy*ny;
          if(vn < 0){
            const eRest = b.bouncy ? b.bounciness : RESTITUTION;
            ball.vx -= (1+eRest)*vn*nx;
            ball.vy -= (1+eRest)*vn*ny;
            ball.spin += (ball.vx*ny - ball.vy*nx)*0.03;
            applyImpactSquash(vn, nx, ny);
          }
        }
        continue;
      }

      const cx = Math.max(-hw, Math.min(lx, hw));
      const cy = Math.max(-hh, Math.min(ly, hh));
      const ldx = lx-cx, ldy = ly-cy;
      const d2 = ldx*ldx+ldy*ldy;
      if(d2 < BALL_R*BALL_R){
        const d = Math.sqrt(d2) || 0.001;
        const lnx = ldx/d, lny = ldy/d;
        const pen = BALL_R - d;
        const cosB = Math.cos(rot), sinB = Math.sin(rot);
        const nx = lnx*cosB - lny*sinB;   // normal rotated back to world space
        const ny = lnx*sinB + lny*cosB;
        ball.x += nx*pen; ball.y += ny*pen;
        const vn = ball.vx*nx + ball.vy*ny;
        if(vn < 0){
          ball.vx -= (1+RESTITUTION)*vn*nx;
          ball.vy -= (1+RESTITUTION)*vn*ny;
          ball.spin += (ball.vx*ny - ball.vy*nx)*0.03;
          applyImpactSquash(vn, nx, ny);
        }
      }
    }
  }

  function collideBallWithFan(){
    const dx = ball.x - fan.x, dy = ball.y - fan.y;
    const dist = Math.hypot(dx, dy);
    const minDist = fan.bodyR + BALL_R;
    if(dist >= minDist || dist <= 1e-4) return;

    const SWAT_THRESHOLD = 350; // fan must be swiped at least this fast to act as a "swat" — otherwise it isn't solid at all
    const fanSpeed = Math.hypot(fan.vx, fan.vy);
    if(fanSpeed < SWAT_THRESHOLD) return;

    const nx = dx/dist, ny = dy/dist;
    const pen = minDist - dist;
    ball.x += nx*pen; ball.y += ny*pen;

    const rvx = ball.vx - fan.vx, rvy = ball.vy - fan.vy;
    const vn = rvx*nx + rvy*ny;
    if(vn < 0){
      const reflX = rvx - (1+RESTITUTION)*vn*nx;
      const reflY = rvy - (1+RESTITUTION)*vn*ny;
      const PUNCH = 1.15; // the fan is heavy/driven, so it slaps a bit extra momentum in
      ball.vx = reflX*PUNCH + fan.vx;
      ball.vy = reflY*PUNCH + fan.vy;
      ball.spin += (ball.vx*ny - ball.vy*nx)*0.02;
      applyImpactSquash(vn, nx, ny);
    }
  }

  function collideBallWithFanRingAt(cx, cy, radius){
    // the fan's outer rim acts as a thin containment wall: a ball already inside
    // can't be blown/knocked out through it, and a ball outside can't be blown in —
    // physics only. Hand-dragging the ball bypasses this entirely (see step()).
    const dx = ball.x-cx, dy = ball.y-cy;
    const d = Math.hypot(dx,dy);
    if(d < 1e-4) return;
    const wallR = radius + 6; // matches the visual rim exactly
    const nx = dx/d, ny = dy/d;

    if(d < wallR){
      if(d + BALL_R > wallR){
        const curSpeed = Math.hypot(ball.vx, ball.vy);
        if(curSpeed >= fanEscapeThreshold){
          return; // fast enough — breaks through the ring instead of bouncing back in
        }
        const pen = (d+BALL_R) - wallR;
        ball.x -= nx*pen; ball.y -= ny*pen;
        const vn = ball.vx*nx + ball.vy*ny;
        if(vn > 0){
          ball.vx -= (1+RESTITUTION)*vn*nx;
          ball.vy -= (1+RESTITUTION)*vn*ny;
          applyImpactSquash(vn, nx, ny);
          const BOUNCE_BOOST = 1.18; // each bounce off the fan wall pumps noticeably more speed in now
          ball.vx *= BOUNCE_BOOST; ball.vy *= BOUNCE_BOOST;
        }
      }
    } else {
      if(d - BALL_R < wallR){
        const pen = wallR - (d-BALL_R);
        ball.x += nx*pen; ball.y += ny*pen;
        const vn = ball.vx*nx + ball.vy*ny;
        if(vn < 0){
          ball.vx -= (1+RESTITUTION)*vn*nx;
          ball.vy -= (1+RESTITUTION)*vn*ny;
          applyImpactSquash(vn, nx, ny);
        }
      }
    }
  }
  function collideBallWithFanRing(){
    collideBallWithFanRingAt(fan.x, fan.y, fan.bodyR);
  }

  function updateBlockSpawns(dt){
    const K = 70, D = 2*Math.sqrt(K)*0.55; // slightly underdamped — gives the little "bubble" overshoot
    for(const b of blocks){
      if(b.spawnT===null) continue;

      let diff = 1 - b.scale;
      let acc = diff*K - b.scaleVel*D;
      b.scaleVel += acc*dt;
      b.scale += b.scaleVel*dt;

      // length/radius spring — universal pinch-scale driver, every shape uses this one
      diff = b.targetMulR - b.sizeMulR;
      acc = diff*K - b.sizeMulRVel*D;
      b.sizeMulRVel += acc*dt;
      b.sizeMulR += b.sizeMulRVel*dt;

      // thickness/width spring — popup-only, pinch never touches this, for any shape
      diff = b.targetMulThick - b.sizeMulThick;
      acc = diff*K - b.sizeMulThickVel*D;
      b.sizeMulThickVel += acc*dt;
      b.sizeMulThick += b.sizeMulThickVel*dt;

      if(b.shape === 'circle' || b.shape === 'fan'){
        b.r = b.baseR * b.sizeMulR;
        b.w = b.h = b.r*2;
      } else if(b.shape === 'pipe'){
        b.length = b.basePipeLength * b.sizeMulR;
        b.armLen = b.baseArmLen * b.sizeMulR;
        b.pipeW = Math.max(BALL_R*2 + 10, b.basePipeW * b.sizeMulThick);
        b.r = b.pipeW/2;
        if(b.pipeType==='straight'){ b.w = b.length + b.pipeW; b.h = b.pipeW*2.2; }
        else { b.w = b.h = b.armLen + b.pipeW*1.5; }
      } else if(b.shape === 'wave'){
        b.r = b.baseR * b.sizeMulR;
        b.thick = b.baseThick * b.sizeMulThick;
        b.w = b.baseW * b.sizeMulR;
        b.h = b.baseH * b.sizeMulR;
      } else if(b.shape === 'spinner'){
        b.bladeLen = (BLOCK_KINDS[b.kind].bladeLen) * b.sizeMulR;
        b.bladeW = (BLOCK_KINDS[b.kind].bladeW) * b.sizeMulThick;
        b.w = b.h = b.bladeLen*2;
      } else if(b.lengthAxis === 'h'){
        b.h = b.baseH * b.sizeMulR;
        b.w = b.baseW * b.sizeMulThick;
      } else if(b.lengthAxis === 'w'){
        b.w = b.baseW * b.sizeMulR;
        b.h = b.baseH * b.sizeMulThick;
      } else {
        // no distinct length axis (e.g. square) — grows uniformly, like a bigger version of itself
        b.w = b.baseW * b.sizeMulR;
        b.h = b.baseH * b.sizeMulR;
      }
    }
  }

  function updateMovingBlocks(dt){
    for(const b of blocks){
      if(b.spawnT===null) continue;
      if(b.autoRotate) b.rot = (b.rot||0) + b.rotSpeed*dt;
      if(b.shape === 'fan') b.bladeSpin += dt * (4 + b.fanPower*26);
      if(b.oscillate && b!==draggedBlock){
        b.oscPhase += dt*b.oscSpeed;
        const off = Math.sin(b.oscPhase)*b.oscAmp;
        const cosR=Math.cos(b.rot||0), sinR=Math.sin(b.rot||0);
        b.x = b.oscBaseX + off*cosR;
        b.y = b.oscBaseY + off*sinR;
      }
    }
  }

  function obbOverlap(a, b){
    // Separating Axis Theorem for two oriented rectangles — the 4 candidate
    // axes are each rectangle's own local x/y directions.
    const arot = a.rot||0, brot = b.rot||0;
    const ax = [Math.cos(arot), Math.sin(arot)];
    const ay = [-ax[1], ax[0]];
    const bx = [Math.cos(brot), Math.sin(brot)];
    const by = [-bx[1], bx[0]];
    const ahw=a.w*0.5*a.scale, ahh=a.h*0.5*a.scale;
    const bhw=b.w*0.5*b.scale, bhh=b.h*0.5*b.scale;
    const dx = b.x-a.x, dy = b.y-a.y;

    const axes = [ax, ay, bx, by];
    let minOverlap = Infinity, minAxis = null;
    for(const axis of axes){
      const rA = Math.abs(ax[0]*axis[0]+ax[1]*axis[1])*ahw + Math.abs(ay[0]*axis[0]+ay[1]*axis[1])*ahh;
      const rB = Math.abs(bx[0]*axis[0]+bx[1]*axis[1])*bhw + Math.abs(by[0]*axis[0]+by[1]*axis[1])*bhh;
      const distOnAxis = Math.abs(dx*axis[0]+dy*axis[1]);
      const overlap = rA+rB-distOnAxis;
      if(overlap <= 0) return null; // a separating axis exists — boxes don't overlap
      if(overlap < minOverlap){ minOverlap = overlap; minAxis = axis; }
    }
    if(!minAxis) return null; // safety net — no valid axis found (shouldn't happen, but never dereference null)
    let nx = minAxis[0], ny = minAxis[1];
    if(!isFinite(nx) || !isFinite(ny)) return null;
    if(dx*nx+dy*ny < 0){ nx=-nx; ny=-ny; } // point the normal from a toward b
    return { overlap: minOverlap, nx, ny };
  }

  function getBlockCircles(b){
    // NOTE: circle decomposition per shape, not a simple bounding box — but if you're
    // debugging a "block reacts as if it's bigger/offset from what it looks like" issue,
    // check getBlockLocalBounds()'s warning comment first, same root cause class.
    const s = b.scale;
    const rot = b.rot||0;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    function toWorld(lx,ly){ return { x: b.x + lx*cosR - ly*sinR, y: b.y + lx*sinR + ly*cosR }; }
    const circles = [];

    if(b.shape === 'circle' && b.visual === 'quarter'){
      const r = b.r*s;
      const bis = -Math.PI/4; // wedge bisector — two circles hugging the pie-slice
      const p1 = toWorld(Math.cos(bis)*r*0.38, Math.sin(bis)*r*0.38);
      const p2 = toWorld(Math.cos(bis)*r*0.78, Math.sin(bis)*r*0.78);
      circles.push({x:p1.x, y:p1.y, r:r*0.42});
      circles.push({x:p2.x, y:p2.y, r:r*0.34});
    } else if(b.shape === 'circle'){
      circles.push({x:b.x, y:b.y, r:b.r*s});
    } else if(b.shape === 'wave'){
      const r = b.r*s, thick = b.thick*s, capR = thick/2;
      const N = 4;
      for(const seg of waveSegments(b.bumps, r)){
        for(let i=0;i<=N;i++){
          const t = seg.spanStart + (seg.spanEnd-seg.spanStart)*(i/N);
          const wp = toWorld(seg.cx + r*Math.cos(t), seg.cy + r*Math.sin(t));
          circles.push({x:wp.x, y:wp.y, r:capR});
        }
      }
    } else if(b.shape === 'spinner'){
      const bladeLen = b.bladeLen*s, bladeW = b.bladeW*s, capR = bladeW/2;
      for(let k=0;k<b.blades;k++){
        const a = rot + k*(Math.PI*2/b.blades);
        const ca=Math.cos(a), sa=Math.sin(a);
        for(const t of [0.3, 0.85]){
          circles.push({x:b.x+ca*bladeLen*t, y:b.y+sa*bladeLen*t, r:capR});
        }
      }
    } else if(b.shape === 'pipe'){
      const capR = b.pipeW*0.5*s;
      const N = 6;
      for(let i=0;i<=N;i++){
        const t = i/N;
        const lp = pipeLocalPointAt(b, t);
        const wp = toWorld(lp.x*s, lp.y*s);
        circles.push({x:wp.x, y:wp.y, r: capR});
      }
    } else if(b.capsule){
      const hw = b.w*0.5*s, hh = b.h*0.5*s, capR = Math.min(hw,hh);
      let p1,p2;
      if(hh>=hw){ p1=toWorld(0,-(hh-capR)); p2=toWorld(0,(hh-capR)); }
      else { p1=toWorld(-(hw-capR),0); p2=toWorld((hw-capR),0); }
      circles.push({x:p1.x, y:p1.y, r:capR});
      circles.push({x:p2.x, y:p2.y, r:capR});
      circles.push({x:b.x, y:b.y, r:capR});
    } else {
      circles.push({x:b.x, y:b.y, r:Math.max(b.w,b.h)*0.5*s});
    }
    return circles;
  }

  function circleSetOverlap(a,b){
    const circlesA = getBlockCircles(a);
    const circlesB = getBlockCircles(b);
    let best = null;
    for(const ca of circlesA){
      for(const cb of circlesB){
        const dx=cb.x-ca.x, dy=cb.y-ca.y;
        const d = Math.hypot(dx,dy);
        const overlap = (ca.r+cb.r) - d;
        if(overlap > 0 && (!best || overlap>best.overlap)){
          const nx = d>1e-4 ? dx/d : 1, ny = d>1e-4 ? dy/d : 0;
          best = {overlap, nx, ny};
        }
      }
    }
    return best;
  }

  function separateBlocks(dt){
    for(let i=0;i<blocks.length;i++){
      for(let j=i+1;j<blocks.length;j++){
        const a=blocks[i], b=blocks[j];
        if(a.spawnT===null || b.spawnT===null) continue;
        const aPlainRect = (a.shape==='rect' && !a.capsule);
        const bPlainRect = (b.shape==='rect' && !b.capsule);
        const res = (aPlainRect && bPlainRect) ? obbOverlap(a,b) : circleSetOverlap(a,b);
        if(!res) continue;
        const aDragged = (a === draggedBlock), bDragged = (b === draggedBlock);
        const push = res.overlap * Math.min(1, dt*6);
        if(aDragged){ b.x += res.nx*push; b.y += res.ny*push; }
        else if(bDragged){ a.x -= res.nx*push; a.y -= res.ny*push; }
        else {
          a.x -= res.nx*push*0.5; a.y -= res.ny*push*0.5;
          b.x += res.nx*push*0.5; b.y += res.ny*push*0.5;
        }
      }
    }
  }

  // ---------- physics step ----------
  function step(dt){
    if(fanActive()){
      fan.power = fan.basePower;
      fan.bladeSpin += dt * (4 + fan.power*26);

      if(fanPrevX === null){ fanPrevX = fan.x; fanPrevY = fan.y; }
      const instFvx = (fan.x - fanPrevX)/dt;
      const instFvy = (fan.y - fanPrevY)/dt;
      fan.vx = fan.vx*0.5 + instFvx*0.5;
      fan.vy = fan.vy*0.5 + instFvy*0.5;
      const fSpeed = Math.hypot(fan.vx, fan.vy);
      if(fSpeed > 6000){ fan.vx *= 6000/fSpeed; fan.vy *= 6000/fSpeed; }
      fanPrevX = fan.x; fanPrevY = fan.y;
    } else {
      fan.power = 0;
      fan.vx = 0; fan.vy = 0;
    }

    if(blocksActive() && blocks.length){
      updateBlockSpawns(dt);
      separateBlocks(dt);
      updateMovingBlocks(dt);
    }

    if(ballId === null && aimId === null){
      if(ball.pipeCooldownT > 0) ball.pipeCooldownT -= dt;
      if(!ball.pipedBy && blocksActive()){
        for(const pb of blocks){
          if(pb.shape !== 'pipe' || pb.spawnT===null) continue;
          if(ball.pipeCooldownBlock===pb && ball.pipeCooldownT>0) continue;
          const pend = getPipeEndpoints(pb);
          const capR = (BALL_R+8) * pb.suctionRange;
          if(dist(ball.x,ball.y,pend.inlet.x,pend.inlet.y) < capR){
            ball.pipedBy = pb; ball.pipeApproaching = true; ball.pipeT = 0;
            break;
          }
        }
      }

      const w = windAt(ball.x, ball.y);
      const relVx = ball.vx - w.vx;
      const relVy = ball.vy - w.vy;
      const relSpeed = Math.hypot(relVx, relVy);

      if(fanActive()){
        const fdx = ball.x-fan.x, fdy = ball.y-fan.y;
        const fdist = Math.hypot(fdx,fdy);
        if(fdist < fan.bodyR+6){ ball.spin += fan.power*dt*55; }
      }
      if(blocksActive()){
        for(const b of blocks){
          if(b.shape !== 'fan' || b.spawnT===null) continue;
          const fd = dist(ball.x,ball.y,b.x,b.y);
          if(fd < b.r+6){ ball.spin += b.fanPower*dt*55; }
        }
      }

      let fx = 0, fy = 0;
      if(mode==='gravity' || gravityEnabled){ fy += gravityStrength * BALL_MASS; }
      if(relSpeed > 1e-4){
        const dragMag = DRAG_K * relSpeed * relSpeed;
        fx += -dragMag * (relVx/relSpeed);
        fy += -dragMag * (relVy/relSpeed);
      }
      fx += -MAGNUS_K * ball.spin * relVy;
      fy +=  MAGNUS_K * ball.spin * relVx;

      const speed = Math.hypot(ball.vx, ball.vy);
      if(speed > 1e-3){
        const frictionF = frictionLevel * FRICTION_MU_BASE * BALL_MASS * TABLE_G;
        fx += -frictionF * (ball.vx/speed);
        fy += -frictionF * (ball.vy/speed);
      }

      const ax = fx / BALL_MASS;
      const ay = fy / BALL_MASS;
      let nvx = ball.vx + ax*dt;
      let nvy = ball.vy + ay*dt;
      if(speed > 1e-3){
        const dot0 = ball.vx*nvx + ball.vy*nvy;
        if(dot0 < 0 && w.strength < 1){ nvx = 0; nvy = 0; }
      }
      ball.vx = nvx; ball.vy = nvy;

      // gentle active wall repulsion — applied separately, after the friction
      // guard above, so it never gets zeroed out by it. Only kicks in once the
      // ball has lingered near an edge for over a second, and eases in softly.
      const NEAR_WALL_DIST = 55;
      const distLeft   = ball.x - WALL_MARGIN;
      const distRight  = (PLAY_W - WALL_MARGIN) - ball.x;
      const distTop    = ball.y - WALL_MARGIN;
      const distBottom = (H - WALL_MARGIN) - ball.y;
      const minWallDist = Math.min(distLeft, distRight, distTop, distBottom);

      ball.wallStickT = (minWallDist < NEAR_WALL_DIST && mode!=='gravity') ? ball.wallStickT + dt : 0;

      if(ball.wallStickT > 1.0){
        const PUSH = 850;
        const rampT = Math.min(1, (ball.wallStickT - 1.0) / 0.6); // eases in gently, not a sudden shove
        let pfx = 0, pfy = 0;
        if(distLeft   < NEAR_WALL_DIST) pfx += PUSH * (1 - distLeft/NEAR_WALL_DIST)   * rampT;
        if(distRight  < NEAR_WALL_DIST) pfx -= PUSH * (1 - distRight/NEAR_WALL_DIST)  * rampT;
        if(distTop    < NEAR_WALL_DIST) pfy += PUSH * (1 - distTop/NEAR_WALL_DIST)    * rampT;
        if(distBottom < NEAR_WALL_DIST) pfy -= PUSH * (1 - distBottom/NEAR_WALL_DIST) * rampT;
        ball.vx += (pfx/BALL_MASS)*dt;
        ball.vy += (pfy/BALL_MASS)*dt;
      }

      ball.x  += ball.vx*dt;
      ball.y  += ball.vy*dt;

      ball.spin *= Math.pow(0.4, dt);
      ball.rot  += ball.spin*dt;

      if(ball.x - BALL_R < WALL_MARGIN){
        ball.x = WALL_MARGIN + BALL_R;
        if(ball.vx < 0){
          const vn = ball.vx;
          ball.spin -= ball.vy*0.05; ball.vx = -ball.vx*RESTITUTION;
          applyImpactSquash(vn, 1, 0);
        }
      }
      if(ball.x + BALL_R > PLAY_W - WALL_MARGIN){
        ball.x = PLAY_W - WALL_MARGIN - BALL_R;
        if(ball.vx > 0){
          const vn = -ball.vx;
          ball.spin += ball.vy*0.05; ball.vx = -ball.vx*RESTITUTION;
          applyImpactSquash(vn, -1, 0);
        }
      }
      if(ball.y - BALL_R < WALL_MARGIN){
        ball.y = WALL_MARGIN + BALL_R;
        if(ball.vy < 0){
          const vn = ball.vy;
          ball.spin += ball.vx*0.05; ball.vy = -ball.vy*RESTITUTION;
          applyImpactSquash(vn, 0, 1);
        }
      }
      if(ball.y + BALL_R > H - WALL_MARGIN){
        ball.y = H - WALL_MARGIN - BALL_R;
        if(ball.vy > 0){
          const vn = -ball.vy;
          ball.spin -= ball.vx*0.05; ball.vy = -ball.vy*RESTITUTION;
          applyImpactSquash(vn, 0, -1);
        }
      }
      ball.spin = Math.max(-45, Math.min(45, ball.spin));

      const _curSpeed = Math.hypot(ball.vx, ball.vy);
      if(_curSpeed > maxBallSpeed){
        const _scale = maxBallSpeed/_curSpeed;
        ball.vx *= _scale; ball.vy *= _scale;
      }

      if(fanActive()) collideBallWithFan();
      if(fanActive()) collideBallWithFanRing();
      if(blocksActive() && blocks.length) collideBallWithBlocks();

      if(ball.pipedBy){
        const pb = ball.pipedBy;
        if(blocks.indexOf(pb)===-1 || pb.spawnT===null){
          ball.pipedBy = null; ball.pipeApproaching = false; // pipe got removed — release the ball safely where it is
        } else if(ball.pipeApproaching){
          const pend = getPipeEndpoints(pb);
          const toInX = pend.inlet.x-ball.x, toInY = pend.inlet.y-ball.y;
          const distToInlet = Math.hypot(toInX,toInY);
          if(distToInlet < BALL_R*0.5){
            ball.pipeApproaching = false;
            ball.pipeT = 0;
            ball.x = pend.inlet.x; ball.y = pend.inlet.y;
          } else {
            const capR = (BALL_R+8) * pb.suctionRange;
            const proximity = Math.max(0, Math.min(1, 1 - distToInlet/capR)); // 0 at the edge of range, 1 right at the inlet
            const pullSpeed = 40 + 12000*pb.suction * (0.15 + 0.17*proximity*proximity); // quadratic, edge unchanged, center boost now 5x weaker
            const nx = toInX/distToInlet, ny = toInY/distToInlet;
            ball.vx = nx*pullSpeed; ball.vy = ny*pullSpeed;
            ball.x += ball.vx*dt; ball.y += ball.vy*dt;
            ball.spin += pb.suction*dt*20;
          }
        } else {
          const pathLen = Math.max(20, pipePathLength(pb) * pb.scale);
          const travelSpeed = 1700 * ((pb.suction + pb.ejection)/2);
          ball.pipeT += (travelSpeed / pathLen) * dt;
          if(ball.pipeT >= 1){
            const pend = getPipeEndpoints(pb);
            ball.x = pend.outlet.x; ball.y = pend.outlet.y;
            const ejectSpeed = 2100 * pb.ejection;
            ball.vx = pend.outletDir.x*ejectSpeed;
            ball.vy = pend.outletDir.y*ejectSpeed;
            ball.pipedBy = null;
            ball.pipeCooldownBlock = pb; ball.pipeCooldownT = 0.22;
            // chain check — if another pipe's inlet sits right here, hop straight
            // into it on this same substep instead of waiting for the next one
            for(const nb of blocks){
              if(nb===pb || nb.shape!=='pipe' || nb.spawnT===null) continue;
              const nend = getPipeEndpoints(nb);
              const capR = (BALL_R+8) * nb.suctionRange;
              if(dist(ball.x,ball.y,nend.inlet.x,nend.inlet.y) < capR){
                ball.pipedBy = nb; ball.pipeApproaching = false; ball.pipeT = 0;
                break;
              }
            }
          } else {
            const wp = pipeWorldPointAt(pb, ball.pipeT);
            ball.x = wp.x; ball.y = wp.y;
            ball.spin += ((pb.suction+pb.ejection)/2) * dt * 30;
          }
        }
      }
    } else {
      ball.rot += ball.spin*dt*0.3;
      ball.spin *= Math.pow(0.5, dt);
    }

    const relax = 1 - Math.pow(0.001, dt);
    ball.sx += (1 - ball.sx) * relax;
    ball.sy += (1 - ball.sy) * relax;

    if(mode==='ball' && comboCount>0 && lastScoreTime>0 && (performance.now()-lastScoreTime) > 1000){
      comboCount = 0;
      hideCombo();
    }

    updateExtraBalls(dt);

    if(mode==='billiard' && aimId===null){
      for(const p of getPockets()){
        const d = dist(ball.x, ball.y, p.x, p.y);
        if(d < POCKET_R - BALL_R*0.15){
          score++;
          scoreN.textContent = score;
          if(score > best){ best = score; bestN.textContent = best; saveBest(); }
          spawnBurst(p.x, p.y);
          resetBall(PLAY_W*0.5, H*0.78);
          ball.vx = 0; ball.vy = 0;
          break;
        }
      }
    } else {
      if(!ring.dragging){
        ring.phase += dt*0.6;
        ring.curX = ring.x + Math.cos(ring.phase)*8;
        ring.curY = ring.y + Math.sin(ring.phase*1.3)*8;
      } else {
        ring.curX = ring.x; ring.curY = ring.y;
      }
      const d = dist(ball.x, ball.y, ring.curX, ring.curY);
      if(d < ring.r - BALL_R*0.35){
        score++;
        scoreN.textContent = score;
        if(score > best){ best = score; bestN.textContent = best; saveBest(); }
        spawnBurst(ring.curX, ring.curY);

        if(mode==='ball'){
          const now = performance.now();
          comboCount = (lastScoreTime>0 && (now-lastScoreTime)<1000) ? comboCount+1 : 1;
          lastScoreTime = now;
          if(comboCount >= 3) showCombo(comboCount); else hideCombo();
        }

        placeRing();
      }
    }

    updateBgTileColors(dt);
    maybeCycleBgTileColors(dt);

    updateConfetti(dt);
    updateParticles(dt);
  }

  function spawnBurst(x,y){
    for(let i=0;i<22;i++){
      const a = Math.random()*Math.PI*2;
      const sp = 120 + Math.random()*260;
      burstParticles.push({x,y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:0, maxLife:0.5+Math.random()*0.3});
    }
  }

  function updateParticles(dt){
    for(let i=burstParticles.length-1;i>=0;i--){
      const p = burstParticles[i];
      p.x += p.vx*dt; p.y += p.vy*dt; p.vx*=0.94; p.vy*=0.94; p.life += dt;
      if(p.life > p.maxLife) burstParticles.splice(i,1);
    }
  }

