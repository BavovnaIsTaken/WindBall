"use strict";

  // ---------- canvas / sizing ----------
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const scoreN = document.getElementById('scoreN');
  const bestN = document.getElementById('bestN');
  let W = 0, H = 0, DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
  let PLAY_W = 0;
  let viewW = 0, viewH = 0; // actual viewport/canvas pixels — differs from PLAY_W/H only in big-field mode
  let bigFieldMode = false;
  let bigFieldW = 1024, bigFieldH = 1366; // iPad Pro 12.9" (4th gen) logical points by default
  const camera = { x:0, y:0, zoom:1 };

  const TILE = 46;
  let bgTiles = [];
  const TILE_PALETTES = [
    { top:'#1f3f9e', bot:'#122765' }, // blue (default)
    { top:'#1c6b3d', bot:'#0f3a20' }, // green
    { top:'#8a3fae', bot:'#4a1f5c' }, // purple
    { top:'#2f8a94', bot:'#164a52' }, // teal
    { top:'#a3452f', bot:'#5c2417' }  // rust
  ];
  let bgColorCycleTimer = 0;
  let bgCycleCount = 7; // upper bound of the random 1..N tiles changed per cycle
  let bgCycleDelay = 1; // seconds between cycles
  let fanEscapeThreshold = 2200; // mm/s — speed needed to break out of the fan's containment ring
  let maxBallSpeed = 5000; // mm/s — hard velocity cap, debug-adjustable
  let squashThreshold = 2500; // mm/s — impact speed at which the ball fully squashes
  let gravityStrength = 900; // mm/s² — downward acceleration in gravity mode, debug-adjustable
  let gravityEnabled = false; // debug toggle — forces gravity on in ANY mode, not just the dedicated gravity mode

