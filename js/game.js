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

  createVelourPattern();
  initWorld();
  loadBest();
  requestAnimationFrame(loop);

