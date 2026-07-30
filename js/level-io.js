"use strict";

  // ---------- saved level ----------
  // Coordinates are fractions of the play area (rx of PLAY_W, ry of H) so the
  // layout scales correctly to any screen size.
  const LEVEL_1 = {
    ring: { rx: 0.70, ry: 0.34 },
    blocks: [
      { kind:'pillar', rx:0.42, ry:0.30, rot:Math.PI/2 },
      { kind:'pillar', rx:0.72, ry:0.30, rot:Math.PI/2 },
      { kind:'pillar', rx:0.07, ry:0.44, rot:0 },
      { kind:'pillar', rx:0.77, ry:0.44, rot:0 },
      { kind:'pillar', rx:0.34, ry:0.50, rot:Math.PI/2 },
      { kind:'pillar', rx:0.245,ry:0.47, rot:0 },
      { kind:'square', rx:0.41, ry:0.60, rot:0 },
      { kind:'square', rx:0.57, ry:0.60, rot:0 },
      { kind:'square', rx:0.76, ry:0.59, rot:0 }
    ]
  };

  function makeBlock(kind, x, y, rot){
    const dims = BLOCK_KINDS[kind];
    const bumps = dims.bumps || 0;
    const baseThick = dims.thick || 0;
    let baseW, baseH, baseR;
    if(dims.shape === 'wave'){
      baseR = dims.r;
      baseW = bumps * 2 * dims.r + baseThick;
      baseH = 2*dims.r + baseThick;
    } else if(dims.shape === 'spinner'){
      baseR = dims.bladeLen;
      baseW = baseH = dims.bladeLen*2;
    } else if(dims.shape === 'pipe'){
      if(dims.pipeType === 'straight'){
        baseW = dims.length + dims.pipeW;
        baseH = dims.pipeW * 2.2;
      } else {
        baseW = baseH = dims.armLen + dims.pipeW*1.5;
      }
      baseR = dims.pipeW/2;
    } else {
      baseW = dims.w || dims.r*2;
      baseH = dims.h || dims.r*2;
      baseR = dims.r || 0;
    }
    const pal0 = BLOCK_PALETTES[Math.floor(Math.random()*BLOCK_PALETTES.length)];
    const cL = hexToRgb(pal0.light), cM = hexToRgb(pal0.mid), cD = hexToRgb(pal0.dark);
    return {
      id: blockIdSeq++, kind, shape: dims.shape, visual: dims.visual,
      capsule: !!dims.capsule, bumps,
      baseW, baseH, baseR, baseThick,
      w: baseW, h: baseH, r: baseR, thick: baseThick,
      lengthAxis: dims.lengthAxis || null,
      sizeMulW:1, sizeMulWVel:0, targetMulW:1,
      sizeMulH:1, sizeMulHVel:0, targetMulH:1,
      sizeMulR:1, sizeMulRVel:0, targetMulR:1,
      sizeMulThick: dims.shape==='wave' ? THICK_STEPS[0] : 1,
      sizeMulThickVel:0, targetMulThick: dims.shape==='wave' ? THICK_STEPS[0] : 1,
      colorLight:cL, colorMid:cM, colorDark:cD,
      blades: dims.blades||0, bladeLen: dims.bladeLen||0, bladeW: dims.bladeW||0,
      autoRotate: !!dims.rotSpeed, rotSpeed: dims.rotSpeed||0,
      oscillate: !!dims.oscillate, oscAmp: dims.oscAmp||0, oscSpeed: dims.oscSpeed||0,
      bouncy: !!dims.bouncy,
      bounciness: dims.bounciness || 1.8,
      sectorAngle: dims.sectorAngle!=null ? dims.sectorAngle : 0,
      fanPower: dims.fanPower||0,
      pipeType: dims.pipeType||null, length: dims.length||0, armLen: dims.armLen||0,
      basePipeLength: dims.length||0, baseArmLen: dims.armLen||0, basePipeW: dims.pipeW||40,
      pipeW: dims.pipeW||40, suction: dims.suction||1, ejection: dims.ejection||1,
      suctionRange: dims.suctionRange!=null ? dims.suctionRange : 1.0,
      flipped: false,
      showRangeHighlight: true,
      bladeSpin: Math.random()*Math.PI*2,
      confetti: dims.shape==='fan' ? makeBlockConfetti(dims.sectorAngle) : null,
      oscBaseX:x, oscBaseY:y, oscPhase: Math.random()*Math.PI*2,
      x, y,
      scale:0, scaleVel:0, spawnT:null, rot: rot||0
    };
  }

  function loadLevel(def){
    blocks = [];
    selectedBlock = null; draggedBlock = null;
    for(const bd of def.blocks){
      const b = makeBlock(bd.kind, bd.rx*PLAY_W, bd.ry*H, bd.rot||0);
      if(bd.sizeMulR!=null) b.targetMulR = bd.sizeMulR;
      if(bd.sizeMulThick!=null) b.targetMulThick = bd.sizeMulThick;
      if(bd.sizeMulW!=null) b.targetMulW = bd.sizeMulW;
      if(bd.sizeMulH!=null) b.targetMulH = bd.sizeMulH;
      if(bd.colorLight){ b.colorLight = {r:bd.colorLight[0], g:bd.colorLight[1], b:bd.colorLight[2]}; }
      if(bd.colorMid){ b.colorMid = {r:bd.colorMid[0], g:bd.colorMid[1], b:bd.colorMid[2]}; }
      if(bd.colorDark){ b.colorDark = {r:bd.colorDark[0], g:bd.colorDark[1], b:bd.colorDark[2]}; }
      if(bd.rotSpeed!=null) b.rotSpeed = bd.rotSpeed;
      if(bd.fanPower!=null) b.fanPower = bd.fanPower;
      if(bd.bounciness!=null) b.bounciness = bd.bounciness;
      if(bd.suction!=null) b.suction = bd.suction;
      if(bd.ejection!=null) b.ejection = bd.ejection;
      if(bd.suctionRange!=null) b.suctionRange = bd.suctionRange;
      if(bd.flipped!=null) b.flipped = bd.flipped;
      if(bd.showRangeHighlight!=null) b.showRangeHighlight = bd.showRangeHighlight;
      blocks.push(b);
      setTimeout((function(bb){ return function(){ bb.spawnT = performance.now(); }; })(b), 150+Math.random()*280);
    }
    if(def.ring){
      ring.x = def.ring.rx*PLAY_W; ring.y = def.ring.ry*H;
      ring.curX = ring.x; ring.curY = ring.y;
    }
    const brx = def.ballRx!=null ? def.ballRx : 0.45;
    const bry = def.ballRy!=null ? def.ballRy : 0.43;
    resetBall(PLAY_W*brx, H*bry);

    // Фіксовані кольорові кульки (на відміну від spawnExtraBall, який ставить
    // їх у випадкове місце) — потрібні, щоб рівень відтворювався однаково щоразу.
    extraBalls = [];
    if(def.extraBalls && def.extraBalls.length){
      def.extraBalls.forEach(function(eb){
        extraBalls.push({
          x: eb.rx*PLAY_W, y: eb.ry*H, vx:0, vy:0, rot:0,
          color: eb.color || EXTRA_BALL_COLORS[extraBalls.length % EXTRA_BALL_COLORS.length]
        });
      });
    }

    if(def.bgTiles && def.bgTiles.length){
      const map = {};
      def.bgTiles.forEach(function(t){ map[t.gx+'_'+t.gy] = t; });
      bgTiles.forEach(function(t){
        const saved = map[t.gx+'_'+t.gy];
        if(saved){
          t.colorTop.r=saved.top[0]; t.colorTop.g=saved.top[1]; t.colorTop.b=saved.top[2];
          t.colorBot.r=saved.bot[0]; t.colorBot.g=saved.bot[1]; t.colorBot.b=saved.bot[2];
          t.targetTop = {r:saved.top[0], g:saved.top[1], b:saved.top[2]};
          t.targetBot = {r:saved.bot[0], g:saved.bot[1], b:saved.bot[2]};
        }
      });
    }
  }

  document.getElementById('level1Btn').addEventListener('click', function(){
    loadLevel(LEVEL_1);
    currentLoadedLevelIndex = null;
  });

  const LEVEL_2 = {
    ring: { rx: 0.62, ry: 0.37 },
    ballRx: 0.32, ballRy: 0.40,
    blocks: [
      { kind:'halfcircle', rx:0.475, ry:0.235, rot:Math.PI, sizeMulR:2.0, sizeMulThick:0.275 },
      { kind:'circle',     rx:0.46,  ry:0.53,  rot:0,       sizeMulR:2.0 },
      { kind:'halfcircle', rx:0.475, ry:0.77,  rot:0,       sizeMulR:2.0, sizeMulThick:0.275 }
    ]
  };
  document.getElementById('level2Btn').addEventListener('click', function(){
    loadLevel(LEVEL_2);
    currentLoadedLevelIndex = null;
  });

  // Рівень №3: кластер з 7 вентиляторів (spinner4) угорі зліва-по-центру,
  // ціль (ring) нижче праворуч по центру. Координати приблизні — зняті зі
  // скріншота геймплею (кластер щільно збитих пропелерів + м'яч над ним).
  const LEVEL_3 = {
    ring: { rx: 0.62, ry: 0.505 },
    ballRx: 0.434, ballRy: 0.126,
    blocks: [
      { kind:'spinner4', rx:0.291, ry:0.145, rot:0 },
      { kind:'spinner4', rx:0.459, ry:0.139, rot:0 },
      { kind:'spinner4', rx:0.211, ry:0.192, rot:0 },
      { kind:'spinner4', rx:0.379, ry:0.201, rot:0 },
      { kind:'spinner4', rx:0.506, ry:0.214, rot:0 },
      { kind:'spinner4', rx:0.253, ry:0.254, rot:0 },
      { kind:'spinner4', rx:0.388, ry:0.271, rot:0 }
    ]
  };
  document.getElementById('level3Btn').addEventListener('click', function(){
    loadLevel(LEVEL_3);
    currentLoadedLevelIndex = null;
  });

  // Рівень №4: 3 труби вздовж правого краю/низу + ціль по центру-низу +
  // 12 фіксованих кольорових кульок. Координати й тип труб — приблизна оцінка
  // зі скріншота геймплею (більярд-режим з розставленими трубами), розмір
  // довгої труби підігнано через sizeMulW, бо на фото вона довша за дефолтну.
  const LEVEL_4 = {
    ring: { rx: 0.485, ry: 0.751 },
    ballRx: 0.278, ballRy: 0.134,
    blocks: [
      { kind:'pipeElbow',    rx:0.911, ry:0.103, rot:Math.PI*0.7 },
      { kind:'pipeStraight', rx:0.915, ry:0.423, rot:Math.PI/2, sizeMulW:5 },
      { kind:'pipeStraight', rx:0.759, ry:0.873, rot:0, sizeMulW:3 }
    ],
    extraBalls: [
      { rx:0.426, ry:0.122, color:'#ff8fd1' },
      { rx:0.185, ry:0.209, color:'#ff9f43' },
      { rx:0.468, ry:0.265, color:'#4fe0a8' },
      { rx:0.734, ry:0.258, color:'#5ce1e6' },
      { rx:0.194, ry:0.397, color:'#5ce1e6' },
      { rx:0.649, ry:0.397, color:'#8a5cff' },
      { rx:0.430, ry:0.493, color:'#8a5cff' },
      { rx:0.207, ry:0.599, color:'#5ce1e6' },
      { rx:0.679, ry:0.601, color:'#ff8fd1' },
      { rx:0.700, ry:0.690, color:'#4fe0a8' },
      { rx:0.257, ry:0.709, color:'#8a5cff' }
    ]
  };
  document.getElementById('level4Btn').addEventListener('click', function(){
    loadLevel(LEVEL_4);
    currentLoadedLevelIndex = null;
  });

  // ---------- custom (player-saved) levels ----------
  let customLevels = [];
  let currentLoadedLevelIndex = null; // index into customLevels, or null if none / a built-in level is active
  const customLevelsContainer = document.getElementById('customLevelsContainer');

  function renderCustomLevelButton(def, idx){
    const btn = document.createElement('button');
    btn.className = 'modeCard bezel';
    btn.dataset.mode = 'blocks';
    btn.innerHTML =
      '<div class="icons"><svg viewBox="0 0 24 24">' +
      '<circle cx="12" cy="7.2" r="3.4" fill="#2f66d6" stroke="#9fd0ff" stroke-width="1.3"/>' +
      '<path d="M7 21 C7 14.5 9 12 12 12 C15 12 17 14.5 17 21 Z" fill="#2f66d6" stroke="#9fd0ff" stroke-width="1.3"/>' +
      '</svg></div>' +
      '<div class="txt">Рівень №' + (idx+3) + '<small>Збережена траса з блоками</small></div>';
    btn.addEventListener('click', function(){
      startGame('blocks');
      loadLevel(def);
      currentLoadedLevelIndex = idx;
    });
    customLevelsContainer.appendChild(btn);
  }

  function renderAllCustomLevels(){
    customLevelsContainer.innerHTML = '';
    customLevels.forEach(function(def, idx){ renderCustomLevelButton(def, idx); });
  }

  async function loadCustomLevels(){
    try{
      const res = await window.storage.get('custom-levels');
      if(res && res.value){
        customLevels = JSON.parse(res.value);
        renderAllCustomLevels();
      }
    }catch(e){
      debugLog('loadCustomLevels: nothing saved yet, or storage read failed: ' + e, 'warn');
    }
  }
  async function persistCustomLevels(){
    try{
      const result = await window.storage.set('custom-levels', JSON.stringify(customLevels));
      if(!result){
        debugLog('persistCustomLevels: storage.set returned falsy — save likely did not persist', 'error');
        flashSaveButton('Помилка збереження!');
        return false;
      }
      return true;
    }catch(e){
      debugLog('persistCustomLevels failed: ' + e, 'error');
      flashSaveButton('Помилка збереження!');
      return false;
    }
  }

  function buildLevelDefFromCurrentBlocks(){
    const def = {
      ring: { rx: ring.x/PLAY_W, ry: ring.y/H },
      ballRx: ball.x/PLAY_W, ballRy: ball.y/H,
      blocks: blocks.map(function(b){
        return {
          kind: b.kind, rx: b.x/PLAY_W, ry: b.y/H, rot: b.rot||0,
          sizeMulR: b.targetMulR, sizeMulThick: b.targetMulThick,
          sizeMulW: b.targetMulW, sizeMulH: b.targetMulH,
          rotSpeed: b.autoRotate ? b.rotSpeed : undefined,
          fanPower: b.shape==='fan' ? b.fanPower : undefined,
          bounciness: b.bouncy ? b.bounciness : undefined,
          suction: b.shape==='pipe' ? b.suction : undefined,
          ejection: b.shape==='pipe' ? b.ejection : undefined,
          suctionRange: b.shape==='pipe' ? b.suctionRange : undefined,
          flipped: b.shape==='pipe' ? b.flipped : undefined,
          showRangeHighlight: b.shape==='pipe' ? b.showRangeHighlight : undefined,
          colorLight: [b.colorLight.r|0, b.colorLight.g|0, b.colorLight.b|0],
          colorMid:   [b.colorMid.r|0, b.colorMid.g|0, b.colorMid.b|0],
          colorDark:  [b.colorDark.r|0, b.colorDark.g|0, b.colorDark.b|0]
        };
      }),
      bgTiles: bgTiles.map(function(t){
        return {
          gx: t.gx, gy: t.gy,
          top: [t.colorTop.r|0, t.colorTop.g|0, t.colorTop.b|0],
          bot: [t.colorBot.r|0, t.colorBot.g|0, t.colorBot.b|0]
        };
      })
    };
    return def;
  }

  function flashSaveButton(text){
    const btn = document.getElementById('saveLevelBtn');
    const oldText = btn.textContent;
    btn.textContent = text;
    btn.classList.add('saved');
    setTimeout(function(){ btn.textContent = oldText; btn.classList.remove('saved'); }, 1200);
  }

  async function copyLevelToClipboard(def){
    try{
      const json = JSON.stringify(def, null, 2);
      if(navigator.clipboard && navigator.clipboard.writeText){
        await navigator.clipboard.writeText(json);
        return true;
      }
    }catch(e){
      debugLog('copyLevelToClipboard failed: ' + e, 'warn');
    }
    return false;
  }

  async function doSaveAsNew(){
    const def = buildLevelDefFromCurrentBlocks();
    customLevels.push(def);
    currentLoadedLevelIndex = customLevels.length-1;
    renderAllCustomLevels();
    const ok = await persistCustomLevels();
    await copyLevelToClipboard(def);
    if(ok) flashSaveButton('Збережено!');
  }

  async function doOverwriteLevel(idx){
    const def = buildLevelDefFromCurrentBlocks();
    customLevels[idx] = def;
    renderAllCustomLevels();
    const ok = await persistCustomLevels();
    await copyLevelToClipboard(def);
    if(ok) flashSaveButton('Перезаписано!');
  }

  function saveCurrentLayoutAsLevel(){
    if(currentLoadedLevelIndex!=null && customLevels[currentLoadedLevelIndex]){
      openSaveConfirmPopup(currentLoadedLevelIndex);
    } else {
      doSaveAsNew();
    }
  }
  document.getElementById('saveLevelBtn').addEventListener('click', saveCurrentLayoutAsLevel);
  loadCustomLevels();

  let saveConfirmPendingIndex = null;
  const saveConfirmPopupEl = document.getElementById('saveConfirmWrap');
  const saveConfirmBackdropEl = document.getElementById('saveConfirmBackdrop');
  const saveConfirmTitleEl = document.getElementById('saveConfirmTitle');
  function openSaveConfirmPopup(idx){
    saveConfirmPendingIndex = idx;
    saveConfirmTitleEl.textContent = 'ПЕРЕЗАПИСАТИ РІВЕНЬ №' + (idx+3) + '?';
    saveConfirmPopupEl.classList.add('show');
    saveConfirmBackdropEl.classList.add('show');
  }
  function closeSaveConfirmPopup(){
    saveConfirmPendingIndex = null;
    saveConfirmPopupEl.classList.remove('show');
    saveConfirmBackdropEl.classList.remove('show');
  }
  saveConfirmBackdropEl.addEventListener('click', closeSaveConfirmPopup);
  document.getElementById('saveConfirmCloseBtn').addEventListener('click', closeSaveConfirmPopup);
  document.getElementById('saveConfirmOverwriteBtn').addEventListener('click', function(){
    const idx = saveConfirmPendingIndex;
    closeSaveConfirmPopup();
    if(idx!=null) doOverwriteLevel(idx);
  });
  document.getElementById('saveConfirmNewBtn').addEventListener('click', function(){
    closeSaveConfirmPopup();
    doSaveAsNew();
  });

