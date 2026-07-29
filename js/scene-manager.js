"use strict";

  // ---------- start menu ----------
  function startGame(selected){
    mode = selected;
    screen = 'play';
    document.getElementById('startScreen').style.display = 'none';
    document.getElementById('menuBtn').style.display = (blocksActive()) ? 'flex' : 'none';
    document.getElementById('homeBtn').style.display = 'flex';
    document.getElementById('addBallBtn').style.display = (mode==='billiard') ? 'flex' : 'none';
    extraBalls = [];
    comboCount = 0; lastScoreTime = 0; hideCombo();
    currentLoadedLevelIndex = null;
  }

  function goHome(){
    screen = 'start';
    closeDrawer();
    closeBlockSettingsPopup();
    closeGridSetupPopup();
    document.getElementById('startScreen').style.display = 'flex';
    document.getElementById('menuBtn').style.display = 'none';
    document.getElementById('homeBtn').style.display = 'none';
    document.getElementById('addBallBtn').style.display = 'none';
    extraBalls = [];
    comboCount = 0; lastScoreTime = 0; hideCombo();
    score = 0; scoreN.textContent = 0;
    blocks = [];
    selectedBlock = null; draggedBlock = null;
    bigFieldMode = false;
    resize();
    fanEnabled = false;
    fan.basePower = 0.3;
  }
  document.getElementById('homeBtn').addEventListener('click', goHome);
  document.getElementById('addBallBtn').addEventListener('click', function(){
    if(extraBalls.length >= 12) return; // keep the table from getting overcrowded
    spawnExtraBall();
  });

  document.querySelectorAll('.modeCard').forEach(function(btn){
    btn.addEventListener('click', function(){ startGame(btn.dataset.mode); });
  });

  function setupBigField(){
    bigFieldMode = true;
    resize();
    fan.x = PLAY_W*0.5; fan.y = H*0.74;
    resetBall(PLAY_W*0.5, H*0.3);
    blocks = [];
    placeRing();
    ring.curX = ring.x; ring.curY = ring.y;
    camera.zoom = minFitZoom(); // start zoomed out enough to see the whole field width
    camera.x = PLAY_W/2; camera.y = H/2;
    clampCamera();
  }

  document.getElementById('bigFieldBtn').addEventListener('click', function(){
    bigFieldW = 1024; bigFieldH = 1366; // iPad Pro 12.9" preset
    setupBigField();
  });

  document.getElementById('startBtn').addEventListener('click', function(){
    blocks = [];
    resetBall(PLAY_W*0.5, H*0.3);
    placeRing();
    ring.curX = ring.x; ring.curY = ring.y;
  });

  document.getElementById('gravityBtn').addEventListener('click', function(){
    blocks = [];
    resetBall(PLAY_W*0.5, H*0.12);
    ring.x = PLAY_W*0.5 + (Math.random()-0.5)*PLAY_W*0.4;
    ring.y = H*0.68 + Math.random()*(H*0.18);
    ring.x = Math.max(60, Math.min(PLAY_W-60, ring.x));
    ring.curX = ring.x; ring.curY = ring.y;
  });

  document.getElementById('billiardBtn').addEventListener('click', function(){
    blocks = [];
    resetBall(PLAY_W*0.5, H*0.78);
    ring.x = PLAY_W*0.5 + (Math.random()-0.5)*PLAY_W*0.3;
    ring.y = H*0.2 + Math.random()*(H*0.12);
    ring.x = Math.max(60, Math.min(PLAY_W-60, ring.x));
    ring.curX = ring.x; ring.curY = ring.y;
  });

  let gridN = 10, gridZ = 16;
  const gridSetupPopupEl = document.getElementById('gridSetupWrap');
  const gridSetupBackdropEl = document.getElementById('gridSetupBackdrop');
  const gridNValueEl = document.getElementById('gridNValue');
  const gridZValueEl = document.getElementById('gridZValue');

  function openGridSetupPopup(){
    gridSetupPopupEl.classList.add('show');
    gridSetupBackdropEl.classList.add('show');
  }
  function closeGridSetupPopup(){
    gridSetupPopupEl.classList.remove('show');
    gridSetupBackdropEl.classList.remove('show');
  }
  document.getElementById('gridModeBtn').addEventListener('click', openGridSetupPopup);
  gridSetupBackdropEl.addEventListener('click', closeGridSetupPopup);
  document.getElementById('gridSetupCloseBtn').addEventListener('click', closeGridSetupPopup);

  const importLevelWrapEl = document.getElementById('importLevelWrap');
  const importLevelBackdropEl = document.getElementById('importLevelBackdrop');
  const importLevelTextarea = document.getElementById('importLevelTextarea');
  const importLevelStatusEl = document.getElementById('importLevelStatus');

  async function openImportLevelPopup(){
    importLevelStatusEl.textContent = '';
    importLevelWrapEl.classList.add('show');
    importLevelBackdropEl.classList.add('show');
    try{
      if(navigator.clipboard && navigator.clipboard.readText){
        const text = await navigator.clipboard.readText();
        if(text && text.trim().startsWith('{')) importLevelTextarea.value = text;
      }
    }catch(e){ /* clipboard read not permitted — user can still paste manually */ }
  }
  function closeImportLevelPopup(){
    importLevelWrapEl.classList.remove('show');
    importLevelBackdropEl.classList.remove('show');
  }
  document.getElementById('importLevelBtn').addEventListener('click', openImportLevelPopup);
  importLevelBackdropEl.addEventListener('click', closeImportLevelPopup);
  document.getElementById('importLevelCloseBtn').addEventListener('click', closeImportLevelPopup);

  document.getElementById('importLevelLoadBtn').addEventListener('click', function(){
    const raw = importLevelTextarea.value.trim();
    if(!raw){
      importLevelStatusEl.textContent = 'Встав текст рівня спочатку';
      return;
    }
    let def;
    try{
      def = JSON.parse(raw);
    }catch(e){
      importLevelStatusEl.textContent = 'Не вдалось розпізнати JSON';
      return;
    }
    if(!def || !Array.isArray(def.blocks)){
      importLevelStatusEl.textContent = 'Це не схоже на збережений рівень';
      return;
    }
    closeImportLevelPopup();
    startGame('blocks');
    loadLevel(def);
  });

  document.getElementById('gridNMinus').addEventListener('click', function(){
    gridN = Math.max(4, gridN-1); gridNValueEl.value = gridN;
  });
  document.getElementById('gridNPlus').addEventListener('click', function(){
    gridN = Math.min(70, gridN+1); gridNValueEl.value = gridN;
  });
  document.getElementById('gridZMinus').addEventListener('click', function(){
    gridZ = Math.max(4, gridZ-1); gridZValueEl.value = gridZ;
  });
  document.getElementById('gridZPlus').addEventListener('click', function(){
    gridZ = Math.min(70, gridZ+1); gridZValueEl.value = gridZ;
  });

  gridNValueEl.addEventListener('change', function(){
    const v = Math.round(parseFloat(gridNValueEl.value));
    gridN = isNaN(v) ? gridN : Math.max(4, Math.min(70, v));
    gridNValueEl.value = gridN;
  });
  gridZValueEl.addEventListener('change', function(){
    const v = Math.round(parseFloat(gridZValueEl.value));
    gridZ = isNaN(v) ? gridZ : Math.max(4, Math.min(70, v));
    gridZValueEl.value = gridZ;
  });

  function setupTiledField(n, z){
    bigFieldW = n * TILE;
    bigFieldH = z * TILE;
    setupBigField();
  }

  document.getElementById('gridStartBtn').addEventListener('click', function(){
    closeGridSetupPopup();
    startGame('blocks');
    setupTiledField(gridN, gridZ);
  });

