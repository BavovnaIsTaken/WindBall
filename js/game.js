"use strict";

  // ---------- main loop ----------
  let lastT = performance.now();
  let acc = 0;
  const FIXED_DT = 1/120;

  function loop(now){
    let frameDt = (now - lastT)/1000;
    lastT = now;
    if(frameDt > 0.05) frameDt = 0.05;
    acc += frameDt;
    let guard = 0;
    while(acc >= FIXED_DT && guard < 8){
      step(FIXED_DT);
      acc -= FIXED_DT;
      guard++;
    }
    render();
    requestAnimationFrame(loop);
  }

  // Прев'ю фігур у drawer'і рендеримо тут, а не в ui-block-editor.js: ця функція
  // залежить від renderBlockShape/drawConfettiPiece (renderer.js), який завантажується
  // пізніше за ui-block-editor.js у порядку <script>-тегів index.html.
  document.querySelectorAll('.tile').forEach(function(btn){
    const canvasEl = btn.querySelector('.tilePreview');
    if(canvasEl) renderTilePreview(canvasEl, btn.dataset.kind);
  });

  createVelourPattern();
  initWorld();
  loadBest();
  requestAnimationFrame(loop);

