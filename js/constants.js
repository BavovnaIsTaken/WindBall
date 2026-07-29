"use strict";

  // ---------- world constants (top-down table view; units: mm, g, s) ----------
  const BALL_R    = 19;
  const BALL_MASS = 2.7;
  const AIR_RHO   = 1.2e-6;
  const CD        = 0.47;
  const AREA      = Math.PI * BALL_R * BALL_R;
  const DRAG_K    = 0.5 * AIR_RHO * CD * AREA * 1.6;
  const RESTITUTION = 0.9;
  const MAGNUS_K  = 0.000085;
  const TABLE_G   = 9800;
  const FRICTION_MU_BASE = 0.05; // this is what "1.0" on the debug friction slider means
  let frictionLevel = 0.05; // 0..1, live-adjustable via the debug panel
  const WALL_MARGIN = 8;
  const EDGE_SWIPE_ZONE = 30; // screen-space px from the right edge that arms the drawer swipe

