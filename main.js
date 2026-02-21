/* ================================================================
   액체 따르기 시뮬레이터 - 메인 스크립트 (방향 수정본)
   ================================================================ */

// ===== 액체 종류 데이터 =====
const LIQUIDS = {
  water: {
    name: '물',
    topColor:    '#5BBAD5',
    bodyColor:   '#87CEEB',
    surfaceColor:'#a8dff0',
    bubbles: true,
    carbonation: false,
    opacity: 0.85,
  },
  milk: {
    name: '우유',
    topColor:    '#DCDCD4',
    bodyColor:   '#F2F0EB',
    surfaceColor:'#FAFAF8',
    bubbles: false,
    carbonation: false,
    opacity: 1,
  },
  juice: {
    name: '오렌지 주스',
    topColor:    '#E89020',
    bodyColor:   '#FFBA44',
    surfaceColor:'#FFD080',
    bubbles: false,
    carbonation: false,
    opacity: 0.92,
  },
  cola: {
    name: '콜라',
    topColor:    '#090300',
    bodyColor:   '#1C0D03',
    surfaceColor:'#3a1a08',
    bubbles: true,
    carbonation: true,
    opacity: 1,
  },
  beer: {
    name: '맥주',
    topColor:    '#D4960A',
    bodyColor:   '#F5C018',
    surfaceColor:'#FFE878',
    bubbles: true,
    carbonation: true,
    opacity: 0.9,
  },
};

// ===== 상태 변수 =====
const state = {
  currentLiquid: 'water',
  movingFill:    80,
  receivingFill: 0,
  cupRotation:   0, // 내부적으로는 양수로 관리하되, 렌더링 시 음수 적용
  isPouring:     false,
  isDragging:    false,
  dragStartX:    0,
  isTouchDevice: false,
  gyroEnabled:   false,
  bubbleList:    [],
  particleList:  [],
  wobblePhase:   0,
};

// ===== 설정 상수 =====
const POUR_THRESHOLD = 42;
const MAX_ROTATION   = 115;
const POUR_RATE_MAX  = 0.35;

// ===== DOM 참조 =====
const mainArea     = document.getElementById('mainArea');
const receivingCup = document.getElementById('receivingCup');
const movingCup    = document.getElementById('movingCup');
const receivingSvg = document.getElementById('receivingSvg');
const movingSvg    = document.getElementById('movingSvg');
const pourCanvas   = document.getElementById('pourCanvas');
const ctx          = pourCanvas.getContext('2d');
const changeBtn    = document.getElementById('changeBtn');
const resetBtn     = document.getElementById('resetBtn');
const dropdown     = document.getElementById('dropdown');
const guideText    = document.getElementById('guideText');
const pourMsg      = document.getElementById('pourMsg');
const receivingLvl = document.getElementById('receivingLevel');
const movingLvl    = document.getElementById('movingLevel');

// ===== 컵 레이아웃 크기/위치 계산 =====
function getCupLayout() {
  const W = mainArea.clientWidth;
  const H = mainArea.clientHeight;
  const mobile  = W < 600;
  const tablet  = W < 900;

  const rW = mobile ? 130 : tablet ? 190 : 250;
  const rH = mobile ? 160 : tablet ? 230 : 310;
  const rX = mobile ? 18  : tablet ? 55  : 95;
  const rY = H - rH - (mobile ? 55 : 90);

  const mW = mobile ? 110 : tablet ? 165 : 215;
  const mH = mobile ? 135 : tablet ? 200 : 265;
  const mX = W - mW - (mobile ? 18 : tablet ? 55 : 120);
  const mY = mobile ? H * 0.22 : tablet ? H * 0.12 : H * 0.08;

  return { r: { x:rX, y:rY, w:rW, h:rH }, m: { x:mX, y:mY, w:mW, h:mH } };
}

// ===== 컵 레이아웃 DOM에 적용 =====
function applyCupLayout() {
  const { r, m } = getCupLayout();

  receivingCup.style.left   = r.x + 'px';
  receivingCup.style.top    = r.y + 'px';
  receivingCup.style.width  = r.w + 'px';
  receivingCup.style.height = r.h + 'px';
  receivingCup.style.transformOrigin = 'bottom center';

  movingCup.style.left   = m.x + 'px';
  movingCup.style.top    = m.y + 'px';
  movingCup.style.width  = m.w + 'px';
  movingCup.style.height = m.h + 'px';
  // 💡 수정: 왼쪽으로 자연스럽게 기울이기 위해 회전축을 왼쪽 하단으로 변경
  movingCup.style.transformOrigin = 'left bottom';

  pourCanvas.width  = mainArea.clientWidth;
  pourCanvas.height = mainArea.clientHeight;
}

// ===== SVG로 컵 모양 그리기 =====
function drawCupSvg(svgEl, fillPercent, liquidKey, isMoving) {
  const liq = LIQUIDS[liquidKey];
  const wobble = isMoving ? state.wobblePhase : 0;
  const cupPoints = '7,0 93,0 100,130 0,130';
  const fillTop = 130 - (fillPercent / 100) * 130;
  const surfaceWobble = isMoving ? Math.sin(wobble) * 2 : 0;
  const leftEdge  = 7  + (93 - 7) * (1 - fillPercent / 100) * 0.13;
  const rightEdge = 93 + (100 - 93) * (fillPercent / 100) * 0.1;

  const foamHeight = (liq.carbonation || liquidKey === 'beer') && fillPercent > 5 ? 6 : 0;
  const foamTop = fillTop - foamHeight;

  svgEl.innerHTML = `
    <defs>
      <clipPath id="cupClip${isMoving?'M':'R'}">
        <polygon points="${cupPoints}"/>
      </clipPath>
      <linearGradient id="liqGrad${isMoving?'M':'R'}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="${liq.topColor}"   stop-opacity="${liq.opacity}"/>
        <stop offset="100%" stop-color="${liq.bodyColor}"  stop-opacity="${liq.opacity}"/>
      </linearGradient>
      <linearGradient id="cupGrad${isMoving?'M':'R'}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stop-color="#484848"/>
        <stop offset="40%"  stop-color="#606060"/>
        <stop offset="100%" stop-color="#4a4a4a"/>
      </linearGradient>
      <linearGradient id="shine${isMoving?'M':'R'}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stop-color="rgba(255,255,255,0.18)"/>
        <stop offset="30%"  stop-color="rgba(255,255,255,0.08)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
      </linearGradient>
    </defs>
    <polygon points="${cupPoints}" fill="url(#cupGrad${isMoving?'M':'R'})"/>
    <g clip-path="url(#cupClip${isMoving?'M':'R'})">
      ${fillPercent > 0 ? `
      <rect x="0" y="${fillTop + surfaceWobble}" width="100" height="${130 - fillTop}"
            fill="url(#liqGrad${isMoving?'M':'R'})"/>
      <rect x="${leftEdge}" y="${fillTop + surfaceWobble - 1}"
            width="${rightEdge - leftEdge}" height="3"
            fill="${liq.surfaceColor}" opacity="0.6" rx="1"/>
      ${foamHeight > 0 ? `
      <rect x="${leftEdge}" y="${foamTop + surfaceWobble}"
            width="${rightEdge - leftEdge}" height="${foamHeight}"
            fill="rgba(255,255,255,0.35)" rx="2"/>` : ''}
      ` : ''}
    </g>
    <polygon points="${cupPoints}" fill="url(#shine${isMoving?'M':'R'})" opacity="0.5"/>
    <polygon points="${cupPoints}" fill="none" stroke="#333" stroke-width="1.5"/>
    <rect x="0" y="0" width="100" height="5" fill="#444" rx="1"/>
  `;
}

// ===== 회전 적용 =====
function applyRotation() {
  // 💡 수정: 왼쪽(반시계 방향)으로 회전하도록 마이너스(-) 부호 추가
  movingCup.style.transform = `rotate(-${state.cupRotation}deg)`;
}

// ===== 회전된 컵의 특정 모서리 좌표 계산 =====
function getRotatedPoint(cx, cy, px, py, angleDeg) {
  const a = angleDeg * Math.PI / 180;
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: cx + dx * Math.cos(a) - dy * Math.sin(a),
    y: cy + dx * Math.sin(a) + dy * Math.cos(a),
  };
}

// ===== 따르기 처리 =====
function processPour(dt) {
  if (state.cupRotation >= POUR_THRESHOLD && state.movingFill > 0.1) {
    const ratio = (state.cupRotation - POUR_THRESHOLD) / (MAX_ROTATION - POUR_THRESHOLD);
    const amount = Math.min(POUR_RATE_MAX * ratio * (dt / 16), state.movingFill);

    if (amount > 0.005) {
      state.movingFill    = Math.max(0, state.movingFill - amount);
      state.receivingFill = Math.min(100, state.receivingFill + amount * 0.97);
      state.isPouring = true;
    } else {
      state.isPouring = false;
    }
  } else {
    state.isPouring = false;
  }
  pourMsg.classList.toggle('show', state.isPouring && state.movingFill > 0);
}

// ===== 캔버스: 따르기 스트림 그리기 =====
function drawPourStream() {
  ctx.clearRect(0, 0, pourCanvas.width, pourCanvas.height);
  if (!state.isPouring || state.movingFill <= 0) return;

  const { r, m } = getCupLayout();
  const liq = LIQUIDS[state.currentLiquid];

  // 💡 수정: 회전축이 왼쪽 하단이므로 pivotX 값을 m.x로 변경
  const pivotX = m.x;
  const pivotY = m.y + m.h;

  // 💡 수정: 실제로 왼쪽으로 회전하고 있으므로 계산식에도 -state.cupRotation 대입
  const spout = getRotatedPoint(pivotX, pivotY, m.x + m.w * 0.1, m.y + 4, -state.cupRotation);

  const targetX = r.x + r.w * 0.5;
  const targetY = r.y + 2;

  const ratio = (state.cupRotation - POUR_THRESHOLD) / (MAX_ROTATION - POUR_THRESHOLD);
  const streamW = Math.max(3, Math.min(12, ratio * 14 * (state.movingFill / 80)));

  const cp1X = spout.x + (targetX - spout.x) * 0.15;
  const cp1Y = spout.y + Math.abs(targetY - spout.y) * 0.3;
  const cp2X = targetX;
  const cp2Y = targetY - Math.abs(targetY - spout.y) * 0.2;

  const streamGrad = ctx.createLinearGradient(spout.x, spout.y, targetX, targetY);
  streamGrad.addColorStop(0,   liq.bodyColor + 'EE');
  streamGrad.addColorStop(0.5, liq.bodyColor + 'BB');
  streamGrad.addColorStop(1,   liq.bodyColor + '66');

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(spout.x, spout.y);
  ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, targetX, targetY);
  ctx.strokeStyle = streamGrad;
  ctx.lineWidth   = streamW;
  ctx.lineCap     = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(spout.x, spout.y);
  ctx.bezierCurveTo(cp1X - 1, cp1Y, cp2X - 1, cp2Y, targetX, targetY);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth   = streamW * 0.3;
  ctx.stroke();
  ctx.restore();

  spawnStreamParticles(spout, targetX, targetY);
  drawParticles();
}

// ===== 파티클 시스템 =====
function spawnStreamParticles(spout, tx, ty) {
  if (Math.random() > 0.4) return;
  const liq = LIQUIDS[state.currentLiquid];
  state.particleList.push({
    x: spout.x + (Math.random() - 0.5) * 4,
    y: spout.y,
    vx: (tx - spout.x) * 0.01 + (Math.random() - 0.5) * 0.5,
    vy: Math.random() * 1.5 + 0.5,
    life: 1,
    decay: Math.random() * 0.04 + 0.02,
    r: Math.random() * 3 + 1.5,
    color: liq.bodyColor,
  });
}

function drawParticles() {
  state.particleList = state.particleList.filter(p => {
    p.x  += p.vx;
    p.y  += p.vy;
    p.vy += 0.15;
    p.life -= p.decay;
    if (p.life <= 0) return false;

    ctx.save();
    ctx.globalAlpha = p.life * 0.7;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.restore();
    return true;
  });
}

// ===== SVG 버블 =====
let bubbleTimer = 0;
function updateBubbles(dt) {
  const liq = LIQUIDS[state.currentLiquid];
  if (!liq.bubbles) return;

  bubbleTimer += dt;
  const interval = liq.carbonation ? 180 : 350;
  if (bubbleTimer < interval) return;
  bubbleTimer = 0;

  if (state.movingFill > 3) addSvgBubble(movingSvg, state.movingFill, liq);
  if (state.receivingFill > 3) addSvgBubble(receivingSvg, state.receivingFill, liq);
}

function addSvgBubble(svgEl, fillPct, liq) {
  const ns  = 'http://www.w3.org/2000/svg';
  const c   = document.createElementNS(ns, 'circle');
  const r   = Math.random() * 2.5 + 1;
  const startY = 130 - (fillPct / 100) * 130 + (fillPct / 100) * 130 * 0.7;
  const x   = 15 + Math.random() * 70;

  c.setAttribute('cx', x);
  c.setAttribute('cy', startY);
  c.setAttribute('r',  r);
  c.setAttribute('fill', 'rgba(255,255,255,0.35)');
  c.style.transition = 'none';
  svgEl.appendChild(c);

  const targetY   = 130 - (fillPct / 100) * 130 + 2;
  const duration  = Math.random() * 800 + 600;
  const startTime = performance.now();

  function animBubble(ts) {
    const t = Math.min((ts - startTime) / duration, 1);
    c.setAttribute('cy', startY - (startY - targetY) * t);
    c.setAttribute('opacity', 1 - t * 0.8);
    if (t < 1) requestAnimationFrame(animBubble);
    else c.remove();
  }
  requestAnimationFrame(animBubble);
}

// ===== 컵 흔들림 =====
function updateWobble(dt) {
  state.wobblePhase += dt * 0.003;
}

// ===== 레벨 배지 업데이트 =====
function updateLevelBadges() {
  movingLvl.textContent    = Math.round(state.movingFill)    + '%';
  receivingLvl.textContent = Math.round(state.receivingFill) + '%';
}

// ===== 메인 애니메이션 루프 =====
let lastTs = 0;
function loop(ts) {
  const dt = ts - lastTs;
  lastTs = ts;

  processPour(dt);
  updateWobble(dt);
  updateBubbles(dt);

  drawCupSvg(receivingSvg, state.receivingFill, state.currentLiquid, false);
  drawCupSvg(movingSvg,    state.movingFill,    state.currentLiquid, true);
  drawPourStream();
  updateLevelBadges();

  requestAnimationFrame(loop);
}

/* ================================================================
   이벤트 핸들러
   ================================================================ */

// ===== 데스크탑: 마우스 드래그 =====
movingCup.addEventListener('mousedown', e => {
  if (state.isTouchDevice) return;
  state.isDragging  = true;
  state.dragStartX  = e.clientX;
  e.preventDefault();
});

document.addEventListener('mousemove', e => {
  if (!state.isDragging || state.isTouchDevice) return;
  // 💡 수정: 왼쪽으로 드래그할 때 값이 증가하도록 시작X - 현재X 로 변경
  const delta = state.dragStartX - e.clientX; 
  state.cupRotation = Math.max(0, Math.min(MAX_ROTATION, delta * 0.55));
  applyRotation();
});

document.addEventListener('mouseup', () => {
  if (!state.isDragging) return;
  state.isDragging = false;
  returnCupToOrigin();
});

// ===== 컵 원위치 복귀 애니메이션 =====
function returnCupToOrigin() {
  const startAngle = state.cupRotation;
  const startTime  = performance.now();
  const duration   = 450;

  function spring(ts) {
    const t  = Math.min((ts - startTime) / duration, 1);
    const e  = 1 - Math.pow(1 - t, 3);
    state.cupRotation = startAngle * (1 - e);
    applyRotation();
    if (t < 1) requestAnimationFrame(spring);
    else { state.cupRotation = 0; applyRotation(); }
  }
  requestAnimationFrame(spring);
}

// ===== 모바일/태블릿: 터치 드래그 =====
movingCup.addEventListener('touchstart', e => {
  state.isDragging = true;
  state.dragStartX = e.touches[0].clientX;
  e.preventDefault();
}, { passive: false });

document.addEventListener('touchmove', e => {
  if (!state.isDragging) return;
  // 💡 수정: 터치도 마우스와 동일하게 왼쪽으로 밀 때 값이 증가하게 설정
  const delta = state.dragStartX - e.touches[0].clientX;
  state.cupRotation = Math.max(0, Math.min(MAX_ROTATION, delta * 0.55));
  applyRotation();
  e.preventDefault();
}, { passive: false });

document.addEventListener('touchend', () => {
  if (!state.isDragging) return;
  state.isDragging = false;
  returnCupToOrigin();
});

// ===== 기기 기울기 (태블릿/모바일 자이로스코프) =====
function setupDeviceOrientation() {
  if (typeof DeviceOrientationEvent === 'undefined') return;

  const handler = e => {
    if (state.isDragging) return;
    const gamma = e.gamma || 0;
    // 💡 수정: 왼쪽 기울기는 음수. 왼쪽으로 5도 이상 기울였을 때 동작하도록 변경
    if (gamma < -5) { 
      state.cupRotation = Math.max(0, Math.min(MAX_ROTATION, (-gamma - 5) * 1.5));
    } else {
      state.cupRotation = Math.max(0, state.cupRotation - 2);
    }
    applyRotation();
    state.gyroEnabled = true;
  };

  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    document.addEventListener('touchstart', function reqPerm() {
      DeviceOrientationEvent.requestPermission()
        .then(res => {
          if (res === 'granted') window.addEventListener('deviceorientation', handler);
        }).catch(() => {});
      document.removeEventListener('touchstart', reqPerm);
    }, { once: true });
  } else {
    window.addEventListener('deviceorientation', handler);
  }
}

// ===== 액체 변경 버튼 =====
changeBtn.addEventListener('click', e => {
  e.stopPropagation();
  dropdown.classList.toggle('hidden');
});

dropdown.querySelectorAll('.dropdown-item').forEach(item => {
  item.addEventListener('click', () => {
    state.currentLiquid = item.dataset.liquid;
    dropdown.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
    item.classList.add('selected');
    dropdown.classList.add('hidden');
  });
});

document.addEventListener('click', () => dropdown.classList.add('hidden'));

// ===== 초기화 버튼 =====
resetBtn.addEventListener('click', () => {
  state.movingFill    = 80;
  state.receivingFill = 0;
  state.cupRotation   = 0;
  state.isPouring     = false;
  state.currentLiquid = 'water';
  state.particleList  = [];

  applyRotation();

  dropdown.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
  dropdown.querySelector('[data-liquid="water"]').classList.add('selected');

  pourMsg.classList.remove('show');
});

// ===== 창 크기 변경 시 레이아웃 재계산 =====
window.addEventListener('resize', () => {
  applyCupLayout();
  pourCanvas.width  = mainArea.clientWidth;
  pourCanvas.height = mainArea.clientHeight;
});

// ===== 디바이스 타입 감지 =====
function detectDevice() {
  state.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  if (state.isTouchDevice) {
    // 💡 안내 문구도 기획에 맞게 '왼쪽'으로 수정
    guideText.textContent = '기기를 왼쪽으로 기울이거나 컵을 왼쪽으로 드래그하세요';
    setupDeviceOrientation();
  } else {
    guideText.textContent = '오른쪽 컵을 왼쪽으로 드래그하여 액체를 따르세요';
  }
}

/* ================================================================
   초기화
   ================================================================ */
function init() {
  applyCupLayout();
  detectDevice();

  drawCupSvg(receivingSvg, 0,  state.currentLiquid, false);
  drawCupSvg(movingSvg,    80, state.currentLiquid, true);

  lastTs = performance.now();
  requestAnimationFrame(loop);
}

init();