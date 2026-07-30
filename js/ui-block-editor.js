"use strict";

  // ---------- block drawer ----------
  let drawerOpen = false;
  function openDrawer(){
    drawerOpen = true;
    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawerBackdrop').classList.add('show');
  }
  function closeDrawer(){
    drawerOpen = false;
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawerBackdrop').classList.remove('show');
    debugPanelVisible = false;
    document.getElementById('debugPanel').classList.remove('show');
  }
  const debugPanelEl = document.getElementById('debugPanel');
  let debugPanelVisible = false;
  function toggleDebugPanel(){
    debugPanelVisible = !debugPanelVisible;
    debugPanelEl.classList.toggle('show', debugPanelVisible);
  }

  (function(){
    const menuBtn = document.getElementById('menuBtn');
    let pressTimer = null, longPressFired = false;
    const LONG_PRESS_MS = 550;

    menuBtn.addEventListener('pointerdown', function(){
      longPressFired = false;
      pressTimer = setTimeout(function(){
        longPressFired = true;
        if(!drawerOpen) openDrawer();
        toggleDebugPanel();
      }, LONG_PRESS_MS);
    });
    function cancelPress(){ clearTimeout(pressTimer); }
    menuBtn.addEventListener('pointerup', cancelPress);
    menuBtn.addEventListener('pointercancel', cancelPress);
    menuBtn.addEventListener('pointerleave', cancelPress);

    menuBtn.addEventListener('click', function(e){
      if(longPressFired){
        longPressFired = false;
        e.preventDefault();
        return;
      }
      drawerOpen ? closeDrawer() : openDrawer();
    });
  })();

  document.getElementById('drawerBackdrop').addEventListener('click', closeDrawer);

  const frictionSlider = document.getElementById('frictionSlider');
  const frictionValueEl = document.getElementById('frictionValue');
  makeSliderFullyDraggable(frictionSlider);
  frictionSlider.addEventListener('input', function(){
    frictionLevel = parseFloat(frictionSlider.value);
    frictionValueEl.textContent = frictionLevel.toFixed(2);
  });

  const bgCountValueEl = document.getElementById('bgCountValue');
  document.getElementById('bgCountMinus').addEventListener('click', function(){
    bgCycleCount = Math.max(1, bgCycleCount - 1);
    bgCountValueEl.textContent = bgCycleCount;
  });
  document.getElementById('bgCountPlus').addEventListener('click', function(){
    bgCycleCount = Math.min(20, bgCycleCount + 1);
    bgCountValueEl.textContent = bgCycleCount;
  });

  const bgDelayValueEl = document.getElementById('bgDelayValue');
  document.getElementById('bgDelayMinus').addEventListener('click', function(){
    bgCycleDelay = Math.max(0.5, Math.round((bgCycleDelay - 0.5)*10)/10);
    bgDelayValueEl.textContent = bgCycleDelay;
  });
  document.getElementById('bgDelayPlus').addEventListener('click', function(){
    bgCycleDelay = Math.min(30, Math.round((bgCycleDelay + 0.5)*10)/10);
    bgDelayValueEl.textContent = bgCycleDelay;
  });

  const fanEscapeValueEl = document.getElementById('fanEscapeValue');
  document.getElementById('fanEscapeMinus').addEventListener('click', function(){
    fanEscapeThreshold = Math.max(500, fanEscapeThreshold - 200);
    fanEscapeValueEl.textContent = fanEscapeThreshold;
  });
  document.getElementById('fanEscapePlus').addEventListener('click', function(){
    fanEscapeThreshold = Math.min(maxBallSpeed, fanEscapeThreshold + 200);
    fanEscapeValueEl.textContent = fanEscapeThreshold;
  });

  const maxSpeedValueEl = document.getElementById('maxSpeedValue');
  document.getElementById('maxSpeedMinus').addEventListener('click', function(){
    maxBallSpeed = Math.max(1000, maxBallSpeed - 250);
    if(fanEscapeThreshold > maxBallSpeed){ fanEscapeThreshold = maxBallSpeed; fanEscapeValueEl.textContent = fanEscapeThreshold; }
    maxSpeedValueEl.textContent = maxBallSpeed;
  });
  document.getElementById('maxSpeedPlus').addEventListener('click', function(){
    maxBallSpeed = Math.min(10000, maxBallSpeed + 250);
    maxSpeedValueEl.textContent = maxBallSpeed;
  });

  document.getElementById('gravityToggle').addEventListener('change', function(e){
    gravityEnabled = e.target.checked;
  });

  const gravityValueEl = document.getElementById('gravityValue');
  document.getElementById('gravityMinus').addEventListener('click', function(){
    gravityStrength = Math.max(0, gravityStrength - 150);
    gravityValueEl.textContent = gravityStrength;
  });
  document.getElementById('gravityPlus').addEventListener('click', function(){
    gravityStrength = Math.min(4000, gravityStrength + 150);
    gravityValueEl.textContent = gravityStrength;
  });

  let debugLogEntries = [];
  const debugConsoleEl = document.getElementById('debugConsole');
  const consoleToggleEl = document.getElementById('consoleToggle');

  function renderDebugConsole(){
    debugConsoleEl.innerHTML = debugLogEntries.map(function(entry){
      const cls = entry.level==='error' ? 'logErr' : (entry.level==='warn' ? 'logWarn' : '');
      const safe = entry.msg.replace(/</g,'&lt;');
      return '<div class="'+cls+'">['+entry.time+'] '+safe+'</div>';
    }).join('');
    debugConsoleEl.scrollTop = debugConsoleEl.scrollHeight;
  }
  function debugLog(msg, level){
    debugLogEntries.push({ msg: msg, level: level||'info', time: new Date().toLocaleTimeString() });
    if(debugLogEntries.length > 40) debugLogEntries.shift();
    renderDebugConsole();
  }
  consoleToggleEl.addEventListener('change', function(){
    debugConsoleEl.classList.toggle('show', consoleToggleEl.checked);
  });

  const squashValueEl = document.getElementById('squashValue');
  document.getElementById('squashMinus').addEventListener('click', function(){
    squashThreshold = Math.max(300, squashThreshold - 200);
    squashValueEl.textContent = squashThreshold;
  });
  document.getElementById('squashPlus').addEventListener('click', function(){
    squashThreshold = Math.min(6000, squashThreshold + 200);
    squashValueEl.textContent = squashThreshold;
  });

  function setupDrawerSwipeClose(sourceEl){
    const drawerEl = document.getElementById('drawer');
    let startX=0, startY=0, dragging=false, locked=null; // locked: 'h' (closing swipe) or 'v' (scroll)
    const CLOSE_THRESHOLD = 70;

    sourceEl.addEventListener('touchstart', function(e){
      if(!drawerOpen) return;
      if(e.target.closest && e.target.closest('button, input, .stepperBtn, .tile, .debugSlider, .toggleSwitch')) return;
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      dragging = true; locked = null;
      drawerEl.style.transition = 'none';
    }, {passive:true});

    sourceEl.addEventListener('touchmove', function(e){
      if(!dragging) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if(locked === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)){
        locked = Math.abs(dx) > Math.abs(dy)*1.2 ? 'h' : 'v';
      }
      if(locked === 'h' && dx > 0){
        e.preventDefault();
        drawerEl.style.transform = 'translateX(' + dx + 'px)';
      }
      // locked === 'v' — do nothing, native scroll handles it
    }, {passive:false});

    sourceEl.addEventListener('touchend', function(e){
      if(!dragging) return;
      dragging = false;
      drawerEl.style.transition = '';
      if(locked === 'h'){
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        drawerEl.style.transform = '';
        if(dx > CLOSE_THRESHOLD) closeDrawer();
      }
      locked = null;
    }, {passive:true});
  }
  setupDrawerSwipeClose(document.getElementById('drawer'));
  setupDrawerSwipeClose(document.getElementById('drawerBackdrop'));

  function spawnBlock(kind){
    const b = spawnBlockCore(kind);
    closeDrawer();
    return b;
  }
  function spawnBlockCore(kind){
    if(blocks.length >= 24) return null;
    const dims = BLOCK_KINDS[kind];
    let tempSpan;
    if(dims.shape === 'wave') tempSpan = dims.bumps*2*dims.r + dims.thick;
    else if(dims.shape === 'spinner') tempSpan = dims.bladeLen*2;
    else tempSpan = dims.w || dims.r*2;
    const halfSpan = tempSpan * 0.5;

    // spawn within whatever's currently visible through the camera — matters
    // once zoomed into the big field; identity range in normal mode
    const halfVW = (viewW/2)/camera.zoom, halfVH = (viewH/2)/camera.zoom;
    const pad = halfSpan + 20;
    const minX = Math.max(WALL_MARGIN+pad, camera.x - halfVW + pad);
    const maxX = Math.min(PLAY_W-WALL_MARGIN-pad, camera.x + halfVW - pad);
    const minY = Math.max(WALL_MARGIN+pad, camera.y - halfVH + pad);
    const maxY = Math.min(H-WALL_MARGIN-pad, camera.y + halfVH - pad);
    const spawnX = maxX > minX ? (minX + Math.random()*(maxX-minX)) : camera.x;
    const spawnY = maxY > minY ? (minY + Math.random()*(maxY-minY)) : camera.y;

    const b = makeBlock(kind, spawnX, spawnY, 0);
    blocks.push(b);
    setTimeout(function(){ b.spawnT = performance.now(); }, 320);
    return b;
  }
  function renderTilePreview(canvasEl, kind){
    const b = makeBlock(kind, 0, 0, 0);
    const pal = BLOCK_PALETTES[0];
    b.colorLight = hexToRgb(pal.light);
    b.colorMid = hexToRgb(pal.mid);
    b.colorDark = hexToRgb(pal.dark);
    b.showRangeHighlight = false; // previews shouldn't show the gameplay suction-range overlay
    if(b.shape === 'wave'){ b.sizeMulThick = 1; b.thick = b.baseThick; } // show full thickness, not the thin spawn default

    const tctx = canvasEl.getContext('2d');
    const cw = canvasEl.width, ch = canvasEl.height;
    tctx.clearRect(0,0,cw,ch);

    let minX,maxX,minY,maxY;
    // NOTE: this duplicates part of getBlockLocalBounds() below (different shape list —
    // this one also handles spinner, which has no asymmetric-origin concern). If you're
    // fixing a bounds bug, check getBlockLocalBounds() first — see the warning comment there.
    if(b.shape === 'spinner'){
      const rr = b.bladeLen + b.bladeW/2;
      minX=-rr; maxX=rr; minY=-rr; maxY=rr;
    } else if(b.shape === 'wave'){
      const outerR = b.r + b.thick/2;
      minX = -b.w/2; maxX = b.w/2;
      if(b.bumps <= 1){ minY = 0; maxY = outerR; }
      else { minY = -outerR; maxY = outerR; }
    } else if(b.shape === 'circle' && b.visual === 'quarter'){
      minX=0; maxX=b.r; minY=-b.r; maxY=0;
    } else if(b.shape === 'circle'){
      minX=-b.r; maxX=b.r; minY=-b.r; maxY=b.r;
    } else if(b.shape === 'fan'){
      const rr = b.r + 26; // room for the confetti ribbons reaching past the housing
      minX=-rr; maxX=rr; minY=-rr; maxY=rr;
    } else if(b.shape === 'pipe' && b.pipeType === 'elbow'){
      const half = b.pipeW/2 + 8;
      minX = -b.armLen - half; maxX = half;
      minY = -b.armLen - half; maxY = half;
    } else if(b.shape === 'pipe'){
      minX=-b.w/2; maxX=b.w/2; minY=-b.h/2; maxY=b.h/2;
    } else {
      minX=-b.w/2; maxX=b.w/2; minY=-b.h/2; maxY=b.h/2;
    }
    const mx=(minX+maxX)/2, my=(minY+maxY)/2;
    const boundW=maxX-minX, boundH=maxY-minY;
    const pad = cw*0.3;
    const fit = Math.min((cw-pad)/boundW, (ch-pad)/boundH);

    tctx.save();
    tctx.translate(cw/2 - mx*fit, ch/2 - my*fit);
    tctx.scale(fit, fit);
    renderBlockShape(tctx, b, false);
    if(b.shape === 'fan' && b.confetti){
      const r = b.r + 6;
      for(const piece of b.confetti){
        const ax = Math.cos(piece.anchorAngle)*r;
        const ay = Math.sin(piece.anchorAngle)*r;
        drawConfettiPiece(tctx, piece, ax, ay);
      }
    }
    tctx.restore();
  }

  // Прев'ю фігур (renderTilePreview) рендериться в game.js, ПІСЛЯ завантаження
  // renderer.js — сама функція викликає renderBlockShape/drawConfettiPiece,
  // яких тут ще немає в момент виконання цього файлу (див. порядок <script> у index.html).
  document.querySelectorAll('.tile').forEach(function(btn){
    btn.addEventListener('click', function(){ spawnBlock(btn.dataset.kind); });
  });

