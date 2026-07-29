"use strict";

  // ---------- pointer controls ----------
  let moveId=null, ballId=null, ringId=null, blockDragId=null;
  let aimId=null, aimStartX=0, aimStartY=0, aimPX=0, aimPY=0; // billiard mode — pull-back aim, separate from normal ball drag
  const AIM_MAX_PULL = 220;   // mm — pull distance for full power
  const AIM_MAX_SPEED = 1500; // mm/s — launch speed at full power (kept modest — no more cross-table cannons)
  let edgeSwipeId=null, edgeSwipeStartX=0;
  let pinchId1=null, pinchId2=null, pinchBlock=null;
  let pinchMode=null; // null until locked to 'rotate' or 'scale' — whichever motion crosses its threshold first
  const pinchStart = { dist:0, angle:0, rot:0, localDX:0, localDY:0, mulW:1, mulH:1, mulR:1 };
  const activePointers = {}; // pointerId -> {x,y} in WORLD space, tracked for every active touch
  const screenPointers = {}; // pointerId -> {x,y} in raw SCREEN space, used only for camera pinch/pan
  let camPinchId1=null, camPinchId2=null;
  const camPinchStart = { dist:0, zoom:1, midX:0, midY:0, camX:0, camY:0 };
  let panId=null;
  const panStart = { x:0, y:0, camX:0, camY:0 };
  let draggedBlock = null;
  let selectedBlock = null;
  const blockDragOffset = { x:0, y:0 };
  let blockLongPressTimer = null, blockPressStartX = 0, blockPressStartY = 0;
  let fanLongPressTimer = null, fanPressStartX = 0, fanPressStartY = 0;

  function blockAt(x,y){
    for(let i=blocks.length-1; i>=0; i--){
      const b = blocks[i];
      if(b.spawnT===null || b.scale<0.3) continue;
      const rot = b.rot||0;
      const cosA = Math.cos(-rot), sinA = Math.sin(-rot);
      const dx = x-b.x, dy = y-b.y;
      const lx = dx*cosA - dy*sinA;
      const ly = dx*sinA + dy*cosA;

      if(b.shape === 'circle' || b.shape === 'fan'){
        const r = b.r*b.scale + 8;
        if(Math.hypot(lx,ly) <= r) return b;
      } else if(b.shape === 'pipe'){
        let hit = false;
        for(let i=0;i<=14;i++){
          const t = i/14;
          const lp = pipeLocalPointAt(b, t);
          if(dist(lx,ly, lp.x*b.scale, lp.y*b.scale) < (pipeWidthAt(b,t)*b.scale/2 + 12)){ hit = true; break; }
        }
        if(hit) return b;
      } else if(b.shape === 'wave'){
        const r = b.r*b.scale, thick = b.thick*b.scale;
        let hit = false;
        for(const seg of waveSegments(b.bumps, r)){
          const sdx = lx-seg.cx, sdy = ly-seg.cy;
          const d = Math.hypot(sdx,sdy);
          if(d < 1e-4) continue;
          let ang = Math.atan2(sdy,sdx); if(ang<0) ang += Math.PI*2;
          if(ang >= seg.spanStart-0.08 && ang <= seg.spanEnd+0.08 && Math.abs(d-r) < thick/2+12){
            hit = true; break;
          }
        }
        if(hit) return b;
      } else if(b.shape === 'spinner'){
        const bladeLen = b.bladeLen*b.scale, bladeW = b.bladeW*b.scale;
        let hit = false;
        for(let k=0;k<b.blades;k++){
          const a = k*(Math.PI*2/b.blades);
          const cosB=Math.cos(-a), sinB=Math.sin(-a);
          const blx = lx*cosB - ly*sinB, bly = lx*sinB + ly*cosB;
          if(blx >= -10 && blx <= bladeLen+10 && bly >= -bladeW/2-10 && bly <= bladeW/2+10){ hit=true; break; }
        }
        if(hit) return b;
      } else {
        const hw = b.w*0.5*b.scale + 8, hh = b.h*0.5*b.scale + 8;
        if(lx>=-hw && lx<=hw && ly>=-hh && ly<=hh) return b;
      }
    }
    return null;
  }
  const ballDrag = { lastX:0, lastY:0, lastT:0, vx:0, vy:0 };

  function dist(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }
  function fanActive(){ return (mode==='fan' || mode==='blocks') && fanEnabled; }
  function blocksActive(){ return mode==='blocks' || mode==='gravity' || mode==='billiard'; }

  function pointInBlockRect(px,py,b,pad){
    const rot = b.rot||0;
    const cosA = Math.cos(-rot), sinA = Math.sin(-rot);
    const dx = px-b.x, dy = py-b.y;
    const lx = dx*cosA - dy*sinA, ly = dx*sinA + dy*cosA;
    const hw = b.w*0.5*b.scale + pad, hh = b.h*0.5*b.scale + pad;
    return (lx>=-hw && lx<=hw && ly>=-hh && ly<=hh);
  }

  function onPointerDown(e){
    if(screen !== 'play') return;
    if(e.target.closest && (e.target.closest('#blockPopupWrap') || e.target.closest('#saveConfirmWrap') || e.target.closest('#gridSetupWrap') || e.target.closest('#importLevelWrap'))) return;
    const sx = e.clientX, sy = e.clientY;
    screenPointers[e.pointerId] = { x: sx, y: sy };
    const world = screenToWorld(sx, sy);
    const x = world.x, y = world.y;
    activePointers[e.pointerId] = { x, y };

    if(blocksActive() && !drawerOpen && edgeSwipeId===null && sx > W - EDGE_SWIPE_ZONE){
      edgeSwipeId = e.pointerId;
      edgeSwipeStartX = sx;
      return;
    }

    if(blocksActive() && selectedBlock && pinchId1===null){
      const otherIds = Object.keys(activePointers).map(Number).filter(id => id !== e.pointerId);
      if(otherIds.length === 1){
        const otherId = otherIds[0];
        // only hijack the other finger if it's idle or already dragging this exact block
        const otherIsFree = (otherId===blockDragId || (otherId!==moveId && otherId!==ringId && otherId!==ballId && otherId!==edgeSwipeId));
        const otherPos = activePointers[otherId];
        if(otherIsFree && otherPos){
          const b = selectedBlock;
          const thisOnBlock = pointInBlockRect(x,y,b,30);
          const otherOnBlock = pointInBlockRect(otherPos.x,otherPos.y,b,30);
          if(thisOnBlock && otherOnBlock){
            if(blockDragId===otherId){ blockDragId=null; draggedBlock=null; }
            if(blockLongPressTimer){ clearTimeout(blockLongPressTimer); blockLongPressTimer=null; }
            pinchId1 = otherId; pinchId2 = e.pointerId; pinchBlock = b;
            pinchMode = null;
            const ddx = x-otherPos.x, ddy = y-otherPos.y;
            pinchStart.dist = Math.hypot(ddx,ddy) || 1;
            pinchStart.angle = Math.atan2(ddy,ddx);
            pinchStart.rot = b.rot||0;
            pinchStart.mulR = b.sizeMulR;
            return;
          }
        }
      }
    }

    // camera pinch-zoom — only when two fingers are down and NOT resizing the
    // selected block (checked above first, so it always wins over camera zoom)
    if(bigFieldMode && camPinchId1===null){
      const otherIds = Object.keys(screenPointers).map(Number).filter(id => id !== e.pointerId);
      if(otherIds.length === 1){
        const otherId = otherIds[0];
        const otherFree = (otherId!==moveId && otherId!==ballId && otherId!==ringId && otherId!==edgeSwipeId && otherId!==pinchId1 && otherId!==pinchId2);
        const otherPos = screenPointers[otherId];
        if(otherFree && otherPos){
          if(blockDragId===otherId || blockDragId===e.pointerId){ blockDragId=null; draggedBlock=null; }
          if(blockLongPressTimer){ clearTimeout(blockLongPressTimer); blockLongPressTimer=null; }
          if(panId===otherId || panId===e.pointerId) panId=null;
          camPinchId1 = otherId; camPinchId2 = e.pointerId;
          camPinchStart.dist = Math.hypot(sx-otherPos.x, sy-otherPos.y) || 1;
          camPinchStart.zoom = camera.zoom;
          camPinchStart.midX = (sx+otherPos.x)/2; camPinchStart.midY = (sy+otherPos.y)/2;
          camPinchStart.camX = camera.x; camPinchStart.camY = camera.y;
          return;
        }
      }
    }

    if(mode!=='billiard' && ballId===null && dist(x,y,ball.x,ball.y) < BALL_R+26){
      ballId = e.pointerId;
      ballDrag.lastX = x; ballDrag.lastY = y; ballDrag.lastT = performance.now();
      ballDrag.vx = 0; ballDrag.vy = 0;
      ball.wallStickT = 0;
      ball.pipedBy = null; ball.pipeApproaching = false;
      return;
    }

    if(blocksActive() && mode!=='billiard' && ringId===null && dist(x,y,ring.curX,ring.curY) < ring.r+18){
      ringId = e.pointerId; ring.dragging = true;
      return;
    }

    if(blocksActive() && blockDragId===null){
      const hitB = blockAt(x,y);
      if(hitB){
        blockDragId = e.pointerId;
        draggedBlock = hitB;
        selectedBlock = hitB;
        blockDragOffset.x = hitB.x - x;
        blockDragOffset.y = hitB.y - y;

        blockPressStartX = x; blockPressStartY = y;
        const pointerIdForTimer = e.pointerId;
        blockLongPressTimer = setTimeout(function(){
          blockLongPressTimer = null;
          if(blockDragId === pointerIdForTimer){ blockDragId = null; draggedBlock = null; }
          openBlockSettingsPopup(hitB);
        }, 550);
        return;
      }
    }

    if(mode==='billiard' && aimId===null && ballId===null){
      aimId = e.pointerId;
      aimStartX = x; aimStartY = y;
      aimPX = x; aimPY = y;
      ball.wallStickT = 0;
      ball.pipedBy = null; ball.pipeApproaching = false;
      return;
    }

    if(fanActive()){
      if(moveId===null && dist(x,y,fan.x,fan.y) < fan.bodyR+14){
        moveId = e.pointerId;
        fanPressStartX = x; fanPressStartY = y;
        const pointerIdForTimer = e.pointerId;
        fanLongPressTimer = setTimeout(function(){
          fanLongPressTimer = null;
          if(moveId === pointerIdForTimer){ moveId = null; }
          openBlockSettingsPopup(fan);
        }, 550);
        return;
      }
    }

    // reached the end without hitting anything interactive — an empty tap deselects,
    // but never while a second finger is mid-gesture (that's not an "empty tap")
    if(blocksActive() && selectedBlock && Object.keys(activePointers).length===1){
      selectedBlock = null;
    }

    // empty space, one finger, big field — pan the camera around (but never inside
    // the edge-swipe zone, so a near-miss swipe attempt can still be retried
    // instead of silently turning into a camera pan)
    if(bigFieldMode && panId===null && Object.keys(activePointers).length===1 && sx <= W - EDGE_SWIPE_ZONE){
      panId = e.pointerId;
      panStart.x = sx; panStart.y = sy;
      panStart.camX = camera.x; panStart.camY = camera.y;
    }
  }

  function onPointerMove(e){
    const world = screenToWorld(e.clientX, e.clientY);
    const wx = world.x, wy = world.y;
    if(activePointers[e.pointerId]){ activePointers[e.pointerId].x = wx; activePointers[e.pointerId].y = wy; }
    if(screenPointers[e.pointerId]){ screenPointers[e.pointerId].x = e.clientX; screenPointers[e.pointerId].y = e.clientY; }

    if(e.pointerId === camPinchId1 || e.pointerId === camPinchId2){
      const p1 = screenPointers[camPinchId1], p2 = screenPointers[camPinchId2];
      if(p1 && p2){
        const d = Math.hypot(p2.x-p1.x, p2.y-p1.y) || 1;
        let newZoom = camPinchStart.zoom * (d/camPinchStart.dist);
        newZoom = Math.max(minFitZoom()*0.85, Math.min(2.5, newZoom));
        const mx = (p1.x+p2.x)/2, my = (p1.y+p2.y)/2;
        // keep the world point under the pinch midpoint fixed as we zoom — natural pinch-zoom feel
        const worldAtStart = {
          x: camPinchStart.camX + (camPinchStart.midX-viewW/2)/camPinchStart.zoom,
          y: camPinchStart.camY + (camPinchStart.midY-viewH/2)/camPinchStart.zoom
        };
        camera.zoom = newZoom;
        camera.x = worldAtStart.x - (mx-viewW/2)/newZoom;
        camera.y = worldAtStart.y - (my-viewH/2)/newZoom;
        clampCamera();
      }
      return;
    }

    if(e.pointerId === panId){
      camera.x = panStart.camX - (e.clientX-panStart.x)/camera.zoom;
      camera.y = panStart.camY - (e.clientY-panStart.y)/camera.zoom;
      clampCamera();
      return;
    }

    if(e.pointerId === pinchId1 || e.pointerId === pinchId2){
      const p1 = activePointers[pinchId1], p2 = activePointers[pinchId2];
      if(p1 && p2 && pinchBlock){
        const ddx = p2.x-p1.x, ddy = p2.y-p1.y;

        let deltaAngle = 0;
        if(!pinchBlock.autoRotate){
          const curAngle = Math.atan2(ddy,ddx);
          deltaAngle = curAngle - pinchStart.angle;
          while(deltaAngle > Math.PI) deltaAngle -= Math.PI*2;
          while(deltaAngle < -Math.PI) deltaAngle += Math.PI*2;
        }
        const distRatio = Math.hypot(ddx,ddy) / pinchStart.dist;

        if(pinchMode === null){
          const ROT_THRESHOLD = Math.PI/22.5; // ~8 degrees
          const SCALE_THRESHOLD = 0.12; // 12% distance change
          const rotProgress = pinchBlock.autoRotate ? 0 : Math.abs(deltaAngle)/ROT_THRESHOLD;
          const scaleProgress = Math.abs(distRatio-1)/SCALE_THRESHOLD;
          if(rotProgress >= 1 || scaleProgress >= 1){
            pinchMode = (rotProgress >= scaleProgress) ? 'rotate' : 'scale';
          }
        }

        if(pinchMode === 'rotate' && !pinchBlock.autoRotate){
          const ROT_STEP = Math.PI/12; // 15 degrees
          pinchBlock.rot = Math.round((pinchStart.rot + deltaAngle) / ROT_STEP) * ROT_STEP;
        } else if(pinchMode === 'scale'){
          // pinch always drives ONLY the block's length/radius — thickness/width is
          // popup-only for every shape (see the warning comment above getBlockLocalBounds
          // for the general "don't special-case block geometry ad-hoc" rule this follows)
          pinchBlock.targetMulR = snapToSizeGrid(pinchStart.mulR * distRatio);
        }
      }
      return;
    }

    if(e.pointerId === aimId){
      aimPX = wx; aimPY = wy;
      return;
    }

    if(e.pointerId === ballId){
      const now = performance.now();
      const dt = Math.max(1, now - ballDrag.lastT)/1000;
      const nx = Math.max(WALL_MARGIN+BALL_R, Math.min(PLAY_W - WALL_MARGIN - BALL_R, wx));
      const ny = Math.max(WALL_MARGIN+BALL_R, Math.min(H - WALL_MARGIN - BALL_R, wy));
      const ivx = (nx - ballDrag.lastX)/dt;
      const ivy = (ny - ballDrag.lastY)/dt;
      ballDrag.vx = ballDrag.vx*0.6 + ivx*0.4;
      ballDrag.vy = ballDrag.vy*0.6 + ivy*0.4;
      ball.x = nx; ball.y = ny;
      ballDrag.lastX = nx; ballDrag.lastY = ny; ballDrag.lastT = now;
    } else if(e.pointerId === ringId){
      ring.x = Math.max(ring.r+WALL_MARGIN, Math.min(PLAY_W-ring.r-WALL_MARGIN, wx));
      ring.y = Math.max(ring.r+WALL_MARGIN, Math.min(H-ring.r-WALL_MARGIN, wy));
    } else if(e.pointerId === blockDragId && draggedBlock){
      if(blockLongPressTimer && dist(wx,wy,blockPressStartX,blockPressStartY) > 10){
        clearTimeout(blockLongPressTimer); blockLongPressTimer = null;
      }
      const ext = getRotatedWorldExtent(draggedBlock);
      const minPosX = WALL_MARGIN - ext.minX, maxPosX = PLAY_W - WALL_MARGIN - ext.maxX;
      const minPosY = WALL_MARGIN - ext.minY, maxPosY = H - WALL_MARGIN - ext.maxY;
      draggedBlock.x = Math.max(minPosX, Math.min(Math.max(minPosX,maxPosX), wx+blockDragOffset.x));
      draggedBlock.y = Math.max(minPosY, Math.min(Math.max(minPosY,maxPosY), wy+blockDragOffset.y));
      if(draggedBlock.oscillate){
        // subtract the (frozen) current phase offset so releasing continues
        // smoothly from the drop point instead of snapping to it
        const off = Math.sin(draggedBlock.oscPhase)*draggedBlock.oscAmp;
        const cosR = Math.cos(draggedBlock.rot||0), sinR = Math.sin(draggedBlock.rot||0);
        draggedBlock.oscBaseX = draggedBlock.x - off*cosR;
        draggedBlock.oscBaseY = draggedBlock.y - off*sinR;
      }
    } else if(e.pointerId === moveId){
      if(fanLongPressTimer && dist(wx,wy,fanPressStartX,fanPressStartY) > 10){
        clearTimeout(fanLongPressTimer); fanLongPressTimer = null;
      }
      const margin = fan.bodyR + 10;
      fan.x = Math.max(margin, Math.min(PLAY_W - margin, wx));
      fan.y = Math.max(margin, Math.min(H - margin, wy));
    } else if(e.pointerId === edgeSwipeId){
      const draggedLeft = edgeSwipeStartX - e.clientX;
      if(draggedLeft > 45){
        openDrawer();
        edgeSwipeId = null; // gesture consumed — stop tracking this pointer
      }
    }
  }

  function onPointerUp(e){
    if(e.pointerId === moveId){
      moveId = null;
      if(fanLongPressTimer){ clearTimeout(fanLongPressTimer); fanLongPressTimer = null; }
    }
    if(e.pointerId === ringId){ ringId = null; ring.dragging = false; }
    if(e.pointerId === blockDragId){
      blockDragId = null; draggedBlock = null;
      if(blockLongPressTimer){ clearTimeout(blockLongPressTimer); blockLongPressTimer = null; }
    }
    if(e.pointerId === edgeSwipeId) edgeSwipeId = null;
    if(e.pointerId === pinchId1 || e.pointerId === pinchId2){ pinchId1=null; pinchId2=null; pinchBlock=null; pinchMode=null; }
    if(e.pointerId === camPinchId1 || e.pointerId === camPinchId2){ camPinchId1=null; camPinchId2=null; }
    if(e.pointerId === panId) panId = null;
    if(e.pointerId === ballId){
      ball.vx = ballDrag.vx; ball.vy = ballDrag.vy;
      ballId = null;
    }
    if(e.pointerId === aimId){
      const pullX = aimPX - aimStartX, pullY = aimPY - aimStartY;
      const pullDist = Math.min(AIM_MAX_PULL, Math.hypot(pullX, pullY));
      if(pullDist > 8){
        const power = pullDist / AIM_MAX_PULL;
        const nx = -pullX/Math.hypot(pullX,pullY), ny = -pullY/Math.hypot(pullX,pullY);
        ball.vx = nx * power * AIM_MAX_SPEED;
        ball.vy = ny * power * AIM_MAX_SPEED;
      }
      aimId = null;
    }
    delete activePointers[e.pointerId];
    delete screenPointers[e.pointerId];
  }

  window.addEventListener('pointerdown', onPointerDown, {passive:true});
  window.addEventListener('pointermove', onPointerMove, {passive:true});
  window.addEventListener('pointerup', onPointerUp, {passive:true});
  window.addEventListener('pointercancel', onPointerUp, {passive:true});

  function blockNativeGesture(e){ e.preventDefault(); }
  document.getElementById('stage').addEventListener('touchstart', blockNativeGesture, {passive:false});
  document.getElementById('stage').addEventListener('touchmove', blockNativeGesture, {passive:false});
  document.getElementById('stage').addEventListener('touchend', blockNativeGesture, {passive:false});
  document.body.addEventListener('touchmove', function(e){
    if(e.target.closest && (e.target.closest('#drawer') || e.target.closest('#blockPopupWrap') || e.target.closest('#saveConfirmWrap') || e.target.closest('#gridSetupWrap') || e.target.closest('#importLevelWrap') || e.target.closest('#startScreen'))) return;
    e.preventDefault();
  }, {passive:false});
  document.addEventListener('gesturestart', function(e){ e.preventDefault(); });

  window.addEventListener('resize', resize);

