/* ================================================================
   액체 따르기 시뮬레이터 - 메인 스크립트
   ================================================================ */

// ===== 액체 종류 데이터 =====
// 각 액체의 색상, 거품 여부, 탄산 여부를 정의
const LIQUIDS = {
  water: {
    name: '물',
    topColor:    '#5BBAD5',   // 상단 (어두운 반사)
    bodyColor:   '#87CEEB',   // 본체 색상
    surfaceColor:'#a8dff0',   // 표면
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
    surfaceColor:'#FFE878',   // 맥주 거품 색
    bubbles: true,
    carbonation: true,
    opacity: 0.9,
  },
};

// ===== 상태 변수 =====
const state = {
  currentLiquid: 'water',   // 현재 선택된 액체 종류
  movingFill:    80,        // 움직이는 컵 액체 레벨 (0~100)
  receivingFill: 0,         // 받는 컵 액체 레벨 (0~100)
  cupRotation:   0,         // 움직이는 컵 회전 각도 (도)
  isPouring:     false,     // 현재 액체가 따라지고 있는지
  isDragging:    false,     // 마우스/터치 드래그 중인지
  dragStartX:    0,         // 드래그 시작 X 좌표
  isTouchDevice: false,     // 터치 디바이스 여부
  gyroEnabled:   false,     // 자이로스코프 활성화 여부
  bubbleList:    [],        // 활성 버블 목록
  particleList:  [],        // 따르기 파티클 목록
  wobblePhase:   0,         // 액체 흔들림 위상 (애니메이션용)
};

// ===== 설정 상수 =====
const POUR_THRESHOLD = 42;   // 이 각도 이상이면 따르기 시작
const MAX_ROTATION   = 115;  // 최대 회전 각도
const POUR_RATE_MAX  = 0.35; // 최대 초당 따르기 속도 (%)

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
// 뷰포트 크기에 따라 컵 크기와 위치를 반응형으로 설정
function getCupLayout() {
  const W = mainArea.clientWidth;
  const H = mainArea.clientHeight;
  const mobile  = W < 600;
  const tablet  = W < 900;

  // 받는 컵 (왼쪽 하단)
  const rW = mobile ? 130 : tablet ? 190 : 250;
  const rH = mobile ? 160 : tablet ? 230 : 310;
  const rX = mobile ? 18  : tablet ? 55  : 95;
  const rY = H - rH - (mobile ? 55 : 90);

  // 움직이는 컵 (오른쪽 상단)
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
  // 받는 컵은 고정, 회전 기준 없음
  receivingCup.style.transformOrigin = 'bottom center';

  movingCup.style.left   = m.x + 'px';
  movingCup.style.top    = m.y + 'px';
  movingCup.style.width  = m.w + 'px';
  movingCup.style.height = m.h + 'px';
  // 움직이는 컵: 오른쪽 하단을 기준으로 회전 → 오른쪽 드래그 시 컵이 왼쪽으로 기울어짐
  movingCup.style.transformOrigin = 'right bottom';

  pourCanvas.width  = mainArea.clientWidth;
  pourCanvas.height = mainArea.clientHeight;
}

// ===== SVG로 컵 모양 그리기 =====
// viewBox="0 0 100 130" 좌표계 기준
// 컵 모양: 사다리꼴(위가 살짝 넓은 유리컵 형태)
function drawCupSvg(svgEl, fillPercent, liquidKey, isMoving) {
  const liq = LIQUIDS[liquidKey];
  const wobble = isMoving ? state.wobblePhase : 0;

  // 컵 모양 정의 (사다리꼴: 상단 폭 100%, 하단 폭 86%)
  const cupPoints = '7,0 93,0 100,130 0,130';

  // 액체 채움 영역: fillPercent에 따른 Y 좌표
  // 0% = 바닥(Y=130), 100% = 꼭대기(Y=0)
  const fillTop = 130 - (fillPercent / 100) * 130;
  // 액체 표면 흔들림: 약간의 sine 웨이브
  const surfaceWobble = isMoving ? Math.sin(wobble) * 2 : 0;
  const leftEdge  = 7  + (93 - 7) * (1 - fillPercent / 100) * 0.13;
  const rightEdge = 93 + (100 - 93) * (fillPercent / 100) * 0.1;

  // 탄산 / 맥주 거품 표면 (상단 5%)
  const foamHeight = (liq.carbonation || liquidKey === 'beer') && fillPercent > 5 ? 6 : 0;
  const foamTop = fillTop - foamHeight;

  svgEl.innerHTML = `
    <defs>
      <!-- 컵 클리핑 마스크 -->
      <clipPath id="cupClip${isMoving?'M':'R'}">
        <polygon points="${cupPoints}"/>
      </clipPath>
      <!-- 액체 그라데이션 -->
      <linearGradient id="liqGrad${isMoving?'M':'R'}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="${liq.topColor}"   stop-opacity="${liq.opacity}"/>
        <stop offset="100%" stop-color="${liq.bodyColor}"  stop-opacity="${liq.opacity}"/>
      </linearGradient>
      <!-- 컵 바디 그라데이션 -->
      <linearGradient id="cupGrad${isMoving?'M':'R'}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stop-color="#484848"/>
        <stop offset="40%"  stop-color="#606060"/>
        <stop offset="100%" stop-color="#4a4a4a"/>
      </linearGradient>
      <!-- 반사광 -->
      <linearGradient id="shine${isMoving?'M':'R'}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stop-color="rgba(255,255,255,0.18)"/>
        <stop offset="30%"  stop-color="rgba(255,255,255,0.08)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
      </linearGradient>
    </defs>

    <!-- 컵 바디 배경 -->
    <polygon points="${cupPoints}" fill="url(#cupGrad${isMoving?'M':'R'})"/>

    <!-- 액체 (컵 모양으로 클리핑) -->
    <g clip-path="url(#cupClip${isMoving?'M':'R'})">
      ${fillPercent > 0 ? `
      <!-- 액체 본체 -->
      <rect x="0" y="${fillTop + surfaceWobble}" width="100" height="${130 - fillTop}"
            fill="url(#liqGrad${isMoving?'M':'R'})"/>
      <!-- 액체 표면 하이라이트 -->
      <rect x="${leftEdge}" y="${fillTop + surfaceWobble - 1}"
            width="${rightEdge - leftEdge}" height="3"
            fill="${liq.surfaceColor}" opacity="0.6" rx="1"/>
      ${foamHeight > 0 ? `
      <!-- 거품/탄산 상단 레이어 -->
      <rect x="${leftEdge}" y="${foamTop + surfaceWobble}"
            width="${rightEdge - leftEdge}" height="${foamHeight}"
            fill="rgba(255,255,255,0.35)" rx="2"/>` : ''}
      ` : ''}
    </g>

    <!-- 컵 테두리 반사광 -->
    <polygon points="${cupPoints}" fill="url(#shine${isMoving?'M':'R'})" opacity="0.5"/>

    <!-- 컵 테두리 선 -->
    <polygon points="${cupPoints}" fill="none" stroke="#333" stroke-width="1.5"/>

    <!-- 컵 상단 림 (두꺼운 테두리) -->
    <rect x="0" y="0" width="100" height="5" fill="#444" rx="1"/>
  `;
}

// ===== 회전 적용 =====
function applyRotation() {
  movingCup.style.transform = `rotate(${state.cupRotation}deg)`;
}

// ===== 회전된 컵의 특정 모서리 좌표 계산 =====
// 컵이 회전할 때 실제 화면 좌표를 구함 (따르기 스트림 시작점 계산에 사용)
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
// 회전 각도가 임계값 이상이면 액체가 받는 컵으로 이동
function processPour(dt) {
  if (state.cupRotation >= POUR_THRESHOLD && state.movingFill > 0.1) {
    // 회전 각도에 따라 속도 선형 증가
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

  // 따르기 안내 메시지
  pourMsg.classList.toggle('show', state.isPouring && state.movingFill > 0);
}

// ===== 캔버스: 따르기 스트림 그리기 =====
function drawPourStream() {
  ctx.clearRect(0, 0, pourCanvas.width, pourCanvas.height);
  if (!state.isPouring || state.movingFill <= 0) return;

  const { r, m } = getCupLayout();
  const liq = LIQUIDS[state.currentLiquid];

  // 움직이는 컵 회전 기준점: 오른쪽 하단 모서리
  const pivotX = m.x + m.w;
  const pivotY = m.y + m.h;

  // 컵 상단 왼쪽 모서리를 회전 변환 (왼쪽으로 기울어지므로 왼쪽이 주둥이)
  const spout = getRotatedPoint(pivotX, pivotY, m.x + m.w * 0.1, m.y + 4, state.cupRotation);

  // 받는 컵 상단 중앙 (목표 지점)
  const targetX = r.x + r.w * 0.5;
  const targetY = r.y + 2;

  // ---- 스트림 굵기: 회전 각도와 남은 액체에 비례 ----
  const ratio = (state.cupRotation - POUR_THRESHOLD) / (MAX_ROTATION - POUR_THRESHOLD);
  const streamW = Math.max(3, Math.min(12, ratio * 14 * (state.movingFill / 80)));

  // ---- 베지어 곡선으로 스트림 그리기 ----
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

  // ---- 스트림 가장자리 (하이라이트) ----
  ctx.beginPath();
  ctx.moveTo(spout.x, spout.y);
  ctx.bezierCurveTo(cp1X - 1, cp1Y, cp2X - 1, cp2Y, targetX, targetY);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth   = streamW * 0.3;
  ctx.stroke();
  ctx.restore();

  // ---- 따르기 물방울 파티클 ----
  spawnStreamParticles(spout, targetX, targetY);
  drawParticles();
}

// ===== 파티클 시스템 (따르기 물방울) =====
function spawnStreamParticles(spout, tx, ty) {
  if (Math.random() > 0.4) return; // 매 프레임 일부만 생성
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
    p.x   += p.vx;
    p.y   += p.vy;
    p.vy  += 0.15; // 중력
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

// ===== SVG 버블 (컵 안 기포) =====
// 각 애니메이션 프레임에서 SVG 내부에 circle 추가 후 자동 제거
let bubbleTimer = 0;
function updateBubbles(dt) {
  const liq = LIQUIDS[state.currentLiquid];
  if (!liq.bubbles) return;

  bubbleTimer += dt;
  const interval = liq.carbonation ? 180 : 350;
  if (bubbleTimer < interval) return;
  bubbleTimer = 0;

  // 움직이는 컵 버블
  if (state.movingFill > 3) addSvgBubble(movingSvg, state.movingFill, liq);
  // 받는 컵 버블
  if (state.receivingFill > 3) addSvgBubble(receivingSvg, state.receivingFill, liq);
}

function addSvgBubble(svgEl, fillPct, liq) {
  const ns  = 'http://www.w3.org/2000/svg';
  const c   = document.createElementNS(ns, 'circle');
  const r   = Math.random() * 2.5 + 1;
  const startY = 130 - (fillPct / 100) * 130 + (fillPct / 100) * 130 * 0.7; // 중간~하단
  const x   = 15 + Math.random() * 70;

  c.setAttribute('cx', x);
  c.setAttribute('cy', startY);
  c.setAttribute('r',  r);
  c.setAttribute('fill', 'rgba(255,255,255,0.35)');
  c.style.transition = 'none';
  svgEl.appendChild(c);

  // 버블 올라가는 애니메이션 (CSS animation 대신 JS로)
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

// ===== 컵 흔들림 (액체 출렁임 연출) =====
// 다이어그램 13: 액체가 조금씩 계속 흔들리는 연출
function updateWobble(dt) {
  state.wobblePhase += dt * 0.003; // 천천히 사인파 진행
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

  // 따르기 물리 처리
  processPour(dt);

  // 흔들림 위상 업데이트
  updateWobble(dt);

  // 버블 업데이트
  updateBubbles(dt);

  // SVG 컵 다시 그리기
  drawCupSvg(receivingSvg, state.receivingFill, state.currentLiquid, false);
  drawCupSvg(movingSvg,    state.movingFill,    state.currentLiquid, true);

  // 캔버스: 따르기 스트림
  drawPourStream();

  // 레벨 배지
  updateLevelBadges();

  requestAnimationFrame(loop);
}

/* ================================================================
   이벤트 핸들러
   ================================================================ */

// ===== 데스크탑: 마우스 드래그 =====
// 마우스를 오른쪽으로 드래그하면 컵이 시계방향으로 회전
movingCup.addEventListener('mousedown', e => {
  if (state.isTouchDevice) return;
  state.isDragging  = true;
  state.dragStartX  = e.clientX;
  e.preventDefault();
});

document.addEventListener('mousemove', e => {
  if (!state.isDragging || state.isTouchDevice) return;
  const delta = e.clientX - state.dragStartX;
  // 픽셀 이동 → 각도 변환 (오른쪽 = 양수 = 시계방향)
  state.cupRotation = Math.max(0, Math.min(MAX_ROTATION, delta * 0.55));
  applyRotation();
});

document.addEventListener('mouseup', () => {
  if (!state.isDragging) return;
  state.isDragging = false;
  returnCupToOrigin(); // 드래그 해제 시 원래 위치로 복귀
});

// ===== 컵 원위치 복귀 애니메이션 =====
// 드래그/기울기가 끝나면 스프링처럼 원래 각도(0도)로 돌아옴
function returnCupToOrigin() {
  const startAngle = state.cupRotation;
  const startTime  = performance.now();
  const duration   = 450;

  function spring(ts) {
    const t  = Math.min((ts - startTime) / duration, 1);
    // Ease-out cubic
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
  const delta = e.touches[0].clientX - state.dragStartX;
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
// 다이어그램: 태블릿/모바일은 마우스 드래그가 아닌 기기 기울기로 조작
function setupDeviceOrientation() {
  if (typeof DeviceOrientationEvent === 'undefined') return;

  const handler = e => {
    if (state.isDragging) return; // 터치 드래그 중이면 자이로 무시
    // gamma: 좌우 기울기 (-90 ~ 90도), 오른쪽 기울기 = 양수
    const gamma = e.gamma || 0;
    if (gamma > 5) { // 약간의 데드존
      state.cupRotation = Math.max(0, Math.min(MAX_ROTATION, (gamma - 5) * 1.5));
    } else {
      // 기울기 없으면 원위치 (터치 해제와 유사하게 점진적으로)
      state.cupRotation = Math.max(0, state.cupRotation - 2);
    }
    applyRotation();
    state.gyroEnabled = true;
  };

  // iOS 13+: 권한 요청 필요
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    // 첫 번째 터치 이벤트 시 권한 요청
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

// 드롭다운 항목 선택
dropdown.querySelectorAll('.dropdown-item').forEach(item => {
  item.addEventListener('click', () => {
    state.currentLiquid = item.dataset.liquid;

    // 선택 표시 업데이트
    dropdown.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
    item.classList.add('selected');

    dropdown.classList.add('hidden');
  });
});

// 외부 클릭 시 드롭다운 닫기
document.addEventListener('click', () => dropdown.classList.add('hidden'));

// ===== 초기화 버튼 =====
// 다이어그램 11: 액체를 따르기 전 상태로 되돌아감
resetBtn.addEventListener('click', () => {
  state.movingFill    = 80;
  state.receivingFill = 0;
  state.cupRotation   = 0;
  state.isPouring     = false;
  state.currentLiquid = 'water';
  state.particleList  = [];

  applyRotation();

  // 드롭다운 '물' 선택으로 리셋
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
    guideText.textContent = '기기를 오른쪽으로 기울이거나 컵을 드래그하세요';
    setupDeviceOrientation();
  } else {
    guideText.textContent = '오른쪽 컵을 오른쪽으로 드래그하여 액체를 따르세요';
  }
}

/* ================================================================
   초기화
   ================================================================ */
function init() {
  applyCupLayout();
  detectDevice();

  // 초기 컵 SVG 그리기
  drawCupSvg(receivingSvg, 0,  state.currentLiquid, false);
  drawCupSvg(movingSvg,    80, state.currentLiquid, true);

  // 애니메이션 루프 시작
  lastTs = performance.now();
  requestAnimationFrame(loop);
}

init();