"use strict";

  // ---------- persistence ----------
  async function loadBest(){
    try{
      const res = await window.storage.get('wind-ball-best');
      if(res && res.value){ best = parseInt(res.value,10) || 0; bestN.textContent = best; }
    }catch(e){}
  }
  async function saveBest(){
    try{ await window.storage.set('wind-ball-best', String(best)); }catch(e){}
  }

  function resetBall(cx, cy){
    ball.x = cx; ball.y = cy;
    ball.vx = (Math.random()-0.5)*120; ball.vy = (Math.random()-0.5)*120; ball.spin = 0;
  }

  function placeRing(){
    const margin = 60;
    ring.x = margin + Math.random()*(PLAY_W - margin*2);
    ring.y = H*0.18 + Math.random()*(H*0.42);
    ring.phase = Math.random()*Math.PI*2;
  }

  function initWorld(){
    resize();
    fan.x = PLAY_W*0.5; fan.y = H*0.74;
    resetBall(PLAY_W*0.5, H*0.3);
    placeRing();
    ring.curX = ring.x; ring.curY = ring.y;
    initConfetti();
  }

