// The HUD: lit instruments over the 3D view. A top bar (altitude, speed,
// heading, fuel, rings, score), a compass tape, a centre arrow to the next
// ring, a message banner, and a bottom instrument cluster — artificial
// horizon, airspeed and altimeter dials — drawn on a 2D canvas. Title and
// end screens are DOM overlays so they stay crisp in screenshots.
import { PALETTE, RINGS, RUNWAY } from './config.js';
import { clamp, wrapAngle } from './random.js';
import {
  planeAltitudeFeet,
  planeHeadingDegrees,
  planeSpeedKnots,
  planeVerticalSpeedFpm,
} from './plane.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_LANDED = 3;
export const SCREEN_CRASHED = 4;

export function createHud(doc) {
  const altEl = doc.getElementById('alt');
  const spdEl = doc.getElementById('spd');
  const vsEl = doc.getElementById('vs');
  const hdgEl = doc.getElementById('hdg');
  const fuelFill = doc.getElementById('fuel-fill');
  const fuelText = doc.getElementById('fuel-text');
  const ringsEl = doc.getElementById('rings');
  const timeEl = doc.getElementById('time');
  const scoreEl = doc.getElementById('score');
  const compass = doc.getElementById('compass');
  const compassCtx = compass.getContext('2d');
  const instruments = doc.getElementById('instruments');
  const instCtx = instruments.getContext('2d');
  const arrow = doc.getElementById('ring-arrow');
  const arrowLabel = doc.getElementById('ring-arrow-label');
  const banner = doc.getElementById('banner');
  const titleEl = doc.getElementById('title');
  const endEl = doc.getElementById('end');
  const endTitle = doc.getElementById('end-title');
  const endBody = doc.getElementById('end-body');
  const bestEl = doc.getElementById('best');

  let bannerUntil = 0;

  function showBanner(text, seconds, now) {
    banner.textContent = text;
    banner.style.opacity = '1';
    bannerUntil = now + seconds;
  }

  function drawCompass(headingDeg) {
    const w = compass.width;
    const h = compass.height;
    compassCtx.clearRect(0, 0, w, h);
    compassCtx.fillStyle = PALETTE.hudPanel;
    compassCtx.fillRect(0, 0, w, h);
    compassCtx.strokeStyle = 'rgba(255, 179, 71, 0.35)';
    compassCtx.strokeRect(0.5, 0.5, w - 1, h - 1);
    compassCtx.font = 'bold 13px ' + 'system-ui, sans-serif';
    compassCtx.textAlign = 'center';
    compassCtx.textBaseline = 'middle';
    // Ticks every 15 degrees across a 120-degree window around the heading.
    const pxPerDeg = w / 120;
    for (let d = -60; d <= 60; d += 5) {
      const deg = Math.round((headingDeg + d) / 5) * 5;
      const norm = ((deg % 360) + 360) % 360;
      const x = w / 2 + d * pxPerDeg;
      const major = norm % 30 === 0;
      compassCtx.strokeStyle = major ? PALETTE.hudAmber : 'rgba(238, 241, 245, 0.5)';
      compassCtx.lineWidth = major ? 2 : 1;
      compassCtx.beginPath();
      compassCtx.moveTo(x, major ? 6 : 12);
      compassCtx.lineTo(x, major ? 20 : 16);
      compassCtx.stroke();
      if (major && x > 18 && x < w - 18) {
        const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[norm] ?? String(norm).padStart(3, '0');
        compassCtx.fillStyle = PALETTE.hudAmber;
        compassCtx.fillText(label, x, h - 10);
      }
    }
    // Centre caret.
    compassCtx.fillStyle = PALETTE.hudAmber;
    compassCtx.beginPath();
    compassCtx.moveTo(w / 2 - 7, 0);
    compassCtx.lineTo(w / 2 + 7, 0);
    compassCtx.lineTo(w / 2, 8);
    compassCtx.closePath();
    compassCtx.fill();
  }

  // Artificial horizon, airspeed dial, altimeter dial: one lit cluster.
  function drawInstruments(plane, screen) {
    const w = instruments.width;
    const h = instruments.height;
    const ctx = instCtx;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 179, 71, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Artificial horizon, left.
    const cx = 62;
    const cy = h / 2;
    const r = 46;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-plane.roll);
    const pitchPx = clamp(plane.pitch, -0.5, 0.5) * 90;
    ctx.fillStyle = '#3a6ea5';
    ctx.fillRect(-r - 4, -r - 4 - pitchPx, (r + 4) * 2, r + 4 + pitchPx);
    ctx.fillStyle = '#8a5a33';
    ctx.fillRect(-r - 4, -pitchPx, (r + 4) * 2, r + 4 + pitchPx);
    ctx.strokeStyle = '#eef1f5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, -pitchPx);
    ctx.lineTo(r, -pitchPx);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(238, 241, 245, 0.5)';
    ctx.lineWidth = 1;
    for (const off of [-20, 20]) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -pitchPx + off);
      ctx.lineTo(r * 0.6, -pitchPx + off);
      ctx.stroke();
    }
    ctx.restore();
    // Fixed wings.
    ctx.strokeStyle = PALETTE.hudAmber;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - r - 6, cy);
    ctx.lineTo(cx - 12, cy);
    ctx.moveTo(cx + 12, cy);
    ctx.lineTo(cx + r + 6, cy);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 179, 71, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Dials: airspeed left-centre, altimeter right.
    function dial(x, value, max, unit, color) {
      ctx.save();
      ctx.translate(x, cy);
      ctx.strokeStyle = 'rgba(238, 241, 245, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      const frac = clamp(value / max, 0, 1);
      ctx.beginPath();
      ctx.arc(0, 0, 34, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#eef1f5';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.round(value)), 0, -2);
      ctx.fillStyle = 'rgba(238, 241, 245, 0.6)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(unit, 0, 16);
      ctx.restore();
    }
    dial(152, planeSpeedKnots(plane), 180, 'KT', PALETTE.hudGreen);
    dial(232, planeAltitudeFeet(plane), 3000, 'FT', PALETTE.hudAmber);
    void screen;
  }

  function update(state, now) {
    const plane = state.plane;
    altEl.textContent = `${planeAltitudeFeet(plane)} FT`;
    spdEl.textContent = `${planeSpeedKnots(plane)} KT`;
    const vs = planeVerticalSpeedFpm(plane);
    vsEl.textContent = `${vs >= 0 ? '+' : ''}${vs} FPM`;
    vsEl.style.color = Math.abs(vs) > 1200 ? PALETTE.hudRed : '';
    hdgEl.textContent = `${String(planeHeadingDegrees(plane)).padStart(3, '0')}°`;
    const fuel = Math.max(0, Math.round(plane.fuel));
    fuelFill.style.width = `${fuel}%`;
    fuelFill.style.background = fuel < 20 ? PALETTE.hudRed : fuel < 40 ? PALETTE.hudAmber : PALETTE.hudGreen;
    fuelText.textContent = `FUEL ${fuel}%`;
    ringsEl.textContent = `RINGS ${state.ringsCollected}/8`;
    const mins = Math.floor(state.elapsed / 60);
    const secs = Math.floor(state.elapsed % 60);
    timeEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
    scoreEl.textContent = `SCORE ${state.score}`;
    drawCompass(planeHeadingDegrees(plane));
    drawInstruments(plane);

    // Arrow to the next objective: the next ring, or the runway after ring 8.
    let target;
    let label;
    if (state.ringsCollected < RINGS.length) {
      target = RINGS[state.ringsCollected];
      label = `RING ${state.ringsCollected + 1}`;
    } else {
      target = { x: RUNWAY.cx, y: RUNWAY.y + 4, z: RUNWAY.cz };
      label = 'RUNWAY';
    }
    const dx = target.x - plane.pos.x;
    const dz = target.z - plane.pos.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, -dz);
    const rel = wrapAngle(desired - plane.heading);
    arrow.style.transform = `translate(-50%, -50%) rotate(${rel}rad)`;
    arrowLabel.textContent = `${label} · ${Math.round(dist)} m`;
    arrow.style.opacity = state.screen === SCREEN_PLAY ? '1' : '0';
    arrowLabel.style.opacity = state.screen === SCREEN_PLAY ? '1' : '0';

    if (now > bannerUntil) banner.style.opacity = '0';
  }

  function showTitle(best) {
    titleEl.style.display = 'flex';
    endEl.style.display = 'none';
    bestEl.textContent = best > 0 ? `Best score: ${best}` : 'First flight — make it count.';
  }

  function showEnd(kind, lines) {
    titleEl.style.display = 'none';
    endEl.style.display = 'flex';
    endTitle.textContent = kind === 'landed' ? 'WELCOME HOME' : 'DOWN IN THE DRINK';
    endTitle.style.color = kind === 'landed' ? PALETTE.hudGreen : PALETTE.hudRed;
    endBody.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
  }

  function hideOverlays() {
    titleEl.style.display = 'none';
    endEl.style.display = 'none';
  }

  return { update, showBanner, showTitle, showEnd, hideOverlays };
}
