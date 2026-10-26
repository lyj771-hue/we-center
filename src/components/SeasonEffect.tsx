'use client';

import { useEffect, useState } from 'react';
import { useAdmin } from './AdminContext';
import Portal from './Portal';

// 홈 화면 계절 효과 — 화면 위에 투명하게 겹쳐 그린다(누르기·스크롤은 그대로 아래로).
//   3~5월 봄바람(꽃잎이 살랑살랑 옆으로) · 6~8월 쨍쨍 햇살(오른쪽 위) · 9~11월 여러 붉은 낙엽 · 12~2월 함박눈
// 계절은 한국 시간 달로. 휴대폰은 개수를 줄이고, 다른 탭을 볼 땐 멈추고, '동작 줄이기'를 켠 사람에겐 안 보인다.
// 관리자는 왼쪽 아래 [봄·여름·가을·겨울]로, 누구나 주소 끝 ?season=spring|summer|autumn|winter 로 다른 계절을 미리 볼 수 있다.

type Season = 'spring' | 'summer' | 'autumn' | 'winter';
const SEASONS: { key: Season; label: string }[] = [
  { key: 'spring', label: '봄' }, { key: 'summer', label: '여름' }, { key: 'autumn', label: '가을' }, { key: 'winter', label: '겨울' },
];

function seasonNow(): Season {
  const m = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', month: 'numeric' }));
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const LEAF_COLORS = ['#b03a2e', '#c0392b', '#d35400', '#e67e22', '#a93226', '#922b21', '#e74c3c', '#ba4a00', '#cb4335', '#d4ac0d', '#9c640c', '#c0562b'];
const PETAL_COLORS = ['#f9c9d6', '#f6b3c6', '#fbd9e3', '#f4a7bd', '#fde4ec'];

interface P {
  x: number; y: number; s: number; vx: number; vy: number;
  rot: number; vr: number; flip: number; vf: number; phase: number; color: string; kind: number;
}

/** 단풍잎(뾰족 다섯 갈래) */
function maple(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath();
  const R = [1, 0.5, 0.78, 0.38];   // 갈래 끝 · 홈 · 옆 뾰족 · 깊은 홈 — 다섯 번 되풀이
  const pts = 20;
  for (let i = 0; i <= pts; i++) {
    const a = -Math.PI / 2 + (i / pts) * Math.PI * 2;
    const r = s * R[i % 4] * (i % 20 === 10 || i % 20 === 9 || i % 20 === 11 ? 0.8 : 1);   // 아래쪽 갈래는 짧게
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-s * 0.05, s * 0.3, s * 0.1, s * 0.7);   // 꼭지
}
/** 둥근 잎(가운데 잎맥) */
function ovalLeaf(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * 0.75, -s * 0.2, 0, s);
  ctx.quadraticCurveTo(-s * 0.75, -s * 0.2, 0, -s);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = Math.max(0.6, s * 0.06);
  ctx.beginPath(); ctx.moveTo(0, -s * 0.9); ctx.lineTo(0, s * 1.15); ctx.stroke();
}
/** 꽃잎(끝이 살짝 갈라진) */
function petal(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath();
  ctx.moveTo(0, s);
  ctx.bezierCurveTo(s * 0.9, s * 0.4, s * 0.7, -s * 0.8, s * 0.12, -s);
  ctx.lineTo(0, -s * 0.78);
  ctx.lineTo(-s * 0.12, -s);
  ctx.bezierCurveTo(-s * 0.7, -s * 0.8, -s * 0.9, s * 0.4, 0, s);
  ctx.fill();
}

export default function SeasonEffect() {
  const { isAdmin } = useAdmin();
  const [season, setSeason] = useState<Season | null>(null);
  const [reduced, setReduced] = useState(false);
  // 캔버스는 Portal 이 붙인 뒤에 생기므로 ref 대신 state 로 받아 그때 그리기 시작
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // 주소 끝에 ?season=winter 처럼 붙이면 그 계절로 (미리보기)
    const q = new URLSearchParams(window.location.search).get('season');
    setSeason(SEASONS.some(x => x.key === q) ? (q as Season) : seasonNow());
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    if (!canvas || !season || reduced) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0, h = 0, raf = 0, last = performance.now(), t = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const small = w < 768;

    // 처음 놓을 때(top=false 이면 화면 안 아무 데나)
    const spawn = (p: Partial<P>, top: boolean): P => {
      const base: P = { x: rand(0, w), y: top ? rand(-60, -10) : rand(0, h), s: 6, vx: 0, vy: 1, rot: rand(0, Math.PI * 2), vr: rand(-0.02, 0.02), flip: rand(0, Math.PI * 2), vf: rand(0.02, 0.05), phase: rand(0, Math.PI * 2), color: '#fff', kind: 0 };
      return { ...base, ...p };
    };
    const make = (top: boolean): P => {
      if (season === 'winter') return spawn({ s: rand(2.5, small ? 6 : 8), vy: rand(0.35, 1.0), vx: rand(-0.15, 0.15) }, top);
      if (season === 'autumn') return spawn({ s: rand(7, small ? 13 : 17), vy: rand(0.55, 1.25), vx: rand(-0.3, 0.3), vr: rand(-0.035, 0.035), color: pick(LEAF_COLORS), kind: Math.random() < 0.55 ? 0 : 1 }, top);
      if (season === 'spring') {
        const p = spawn({ s: rand(4, small ? 7 : 9), vy: rand(0.15, 0.45), vx: rand(0.6, 1.5), color: pick(PETAL_COLORS) }, top);
        if (top) { p.x = rand(-80, -10); p.y = rand(-40, h * 0.8); }
        return p;
      }
      // 여름 — 반짝이(화면 전체)
      return spawn({ x: rand(0, w), y: rand(0, h), s: rand(1.5, small ? 3.5 : 4.5), phase: rand(0, Math.PI * 2) }, false);
    };
    const count = season === 'winter' ? (small ? 45 : 90) : season === 'autumn' ? (small ? 16 : 30) : season === 'spring' ? (small ? 40 : 75) : (small ? 18 : 36);
    let ps: P[] = Array.from({ length: count }, () => make(false));
    // 봄 — 바람결 선(하늘색)
    const gusts = Array.from({ length: small ? 6 : 10 }, () => ({ x: rand(-w, w), y: rand(h * 0.05, h * 0.9), len: rand(small ? 140 : 200, small ? 280 : 420), v: rand(1.6, 2.8), a: rand(0.35, 0.6) }));

    const draw = (now: number) => {
      const dt = Math.min(3, (now - last) / 16.67);
      last = now; t += dt;
      ctx.clearRect(0, 0, w, h);

      if (season === 'summer') {
        // 오른쪽 위 해 — 큰 빛무리(PC는 훨씬 크게) + 화면 전체로 뻗는 빛살(천천히 돌며 일렁임) + 반짝이
        const cx = w - (small ? 20 : 60), cy = small ? 10 : 40;
        const R = small ? w * 0.8 : Math.max(w, h) * 0.75;
        const pulse = 0.9 + Math.sin(t * 0.02) * 0.1;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * pulse);
        g.addColorStop(0, 'rgba(255,230,130,0.9)');
        g.addColorStop(0.18, 'rgba(255,214,100,0.5)');
        g.addColorStop(0.5, 'rgba(255,214,102,0.18)');
        g.addColorStop(1, 'rgba(255,214,102,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        const L = Math.hypot(w, h) * 1.15;   // 빛살 길이 — 화면 반대편 끝까지
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.002);
        for (let i = 0; i < 16; i++) {
          ctx.rotate((Math.PI * 2) / 16);
          const a = 0.13 + 0.07 * Math.sin(t * 0.03 + i * 1.7);
          const lg = ctx.createLinearGradient(0, 0, L, 0);
          lg.addColorStop(0, `rgba(255,214,110,${a})`); lg.addColorStop(0.55, `rgba(255,222,130,${a * 0.55})`); lg.addColorStop(1, 'rgba(255,222,130,0)');
          ctx.fillStyle = lg;
          const half = L * (i % 2 ? 0.035 : 0.055);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, -half); ctx.lineTo(L, half); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        for (const p of ps) {
          const a = Math.max(0, Math.sin(t * 0.06 + p.phase));
          if (a < 0.05) { if (Math.random() < 0.01) Object.assign(p, make(false)); continue; }
          ctx.save(); ctx.translate(p.x, p.y); ctx.globalAlpha = a * 0.95; ctx.fillStyle = '#ffc93c';
          ctx.beginPath();
          const s = p.s * (1 + a);
          ctx.moveTo(0, -s * 2); ctx.lineTo(s * 0.4, 0); ctx.lineTo(0, s * 2); ctx.lineTo(-s * 0.4, 0); ctx.closePath();
          ctx.moveTo(-s * 2, 0); ctx.lineTo(0, s * 0.4); ctx.lineTo(s * 2, 0); ctx.lineTo(0, -s * 0.4); ctx.closePath();
          ctx.fill(); ctx.restore();
        }
      } else {
        if (season === 'spring') {
          ctx.lineCap = 'round';
          for (const g of gusts) {
            g.x += g.v * dt * 2.2;
            if (g.x > w + 50) { g.x = rand(-w * 0.8, -g.len); g.y = rand(h * 0.1, h * 0.85); }
            // 하늘색 바람결 두 가닥 — 끝으로 갈수록 옅게
            for (const [dy, k2, lw] of [[0, 1, 2.2], [7, 0.5, 1.4]] as const) {
              const lg = ctx.createLinearGradient(g.x, 0, g.x + g.len, 0);
              lg.addColorStop(0, 'rgba(110,185,240,0)'); lg.addColorStop(0.35, `rgba(110,185,240,${g.a * k2})`);
              lg.addColorStop(0.75, `rgba(110,185,240,${g.a * k2})`); lg.addColorStop(1, 'rgba(110,185,240,0)');
              ctx.strokeStyle = lg; ctx.lineWidth = lw;
              ctx.beginPath();
              for (let k = 0; k <= 24; k++) {
                const x = g.x + (k / 24) * g.len, y = g.y + dy + Math.sin((x + t * 2) * 0.018) * 10;
                if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
              }
              ctx.stroke();
            }
          }
        }
        for (let i = 0; i < ps.length; i++) {
          const p = ps[i];
          const sway = Math.sin(t * 0.02 + p.phase);
          if (season === 'spring') { p.x += (p.vx + Math.sin(t * 0.015 + p.phase) * 0.5) * dt; p.y += (p.vy + sway * 0.35) * dt; }
          else { p.x += (p.vx + sway * (season === 'autumn' ? 0.9 : 0.35)) * dt; p.y += p.vy * dt; }
          p.rot += p.vr * dt; p.flip += p.vf * dt;
          if (p.y > h + 30 || p.x > w + 40 || p.x < -60) { ps[i] = make(true); continue; }
          ctx.save(); ctx.translate(p.x, p.y);
          if (season === 'winter') {
            // 밝은 배경에서도 보이게 — 옅은 회청색 그림자 위에 부드러운 흰 눈송이
            const sh = ctx.createRadialGradient(0, 1, 0, 0, 1, p.s * 1.6);
            sh.addColorStop(0, 'rgba(120,140,170,0.28)'); sh.addColorStop(1, 'rgba(120,140,170,0)');
            ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 1, p.s * 1.6, 0, Math.PI * 2); ctx.fill();
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.s);
            g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.65, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, p.s, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.rotate(p.rot); ctx.scale(Math.cos(p.flip), 1);   // 빙글빙글 뒤집히며
            ctx.fillStyle = p.color; ctx.globalAlpha = season === 'spring' ? 0.85 : 0.92;
            if (season === 'spring') petal(ctx, p.s); else if (p.kind === 0) maple(ctx, p.s); else ovalLeaf(ctx, p.s);
          }
          ctx.restore();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    const start = () => { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(draw); };
    const vis = () => { if (document.hidden) cancelAnimationFrame(raf); else start(); };
    const onResize = () => { resize(); ps = ps.map(() => make(false)); };
    start();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', vis);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', vis); };
  }, [canvas, season, reduced]);

  if (!season) return null;
  return (
    <Portal>
      {!reduced && <canvas ref={setCanvas} aria-hidden="true" className="fixed inset-0 z-[55] pointer-events-none" />}
      {isAdmin && (
        <div className="fixed left-3 bottom-3 z-[160] flex gap-1 rounded-full bg-white/90 shadow px-1.5 py-1 text-[11px]">
          <span className="px-1.5 text-[#999] self-center">계절 미리보기</span>
          {SEASONS.map(s => (
            <button key={s.key} type="button" onClick={() => setSeason(s.key)}
              className={`px-2 py-0.5 rounded-full ${season === s.key ? 'bg-[var(--brand)] text-white' : 'text-[#555] hover:bg-[#f4f4f5]'}`}>{s.label}</button>
          ))}
        </div>
      )}
    </Portal>
  );
}
