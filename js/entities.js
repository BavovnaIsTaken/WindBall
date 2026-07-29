"use strict";

  // ---------- entities ----------
  const ball = { x:0, y:0, vx:0, vy:0, spin:0, rot:0, sx:1, sy:1, wallStickT:0,
                 pipedBy:null, pipeApproaching:false, pipeT:0, pipeCooldownBlock:null, pipeCooldownT:0,
                 restX:0, restY:0 };

  const fan = {
    x:0, y:0, vx:0, vy:0, power:0.3, basePower:0.3, bodyR: 34, bladeSpin:0
  };
  let fanEnabled = false;
  let fanPrevX = null, fanPrevY = null;

  let ring = { x:0, y:0, r:34, phase:Math.random()*10, dragging:false, curX:0, curY:0 };

  const BLOCK_KINDS = {
    square:  { shape:'rect',   w:64,  h:64  },
    pillar:  { shape:'rect',   w:44,  h:154, capsule:true, lengthAxis:'h' },
    circle:  { shape:'circle', r:40 },
    halfcircle: { shape:'wave', r:60, thick:44, bumps:1 },
    quarter: { shape:'circle', r:52, visual:'quarter' },
    wave2: { shape:'wave', bumps:2, r:34, thick:34 },
    wave3: { shape:'wave', bumps:3, r:30, thick:32 },
    wave4: { shape:'wave', bumps:4, r:26, thick:30 },
    spinner3: { shape:'spinner', blades:3, bladeLen:76, bladeW:16, rotSpeed:Math.PI*0.55, capsule:true },
    spinner4: { shape:'spinner', blades:4, bladeLen:62, bladeW:14, rotSpeed:-Math.PI*0.75, capsule:true },
    slider:   { shape:'rect', w:120, h:26, capsule:true, oscillate:true, oscAmp:95, oscSpeed:1.5, lengthAxis:'w' },
    trampoline: { shape:'rect', w:100, h:26, capsule:true, bouncy:true, bounciness:1.8, lengthAxis:'w' },
    fanSector: { shape:'fan', r:32, sectorAngle: Math.PI/2, fanPower:0.55 },
    fanOmni:   { shape:'fan', r:30, sectorAngle: Math.PI*2, fanPower:0.4 },
    pipeStraight: { shape:'pipe', pipeType:'straight', length:150, pipeW:40, suction:0.004, ejection:0.1, suctionRange:1.75 },
    pipeElbow:    { shape:'pipe', pipeType:'elbow', armLen:95, pipeW:40, suction:0.004, ejection:0.1, suctionRange:1.75 }
  };
  const SIZE_STEPS = [0.55, 0.7, 0.85, 1.0, 1.2, 1.4, 1.65, 2.0]; // discrete pinch-resize grid
  const THICK_STEPS = [SIZE_STEPS[0]/2].concat(SIZE_STEPS); // same grid, plus one thinner step for wave line thickness

  const BLOCK_PALETTES = [
    { light:'#9fdcff', mid:'#2f66d6', dark:'#173a8c' }, // blue (default)
    { light:'#9dffd6', mid:'#1fae7a', dark:'#0d5c40' }, // green
    { light:'#ffcfa8', mid:'#ff7a45', dark:'#a8431a' }, // orange
    { light:'#e3b8ff', mid:'#a855f7', dark:'#5b1f8a' }, // purple
    { light:'#ffb8d4', mid:'#ff5c93', dark:'#a3245c' }, // pink
    { light:'#9df3ff', mid:'#2dd4c4', dark:'#0f7a6e' }  // teal
  ];
  function hexToRgb(hex){
    const v = parseInt(hex.slice(1),16);
    return { r:(v>>16)&255, g:(v>>8)&255, b:v&255 };
  }
  function rgbCss(c){ return 'rgb(' + (c.r|0) + ',' + (c.g|0) + ',' + (c.b|0) + ')'; }
  function snapToSizeGrid(mul){
    let best = SIZE_STEPS[0], bd = Infinity;
    for(const s of SIZE_STEPS){ const d = Math.abs(s-mul); if(d < bd){ bd = d; best = s; } }
    return best;
  }
  function snapToThickGrid(mul){
    let best = THICK_STEPS[0], bd = Infinity;
    for(const s of THICK_STEPS){ const d = Math.abs(s-mul); if(d < bd){ bd = d; best = s; } }
    return best;
  }

  // "complex" blocks (curves, spinners, sliders) get a long-press settings popup;
  // simple primitives (square, pillar, circle, quarter) don't need one
  function isComplexShape(b){
    return b.shape === 'wave' || b.shape === 'spinner' || !!b.oscillate;
  }

  let popupBlock = null;
  const blockPopupEl = document.getElementById('blockPopupWrap');
  const blockPopupTitleEl = document.getElementById('blockPopupTitle');
  const blockPopupBackdropEl = document.getElementById('blockPopupBackdrop');
  const popupThicknessRow = document.getElementById('popupThicknessRow');
  const popupThicknessSlider = document.getElementById('popupThicknessSlider');
  const popupRotDirRow = document.getElementById('popupRotDirRow');
  const popupRotSpeedRow = document.getElementById('popupRotSpeedRow');
  const popupRotDirBtn = document.getElementById('popupRotDirBtn');
  const popupRotSpeedSlider = document.getElementById('popupRotSpeedSlider');
  const popupFanPowerRow = document.getElementById('popupFanPowerRow');
  const popupFanPowerSlider = document.getElementById('popupFanPowerSlider');
  const popupBouncinessRow = document.getElementById('popupBouncinessRow');
  const popupBouncinessSlider = document.getElementById('popupBouncinessSlider');
  const popupSuctionRow = document.getElementById('popupSuctionRow');
  const popupSuctionSlider = document.getElementById('popupSuctionSlider');
  const popupEjectionRow = document.getElementById('popupEjectionRow');
  const popupEjectionSlider = document.getElementById('popupEjectionSlider');
  const popupSuctionRangeRow = document.getElementById('popupSuctionRangeRow');
  const popupSuctionRangeSlider = document.getElementById('popupSuctionRangeSlider');
  const popupRangeHighlightRow = document.getElementById('popupRangeHighlightRow');
  const popupRangeHighlightToggle = document.getElementById('popupRangeHighlightToggle');
  const popupPipeFlipRow = document.getElementById('popupPipeFlipRow');
  const popupPipeFlipToggle = document.getElementById('popupPipeFlipToggle');
  const popupDeleteBtn = document.getElementById('popupDeleteBtn');

  function closestSizeStepIndex(mul){
    let bestI = 0, bd = Infinity;
    for(let i=0;i<SIZE_STEPS.length;i++){
      const d = Math.abs(SIZE_STEPS[i]-mul);
      if(d < bd){ bd = d; bestI = i; }
    }
    return bestI;
  }
  function closestThickStepIndex(mul){
    let bestI = 0, bd = Infinity;
    for(let i=0;i<THICK_STEPS.length;i++){
      const d = Math.abs(THICK_STEPS[i]-mul);
      if(d < bd){ bd = d; bestI = i; }
    }
    return bestI;
  }

  function openBlockSettingsPopup(b){
    popupBlock = b;
    const isMainFan = (b === fan);
    blockPopupTitleEl.textContent = isMainFan ? 'НАЛАШТУВАННЯ ВЕНТИЛЯТОРА' : 'НАЛАШТУВАННЯ БЛОКА';
    popupDeleteBtn.textContent = isMainFan ? 'Видалити вентилятор' : 'Видалити блок';
    const hasThick = (b.shape === 'wave' || b.shape === 'pipe' || b.shape === 'spinner' || !!b.lengthAxis);
    popupThicknessRow.style.display = hasThick ? 'flex' : 'none';
    if(hasThick){
      popupThicknessSlider.value = closestThickStepIndex(b.targetMulThick);
    }
    const hasRot = !!b.autoRotate;
    popupRotDirRow.style.display = hasRot ? 'flex' : 'none';
    popupRotSpeedRow.style.display = hasRot ? 'flex' : 'none';
    if(hasRot){
      const cw = b.rotSpeed >= 0;
      popupRotDirBtn.textContent = cw ? '⟳ За год.' : '⟲ Проти год.';
      popupRotSpeedSlider.value = Math.min(8, Math.max(0.5, Math.abs(b.rotSpeed)));
    }
    const hasFanPower = (b.shape === 'fan') || (b === fan);
    popupFanPowerRow.style.display = hasFanPower ? 'flex' : 'none';
    if(hasFanPower){
      const p = (b === fan) ? b.basePower : b.fanPower;
      popupFanPowerSlider.value = Math.min(1.5, Math.max(0.1, p));
    }
    const hasBounciness = !!b.bouncy;
    popupBouncinessRow.style.display = hasBounciness ? 'flex' : 'none';
    if(hasBounciness){
      popupBouncinessSlider.value = Math.min(3.5, Math.max(1.0, b.bounciness));
    }
    const isPipe = (b.shape === 'pipe');
    popupSuctionRow.style.display = isPipe ? 'flex' : 'none';
    popupEjectionRow.style.display = isPipe ? 'flex' : 'none';
    popupSuctionRangeRow.style.display = isPipe ? 'flex' : 'none';
    popupRangeHighlightRow.style.display = isPipe ? 'flex' : 'none';
    popupPipeFlipRow.style.display = isPipe ? 'flex' : 'none';
    if(isPipe){
      popupSuctionSlider.value = Math.min(0.02, Math.max(0.0024, b.suction));
      popupEjectionSlider.value = Math.min(0.5, Math.max(0.06, b.ejection));
      popupSuctionRangeSlider.value = Math.min(3.0, Math.max(0.5, b.suctionRange));
      popupRangeHighlightToggle.checked = !!b.showRangeHighlight;
      popupPipeFlipToggle.checked = !!b.flipped;
    }
    blockPopupEl.classList.add('show');
    blockPopupBackdropEl.classList.add('show');
  }
  function closeBlockSettingsPopup(){
    popupBlock = null;
    blockPopupEl.classList.remove('show');
    blockPopupBackdropEl.classList.remove('show');
  }
  blockPopupBackdropEl.addEventListener('click', closeBlockSettingsPopup);
  document.getElementById('blockPopupCloseBtn').addEventListener('click', closeBlockSettingsPopup);

  // lets a range input be dragged from anywhere along its track, not just the thumb —
  // computed directly from touch/pointer position, independent of native browser behavior
  function makeSliderFullyDraggable(slider){
    let dragging = false;
    function setFromClientX(clientX){
      const rect = slider.getBoundingClientRect();
      let t = (clientX - rect.left) / rect.width;
      t = Math.max(0, Math.min(1, t));
      const min = parseFloat(slider.min), max = parseFloat(slider.max);
      const step = parseFloat(slider.step) || 1;
      let val = min + t*(max-min);
      val = Math.round(val/step)*step;
      val = Math.max(min, Math.min(max, val));
      if(parseFloat(slider.value) !== val){
        slider.value = val;
        slider.dispatchEvent(new Event('input', {bubbles:true}));
      }
    }
    slider.addEventListener('pointerdown', function(e){
      dragging = true;
      if(slider.setPointerCapture){ try{ slider.setPointerCapture(e.pointerId); }catch(err){} }
      e.stopPropagation();
      setFromClientX(e.clientX);
    });
    slider.addEventListener('pointermove', function(e){
      if(!dragging) return;
      e.stopPropagation();
      setFromClientX(e.clientX);
    });
    slider.addEventListener('pointerup', function(){ dragging = false; });
    window.addEventListener('pointerup', function(){ dragging = false; });
    window.addEventListener('pointercancel', function(){ dragging = false; });
  }

  makeSliderFullyDraggable(popupThicknessSlider);
  popupThicknessSlider.addEventListener('input', function(){
    if(!popupBlock) return;
    const idx = parseInt(popupThicknessSlider.value, 10);
    popupBlock.targetMulThick = THICK_STEPS[idx];
  });

  popupRotDirBtn.addEventListener('click', function(){
    if(!popupBlock) return;
    popupBlock.rotSpeed = -popupBlock.rotSpeed;
    const cw = popupBlock.rotSpeed >= 0;
    popupRotDirBtn.textContent = cw ? '⟳ За год.' : '⟲ Проти год.';
  });

  makeSliderFullyDraggable(popupRotSpeedSlider);
  popupRotSpeedSlider.addEventListener('input', function(){
    if(!popupBlock) return;
    const mag = parseFloat(popupRotSpeedSlider.value);
    const sign = popupBlock.rotSpeed < 0 ? -1 : 1;
    popupBlock.rotSpeed = mag*sign;
  });

  makeSliderFullyDraggable(popupFanPowerSlider);
  popupFanPowerSlider.addEventListener('input', function(){
    if(!popupBlock) return;
    const v = parseFloat(popupFanPowerSlider.value);
    if(popupBlock === fan) fan.basePower = v;
    else popupBlock.fanPower = v;
  });

  makeSliderFullyDraggable(popupBouncinessSlider);
  popupBouncinessSlider.addEventListener('input', function(){
    if(!popupBlock) return;
    popupBlock.bounciness = parseFloat(popupBouncinessSlider.value);
  });

  makeSliderFullyDraggable(popupSuctionSlider);
  popupSuctionSlider.addEventListener('input', function(){
    if(!popupBlock) return;
    popupBlock.suction = parseFloat(popupSuctionSlider.value);
  });

  makeSliderFullyDraggable(popupEjectionSlider);
  popupEjectionSlider.addEventListener('input', function(){
    if(!popupBlock) return;
    popupBlock.ejection = parseFloat(popupEjectionSlider.value);
  });

  makeSliderFullyDraggable(popupSuctionRangeSlider);
  popupSuctionRangeSlider.addEventListener('input', function(){
    if(!popupBlock) return;
    popupBlock.suctionRange = parseFloat(popupSuctionRangeSlider.value);
  });

  popupRangeHighlightToggle.addEventListener('change', function(){
    if(!popupBlock) return;
    popupBlock.showRangeHighlight = popupRangeHighlightToggle.checked;
  });

  popupPipeFlipToggle.addEventListener('change', function(){
    if(!popupBlock) return;
    popupBlock.flipped = popupPipeFlipToggle.checked;
  });

  popupDeleteBtn.addEventListener('click', function(){
    if(!popupBlock) return;
    if(popupBlock === fan){
      fanEnabled = false;
      if(moveId!==null){ moveId = null; }
    } else {
      const idx = blocks.indexOf(popupBlock);
      if(idx !== -1) blocks.splice(idx,1);
      if(selectedBlock === popupBlock) selectedBlock = null;
      if(draggedBlock === popupBlock) draggedBlock = null;
    }
    closeBlockSettingsPopup();
  });

  let blocks = [];
  let blockIdSeq = 1;

  const CONFETTI_COLORS = ['#ff6b9d','#ffd23f','#4CD3FF','#37d17a','#a855f7','#ff9f45'];
  let confettiPieces = [];
  function initConfetti(){
    confettiPieces = [];
    const n = 10;
    for(let i=0;i<n;i++){
      const angle = (i/n)*Math.PI*2 + (Math.random()-0.5)*0.15;
      confettiPieces.push({
        anchorAngle: angle,
        len: 14 + Math.random()*10,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        swayPhase: Math.random()*Math.PI*2,
        swaySpeed: 2.5 + Math.random()*2,
        curAngle: angle, curAngleVel: 0,
        flutterT: Math.random()*10
      });
    }
  }
  function makeBlockConfetti(sectorAngle){
    const isOmni = (sectorAngle >= Math.PI*2 - 0.01);
    const n = isOmni ? 8 : 5;
    const pieces = [];
    for(let i=0;i<n;i++){
      let localAngle;
      if(isOmni){
        localAngle = (i/n)*Math.PI*2 + (Math.random()-0.5)*0.15;
      } else {
        const t = n===1 ? 0.5 : i/(n-1);
        localAngle = -sectorAngle/2 + sectorAngle*t;
      }
      pieces.push({
        anchorAngle: localAngle, // relative to the block's own rot — rotates with it
        len: 10 + Math.random()*7,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        swayPhase: Math.random()*Math.PI*2,
        swaySpeed: 2.5 + Math.random()*2,
        curAngle: localAngle, curAngleVel: 0,
        flutterT: Math.random()*10
      });
    }
    return pieces;
  }
  let burstParticles = [];

  let score = 0;
  let best = 0;
  let comboCount = 0;
  let lastScoreTime = 0;
  const comboEl = document.getElementById('comboText');
  function showCombo(n){
    comboEl.textContent = 'Комбо! x' + n;
    comboEl.classList.add('show');
    comboEl.classList.remove('pop');
    void comboEl.offsetWidth; // restart the CSS animation on repeat triggers
    comboEl.classList.add('pop');
  }
  function hideCombo(){
    comboEl.classList.remove('show');
  }

  let screen = 'start';  // 'start' | 'play'
  let mode = 'fan';       // 'ball' | 'fan' | 'blocks'

