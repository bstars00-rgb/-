/**
 * 2027 마켓플레이스 확장 트래커 — 빌더 (P0)
 *   node scripts/build-marketplace-tracker.js [--asof YYYY-MM-DD] [--fx 8.3574]
 *
 * 입력: handoff_marketplace_tracker/seed.json (SSOT 스냅샷) + processed/bd_*.csv (부킹 실적 재계산)
 * 출력:
 *   output/marketplace-panel.html          — 대시보드 탭 주입용 프래그먼트(.mkt 네임스페이스, 자체 스타일/스크립트)
 *   docs/marketplace-tracker.html          — 독립 페이지(게이트는 deploy.js 가 주입)
 *   output/marketplace-tracker-<asof>.json — 계산 스냅샷(주간 추이·재현용)
 *
 * SPEC: handoff_marketplace_tracker/SPEC.md (7장 화면, 6장 계산, 10장 검증, 12.3 색)
 * 주의: generate-weekly.js·generate-dashboard.js 는 건드리지 않는다. 날짜는 로컬 파싱(UTC 금지).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'output');
const DOCS = path.join(ROOT, 'docs');
const SEED = path.join(ROOT, 'handoff_marketplace_tracker', 'seed.json');
const PROCESSED = path.join(ROOT, 'processed');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const AS_OF = arg('--asof', new Date().toISOString().slice(0, 10));
const FX = parseFloat(arg('--fx', '8.3574'));           // KRW per JPY (임시)
const BOOK_START = '2026-03-28';                         // 부킹 데이터 시작(REPORT)
const VERIFY_END = '2026-11-13';                         // baseline_checks 기준 종료일
const MARKET_START = '2027-01-01';                        // 마켓플레이스 프로그램 시작 = 제로베이스 기준.
                                                          // 파트너 누적 예약·TTV는 이 날짜 이후 부킹만 집계(시작 전엔 전 파트너 0).

// ── helpers ──
const d10 = s => String(s == null ? '' : s).slice(0, 10);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) ? 0 : n; };
const daysBetween = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);
// 따옴표 인식 CSV 라인 파서 (billingJPY 가 "33,160" 처럼 콤마를 품은 따옴표 필드로 저장됨)
function parseLine(line) {
  const out = []; let cur = '', q = false;
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    if (q) { if (ch === '"' && line[j + 1] === '"') { cur += '"'; j++; } else if (ch === '"') q = false; else cur += ch; }
    else { if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; }
  }
  out.push(cur); return out;
}
const eok = jpy => (jpy * FX) / 1e8;                     // JPY → 억원(KRW)
const fmtEok = jpy => '₩' + eok(jpy).toFixed(2) + '억';
const fmtInt = n => (n == null ? '-' : Math.round(n).toLocaleString('ko-KR'));

// ── load seed ──
const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
const partners = seed.partners;
const QT = Array.isArray(seed.quarterly_targets) ? seed.quarterly_targets : Object.values(seed.quarterly_targets);
const RT = seed.regional_targets;
const DEV = seed.dev_dependencies;
const DEFS = seed.definitions;
const BC = seed.baseline_checks;
const WLOG = seed.weekly_log_2026;

// ── booking recompute (sellerName 매칭) ──
function loadBookings() {
  const files = fs.readdirSync(PROCESSED).filter(f => /^bd_2026-.*\.csv$/.test(f));
  const all = {};   // sellerName -> {bk, ttv, first, last}
  const win = {};   // same, limited to BOOK_START..VERIFY_END (검증용)
  const mkt = {};   // same, limited to MARKET_START 이후 (2027 마켓플레이스 실적 — 시작 전엔 전부 비어 있음)
  for (const f of files) {
    const lines = fs.readFileSync(path.join(PROCESSED, f), 'utf8').split('\n');
    const H = lines[0].split(',');
    const iSeller = H.indexOf('sellerName'), iBd = H.indexOf('bookingDate'), iBill = H.indexOf('billingJPY'), iSt = H.indexOf('bookingStatus');
    if (iSeller < 0 || iBd < 0) continue;
    for (let i = 1; i < lines.length; i++) {
      const l = lines[i]; if (!l.trim()) continue;
      const v = parseLine(l);
      const st = (v[iSt] || '').trim();
      if (/cancel/i.test(st)) continue;                  // Confirmed + Reserved 만
      const seller = v[iSeller] || ''; if (!seller) continue;
      const bd = d10(v[iBd]); if (!/^2026-\d\d-\d\d$/.test(bd)) continue;
      const bill = num(v[iBill]);
      const acc = all[seller] || (all[seller] = { bk: 0, ttv: 0, first: null, last: null });
      acc.bk++; acc.ttv += bill;
      if (!acc.first || bd < acc.first) acc.first = bd;
      if (!acc.last || bd > acc.last) acc.last = bd;
      if (bd >= BOOK_START && bd <= VERIFY_END) {
        const w = win[seller] || (win[seller] = { bk: 0, ttv: 0 });
        w.bk++; w.ttv += bill;
      }
      if (bd >= MARKET_START) {
        const m = mkt[seller] || (mkt[seller] = { bk: 0, ttv: 0 });
        m.bk++; m.ttv += bill;
      }
    }
  }
  return { all, win, mkt };
}
const BOOK = loadBookings();

// ── attach computed bookings to matched partners ──
let matchedCount = 0;
partners.forEach(p => {
  p._matched = !!p.ellis_seller_name;
  if (p._matched) matchedCount++;
  // 마켓플레이스 제로베이스: 2027 시작 전엔 전 파트너 0. 시작 후 매칭된 곳만 MARKET_START 이후 실적 집계.
  const useMkt = AS_OF >= MARKET_START;
  const a = (p.ellis_seller_name && useMkt) ? BOOK.mkt[p.ellis_seller_name] : null;
  p._bk = a ? a.bk : 0;
  p._ttv = a ? a.ttv : 0;
  p._lastBook = p.last_booking_date || null;
  // chase 경과
  if (p.chase_date && p.stage !== '이탈' && d10(p.chase_date) < AS_OF) {
    p._chaseOverdue = daysBetween(AS_OF, d10(p.chase_date));
  } else p._chaseOverdue = null;
});

// ── 2027 KPI (AsOf < 2027 → 시작 전) ──
const before2027 = AS_OF < '2027-01-01';
const curQ = before2027 ? 1 : (new Date(AS_OF + 'T00:00:00').getMonth() / 3 | 0) + 1;
const qi = curQ - 1;

// ── 마켓플레이스 로스터 (제로베이스) ──
// 파트너 명단은 2027 프로그램 가입 확정분만 센다. seed의 join_quarter(2027 가입 분기) 또는
// join_date가 MARKET_START 이후인 파트너만 로스터. 시작 전인 현재는 0곳(빈 로스터).
// seed의 37곳은 2026 기존 계정/모집중 스냅샷이라 ⑧ 2026 기준선에만 참조로 남는다.
const roster = before2027 ? [] : partners.filter(p => p.join_quarter || (p.join_date && d10(p.join_date) >= MARKET_START));

// ── baseline (2026 기존 계정) ──
const existing = partners.filter(p => p.kind === '기존');
const periodBk = existing.reduce((s, p) => { const w = p.ellis_seller_name ? BOOK.win[p.ellis_seller_name] : null; return s + (w ? w.bk : 0); }, 0);
const periodTtv = existing.reduce((s, p) => { const w = p.ellis_seller_name ? BOOK.win[p.ellis_seller_name] : null; return s + (w ? w.ttv : 0); }, 0);
const periodDays = daysBetween(VERIFY_END, BOOK_START) + 1;
const avgDaily = periodBk / periodDays;
const annualTtvEok = (periodTtv / periodDays) * 365 * FX / 1e8;
const activeExisting = existing.filter(p => p.stage === '활성').length;

// ── distributions ──
const byStage = {}, byOwner = {}, byRegion = {};
partners.forEach(p => { byStage[p.stage] = (byStage[p.stage] || 0) + 1; byOwner[p.owner] = (byOwner[p.owner] || 0) + 1; byRegion[p.region] = (byRegion[p.region] || 0) + 1; });

// ── verification (10장) ──
const checks = [];
const ck = (name, got, exp, ok) => checks.push({ name, got, exp, ok: ok !== undefined ? ok : (got === exp) });
ck('시드 행 수', partners.length, BC.rows);
ck('기간 예약 합계', periodBk, BC.period_bookings);
ck('기간 TTV(JPY)', Math.round(periodTtv), BC.period_ttv_jpy);
ck('일 평균 예약', +avgDaily.toFixed(3), BC.avg_daily_bookings, Math.abs(avgDaily - BC.avg_daily_bookings) < 0.01);
ck('연환산 TTV(억)', +annualTtvEok.toFixed(3), BC.annualized_ttv_eok_krw, Math.abs(annualTtvEok - BC.annualized_ttv_eok_krw) < 0.02);
ck('매칭 판매처', matchedCount, BC.existing_accounts - 19, matchedCount === 11);
ck('기존 계정', existing.length, BC.existing_accounts);
const stageOk = JSON.stringify(byStage) && ['리드', '접촉', '가입', '첫 예약', '활성'].every(s => (byStage[s] || 0) === (BC.by_stage[s] || 0));
ck('단계 분포', JSON.stringify(byStage), JSON.stringify(BC.by_stage), stageOk);
const bookNow = partners.find(p => /BookNow/i.test(p.name));
ck('BookNow 체이스 경과', bookNow ? bookNow._chaseOverdue : null, 22, bookNow && bookNow._chaseOverdue === 22);

// ─────────────────────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────────────────────
const C = { bg: '#0d1424', card: '#141d33', card2: '#182341', line: '#243149', ink: '#e8eefc', sub: '#93a6c6', mut: '#6b7f9e',
  blue: '#3b82f6', blueL: '#60a5fa', green: '#22c55e', yellow: '#eab308', red: '#ef4444', gray: '#64748b', orange: '#f0851f', preBlue: '#38bdf8' };
const STATUS = {
  '맞음': C.green, '달성': C.green, '늦음': C.red, '막힘': C.red, '미달': C.red,
  '미배정': C.yellow, '주의': C.yellow, '확인': C.gray, '참고': C.gray, '목표 없음': C.gray,
  '2027 시작 전': C.preBlue,
};
const chip = (txt, col) => `<span class="mkt-chip" style="background:${col}22;color:${col};border:1px solid ${col}55">${esc(txt)}</span>`;
const propBadge = kind => kind === '제안값' ? ` ${chip('제안', C.orange)}` : (kind === '검산' ? ` ${chip('검산', C.gray)}` : (kind === '미배정' ? ` ${chip('미배정', C.yellow)}` : ''));

function kpiCards() {
  const cards = [
    { label: '마켓 파트너 수', unit: '곳', q: QT[0].q, kind: QT[0].kind },
    { label: '첫 예약률', unit: '%', q: QT[1].q.map(v => v * 100), kind: QT[1].kind },
    { label: '활성 파트너', unit: '곳', q: QT[2].q, kind: QT[2].kind },
    { label: '서드파티 활성', unit: '곳', q: QT[4].q, kind: QT[4].kind, note: 'p.08=60 불일치' },
    { label: '마켓 일 부킹', unit: '건/일', q: QT[5].q, kind: QT[5].kind },
    { label: '마켓 TTV(분기)', unit: '억', q: QT[7].q, kind: QT[7].kind },
    { label: '서드파티 TTV(분기)', unit: '억', q: QT[10].q, kind: QT[10].kind },
  ];
  return cards.map(c => {
    const tgt = c.q[qi];
    const statusTxt = before2027 ? '2027 시작 전' : '—';
    const col = STATUS['2027 시작 전'];
    return `<div class="mkt-kpi">
      <div class="mkt-kpi-l">${esc(c.label)}${propBadge(c.kind)}</div>
      <div class="mkt-kpi-v">0<span class="mkt-kpi-u"> / ${tgt == null ? '—' : fmtInt(tgt)}${esc(c.unit)}</span></div>
      <div class="mkt-kpi-s"><span style="color:${col}">● ${statusTxt}</span> · ${curQ}Q 목표${c.note ? ` · <span style="color:${C.orange}">${esc(c.note)}</span>` : ''}</div>
    </div>`;
  }).join('');
}

function quarterPath() {
  const pr = QT[0].q, ar = QT[2].q;      // 파트너 수 / 활성
  const mx = Math.max(...pr) * 1.08;
  const H = 150, W = 520, pad = 34;
  const x = i => pad + i * (W - pad * 2) / 3;
  const y = v => H - 24 - (v / mx) * (H - 44);
  let bars = '';
  for (let i = 0; i < 4; i++) {
    bars += `<rect x="${x(i) - 16}" y="${y(pr[i])}" width="14" height="${H - 24 - y(pr[i])}" rx="2" fill="${C.blue}"/>`
      + `<rect x="${x(i) + 2}" y="${y(ar[i])}" width="14" height="${H - 24 - y(ar[i])}" rx="2" fill="${C.green}"/>`
      + `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" fill="${C.sub}" font-size="12">${i + 1}Q</text>`
      + `<text x="${x(i) - 9}" y="${y(pr[i]) - 5}" text-anchor="middle" fill="${C.blueL}" font-size="11" font-weight="700">${pr[i]}</text>`
      + `<text x="${x(i) + 9}" y="${y(ar[i]) - 5}" text-anchor="middle" fill="${C.green}" font-size="11" font-weight="700">${ar[i]}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:560px;height:auto">${bars}</svg>
    <div class="mkt-legend"><span style="color:${C.blueL}">■</span> 파트너 수(누적 목표) &nbsp; <span style="color:${C.green}">■</span> 활성 목표 &nbsp; <span style="color:${C.mut}">— 실적선은 2027 시작 후 표시</span></div>`;
}

function regionTable() {
  const rows = RT.map(r => {
    const regionKey = r.region.startsWith('중화권') ? '중화권' : r.region.startsWith('한국') ? '한국' : r.region.startsWith('인도네시아') ? '인니·베트남' : '기타';
    const exist = partners.filter(p => p.region === regionKey && p.kind === '기존').length;   // 2026 기준선(참조)
    const joined = roster.filter(p => p.region === regionKey).length;                          // 2027 가입(제로베이스)
    const active = roster.filter(p => p.region === regionKey && p.stage === '활성').length;    // 2027 활성
    const tgt = r.q[qi];
    const noTgt = tgt == null;
    return `<tr>
      <td style="text-align:left">${esc(r.region)}${propBadge(r.kind)}</td>
      <td>${noTgt ? `<span style="color:${C.gray}">목표 없음 — 확인 필요</span>` : fmtInt(tgt) + '곳'}</td>
      <td>${joined}</td><td>${active}</td><td>${exist}</td>
      <td>${noTgt ? '—' : `<span style="color:${C.preBlue}">2027 시작 전</span>`}</td>
    </tr>`;
  }).join('');
  return `<table class="mkt-tbl"><thead><tr><th style="text-align:left">지역 · 담당</th><th>${curQ}Q 목표</th><th>2027 가입</th><th>활성</th><th>기존 계정</th><th>상태</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function ownerFunnel() {
  const owners = ['Grace', 'Jay Pan', 'Aiden(한국 대행)', 'Aiden(총괄·채용 전)'];
  const stages = ['리드', '접촉', '가입', '첫 예약', '활성', '이탈'];
  const head = `<tr><th style="text-align:left">담당</th>${stages.map(s => `<th>${s}</th>`).join('')}<th>체이스 경과</th><th>액션 없음</th></tr>`;
  const rows = owners.map(o => {
    const ps = roster.filter(p => p.owner === o);   // 제로베이스: 2027 로스터 기준(현재 0)
    const cells = stages.map(s => { const n = ps.filter(p => p.stage === s).length; return `<td>${n || '<span style="color:' + C.mut + '">·</span>'}</td>`; }).join('');
    const overdue = ps.filter(p => p._chaseOverdue != null).length;
    const noAction = ps.filter(p => !p.next_action).length;
    return `<tr><td style="text-align:left">${esc(o)}</td>${cells}<td>${overdue ? `<span style="color:${C.red};font-weight:700">${overdue}</span>` : 0}</td><td>${noAction}</td></tr>`;
  }).join('');
  return `<table class="mkt-tbl"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

function partnerTable() {
  const rows = roster.map(p => {
    const over = p._chaseOverdue != null;
    const stageCol = p.stage === '활성' ? C.green : p.stage === '이탈' ? C.red : p.stage === '첫 예약' ? C.blueL : C.sub;
    return `<tr class="mkt-prow${over ? ' mkt-overdue' : ''}" data-region="${esc(p.region)}" data-owner="${esc(p.owner)}" data-stage="${esc(p.stage)}" data-type="${esc(p.type)}" data-name="${esc((p.name || '').toLowerCase())}">
      <td style="text-align:left">${esc(p.name)}${p._matched ? '' : ' ' + chip('매칭 미확인', C.yellow)}</td>
      <td>${esc(p.country)}</td><td>${esc(p.region)}</td>
      <td><span style="color:${stageCol};font-weight:600">${esc(p.stage)}</span></td>
      <td>${esc(p.owner)}</td>
      <td style="text-align:right">${p._bk == null ? `<span style="color:${C.mut}">—</span>` : fmtInt(p._bk)}</td>
      <td style="text-align:right">${p._ttv == null ? `<span style="color:${C.mut}">—</span>` : fmtEok(p._ttv)}</td>
      <td>${p.chase_date ? (over ? `<span style="color:${C.red};font-weight:700">경과 ${p._chaseOverdue}일</span>` : esc(d10(p.chase_date))) : `<span style="color:${C.mut}">—</span>`}</td>
      <td style="text-align:left">${p.next_action ? esc(p.next_action) : `<span style="color:${C.mut}">—</span>`}</td>
    </tr>`;
  }).join('');
  const opt = (arr) => arr.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  const regions = [...new Set(roster.map(p => p.region))], owners = [...new Set(roster.map(p => p.owner))], stagesU = [...new Set(roster.map(p => p.stage))], types = [...new Set(roster.map(p => p.type))];
  const bodyRows = rows || `<tr><td colspan="9" style="padding:26px;color:${C.mut};text-align:center">2027 마켓플레이스 파트너 모집 전 — 등록 <b style="color:${C.ink}">0곳</b>. 가입이 확정되면 여기에 누적됩니다. <span style="color:${C.sub}">(2026 기존 ${existing.length}곳은 ⑧ 기준선 참조)</span></td></tr>`;
  return `<div class="mkt-filters">
      <input id="mktSearch" class="mkt-in" placeholder="파트너 검색…" oninput="mktFilter()">
      <select id="mktRegion" class="mkt-in" onchange="mktFilter()"><option value="">지역 전체</option>${opt(regions)}</select>
      <select id="mktOwner" class="mkt-in" onchange="mktFilter()"><option value="">담당 전체</option>${opt(owners)}</select>
      <select id="mktStage" class="mkt-in" onchange="mktFilter()"><option value="">단계 전체</option>${opt(stagesU)}</select>
      <select id="mktType" class="mkt-in" onchange="mktFilter()"><option value="">유형 전체</option>${opt(types)}</select>
      <span id="mktCount" class="mkt-sub2"></span>
    </div>
    <div style="overflow-x:auto"><table class="mkt-tbl" id="mktPTable"><thead><tr>
      <th style="text-align:left">파트너</th><th>국가</th><th>지역</th><th>단계</th><th>담당</th><th style="text-align:right">누적 예약</th><th style="text-align:right">누적 TTV</th><th>체이스</th><th style="text-align:left">다음 액션</th>
    </tr></thead><tbody>${bodyRows}</tbody></table></div>`;
}

function weeklyTrend() {
  const mx = Math.max(...WLOG.map(w => w.market_bookings), 1) * 1.1;
  const W = 900, H = 140, pad = 30;
  const x = i => pad + i * (W - pad * 2) / (WLOG.length - 1);
  const y = v => H - 22 - (v / mx) * (H - 36);
  const pts = WLOG.map((w, i) => x(i) + ',' + y(w.market_bookings)).join(' ');
  let ticks = '';
  WLOG.forEach((w, i) => { if (i % 4 === 0) ticks += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" fill="${C.mut}" font-size="10">${w.week_start.slice(5)}</text>`; });
  const totBk = WLOG.reduce((s, w) => s + w.market_bookings, 0), totTtv = WLOG.reduce((s, w) => s + w.market_ttv_jpy, 0);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto"><polyline points="${pts}" fill="none" stroke="${C.blue}" stroke-width="2.5"/>${ticks}</svg>
    <div class="mkt-sub2">2026 기준선(기존 계정) · 주 ${WLOG.length}개 · 합계 ${fmtInt(totBk)}건 · ${fmtEok(totTtv)} <span style="color:${C.orange}">(환율 임시 ${FX})</span> · 2027 주간 실적은 시작 후 표시</div>`;
}

function devTable() {
  const rows = DEV.map(d => {
    const col = STATUS[d.status] || C.gray;
    return `<tr><td style="text-align:left">${esc(d.item)}</td><td>${chip(d.kind, d.kind === '막힌 일' ? C.red : d.kind === '개발 의존' ? C.blue : C.gray)}</td>
      <td style="text-align:left">${esc(d.kpi || '')}</td><td>${esc(d.need_by || '')}</td><td>${esc(d.dev_timing || '')}</td>
      <td><span style="color:${col};font-weight:700">● ${esc(d.status)}</span></td><td style="text-align:left">${esc(d.next_action || '')}</td><td>${esc(d.owner || '')}</td></tr>`;
  }).join('');
  return `<table class="mkt-tbl"><thead><tr><th style="text-align:left">항목</th><th>구분</th><th style="text-align:left">KPI</th><th>필요 시점</th><th>개발 일정</th><th>상태</th><th style="text-align:left">다음 액션</th><th>담당</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function baselineCard() {
  return `<div class="mkt-grid4">
    <div class="mkt-stat"><div class="mkt-stat-l">기존 계정</div><div class="mkt-stat-v">${existing.length}곳</div><div class="mkt-stat-s">Dotbiz+Portal(2026 이전)</div></div>
    <div class="mkt-stat"><div class="mkt-stat-l">활성(임시)</div><div class="mkt-stat-v">${activeExisting}곳</div><div class="mkt-stat-s">최근 8주 내 1건</div></div>
    <div class="mkt-stat"><div class="mkt-stat-l">기간 예약 / 일평균</div><div class="mkt-stat-v">${fmtInt(periodBk)}건</div><div class="mkt-stat-s">${avgDaily.toFixed(2)}건/일 · ${periodDays}일</div></div>
    <div class="mkt-stat"><div class="mkt-stat-l">연환산 TTV</div><div class="mkt-stat-v">₩${annualTtvEok.toFixed(2)}억</div><div class="mkt-stat-s">vs 4Q 목표 87억 · <span style="color:${C.red}">격차</span></div></div>
  </div>
  <div class="mkt-sub2" style="margin-top:8px">기간 ${BOOK_START} ~ ${VERIFY_END} · 매칭 ${matchedCount}곳 · 기간 TTV ${fmtEok(periodTtv)} <span style="color:${C.orange}">(환율 임시 ${FX})</span> · 나머지 ${existing.length - matchedCount}곳은 판매처명 매칭 미확인</div>`;
}

function risksDefs() {
  const risks = [
    '개발 의존이 늦다: 셀프 온보딩·언어팩·PG 필요 12~3월인데 개발 4~10월(덱 p.17). 1Q 60곳 모집 방식 미정',
    '기준선 격차: 기존 계정 연환산 ₩3.3억(일 2.1건) vs 4Q 목표 ₩87억·일 120건',
    '1Q 파트너 60곳 vs 지역 합계 50곳(중화권 50·한국 없음) — 차이 10',
    '서드파티 활성 파트너: p.08=60 vs p.14=90',
    '서드파티 TTV 분기 합 34억 vs 연 36억(2억 차)',
    '한국 API 4/7/10곳(p.10) vs 3/6/10곳(p.26)',
    '활성 정의가 덱에 없음 — 임시 "최근 8주 내 1건" 적용',
    'TTV 기준 차이: 이 트래커=부킹일, 덱 KR1=투숙(취소 후)',
    '환율 8.3574는 임시값',
    '파트너 300곳에 2026 이전 기존 계정 포함 여부 불명',
    '인니·베트남·기타 지역은 덱에 마켓 목표 없음',
  ];
  const decisions = [
    '입력 방식: 엑셀을 3.CRM에 교체(기본안)로 시작할지 / 팀원 직접 입력 시 SharePoint',
    '활성 정의: 최근 8주 내 1건 임시 유지 여부',
    '파트너 300곳에 기존 계정 포함 여부',
    '노출 범위: 파트너별 TTV·누적예약을 게이트 페이지에 둘지 / 합계만',
    '환율 확정값, TTV 기준(부킹일 vs 투숙)',
    '덱 불일치 해소(#3~#6) 기준 숫자',
    '인니·베트남·기타 지역 목표 설정 여부',
    '게시: index·links 링크 추가 / 주간 Teams 요약 첨부',
  ];
  const defRows = DEFS.map(d => `<tr><td style="text-align:left;white-space:nowrap;font-weight:600;color:${C.ink}">${esc(d.term)}</td><td style="text-align:left">${esc(d.definition)}</td><td style="text-align:left;color:${C.mut}">${esc(d.basis || '')}</td></tr>`).join('');
  return `<div class="mkt-two">
    <div><div class="mkt-h3" style="color:${C.red}">⚠ 확인 필요 — 리스크·불일치 (8장)</div><ul class="mkt-ul">${risks.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>
    <div><div class="mkt-h3" style="color:${C.orange}">❓ 결정 필요 (11장 · Aiden)</div><ol class="mkt-ol">${decisions.map(r => `<li>${esc(r)}</li>`).join('')}</ol></div>
  </div>
  <div class="mkt-h3" style="margin-top:18px">📖 정의 · 출처</div>
  <div style="overflow-x:auto"><table class="mkt-tbl mkt-defs"><thead><tr><th style="text-align:left">용어</th><th style="text-align:left">정의</th><th style="text-align:left">근거·상태</th></tr></thead><tbody>${defRows}</tbody></table></div>`;
}

const STYLE = `
.mkt{background:${C.bg};color:${C.ink};font-family:'Segoe UI','Malgun Gothic',system-ui,sans-serif;padding:22px 26px;min-height:100%;box-sizing:border-box}
.mkt *{box-sizing:border-box}
.mkt-head{display:block;margin-bottom:18px}
.mkt-title{font-size:26px;font-weight:800;letter-spacing:-.3px}
.mkt-meta{color:${C.sub};font-size:13px;margin-top:6px}
.mkt-meta b{color:${C.ink}}
.mkt-sec{background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:18px 20px;margin:0 0 16px}
.mkt-h2{font-size:17px;font-weight:800;margin:0 0 12px;color:#f4f8ff}
.mkt-h2 .n{color:${C.blueL};margin-right:7px}
.mkt-h3{font-size:14px;font-weight:700;color:#dce6fb;margin:0 0 8px}
.mkt-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.mkt-kpi{background:${C.card2};border:1px solid ${C.line};border-radius:12px;padding:12px 14px}
.mkt-kpi-l{font-size:12.5px;color:${C.sub};font-weight:600;min-height:17px}
.mkt-kpi-v{font-size:28px;font-weight:800;margin:4px 0 2px;color:#fff}
.mkt-kpi-u{font-size:14px;color:${C.sub};font-weight:600}
.mkt-kpi-s{font-size:11.5px;color:${C.mut}}
.mkt-chip{display:inline-block;font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:10px;vertical-align:middle;margin-left:4px}
.mkt-tbl{width:100%;border-collapse:collapse;font-size:13px}
.mkt-tbl th{color:${C.sub};font-size:11.5px;font-weight:600;text-align:center;padding:7px 8px;border-bottom:2px solid ${C.line};white-space:nowrap}
.mkt-tbl td{text-align:center;padding:7px 8px;border-bottom:1px solid ${C.line};color:${C.ink}}
.mkt-tbl tbody tr:hover{background:${C.card2}}
.mkt-overdue{background:${C.red}12}
.mkt-overdue:hover{background:${C.red}22}
.mkt-defs td{font-size:12px;color:${C.sub};line-height:1.5}
.mkt-grid4{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.mkt-stat{background:${C.card2};border:1px solid ${C.line};border-radius:12px;padding:12px 14px}
.mkt-stat-l{font-size:12px;color:${C.sub};font-weight:600}
.mkt-stat-v{font-size:24px;font-weight:800;margin:3px 0;color:#fff}
.mkt-stat-s{font-size:11px;color:${C.mut}}
.mkt-legend,.mkt-sub2{font-size:11.5px;color:${C.mut};margin-top:8px}
.mkt-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
.mkt-in{background:${C.card2};border:1px solid ${C.line};color:${C.ink};border-radius:8px;padding:7px 10px;font-size:12.5px;outline:none}
.mkt-in::placeholder{color:${C.mut}}
.mkt-two{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.mkt-ul,.mkt-ol{margin:0;padding-left:18px;font-size:12.5px;color:${C.sub};line-height:1.7}
@media(max-width:820px){.mkt-two{grid-template-columns:1fr}.mkt{padding:16px}}
`;

const SCRIPT = `
function mktFilter(){
  var q=(document.getElementById('mktSearch').value||'').toLowerCase();
  var r=document.getElementById('mktRegion').value, o=document.getElementById('mktOwner').value, s=document.getElementById('mktStage').value, t=document.getElementById('mktType').value;
  var rows=document.querySelectorAll('#mktPTable tbody tr'), shown=0, total=0;
  rows.forEach(function(row){
    if(!row.dataset.name){ return; }  // 빈 상태(제로베이스) 행은 집계·필터 제외
    total++;
    var ok=(!q||row.dataset.name.indexOf(q)>=0)&&(!r||row.dataset.region===r)&&(!o||row.dataset.owner===o)&&(!s||row.dataset.stage===s)&&(!t||row.dataset.type===t);
    row.style.display=ok?'':'none'; if(ok)shown++;
  });
  var c=document.getElementById('mktCount'); if(c)c.textContent=shown+' / '+total+'곳';
}
document.addEventListener('DOMContentLoaded',mktFilter);
if(document.readyState!=='loading')mktFilter();
`;

const section = (n, title, body, extra) => `<div class="mkt-sec"><div class="mkt-h2"><span class="n">${n}</span>${title}${extra || ''}</div>${body}</div>`;

const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
const body = `<div class="mkt" id="mktRoot">
  <div class="mkt-head">
    <div class="mkt-title">🛒 2027 마켓플레이스 확장 트래커</div>
    <div class="mkt-meta">기준일 <b>${AS_OF}</b> · 현재 <b>${curQ}Q</b> ${before2027 ? '<span style="color:' + C.preBlue + '">(2027 시작 전)</span>' : ''} · 부킹 데이터 <b>${BOOK_START} ~ ${VERIFY_END}</b> · 환율 <b>${FX}</b> <span style="color:${C.orange}">임시</span> · 갱신 ${nowStr}</div>
  </div>
  ${section('①', 'KPI — 분기 목표 대비 (커머셜 2027 OKR)', `<div class="mkt-kpis">${kpiCards()}</div>`)}
  ${section('②', '분기 경로 — 목표 vs 실적', quarterPath())}
  ${section('③', '지역별', regionTable())}
  ${section('④', '담당별 퍼널', ownerFunnel())}
  ${section('⑤', '파트너', partnerTable())}
  ${section('⑥', '주간 추이 (2026 기준선)', weeklyTrend())}
  ${section('⑦', '개발 의존 · 막힌 일', devTable())}
  ${section('⑧', '2026 기준선', baselineCard())}
  ${section('＊', '정의 · 출처 · 확인 필요', risksDefs())}
</div>`;

const fragment = `<style>${STYLE}</style>${body}<script>${SCRIPT}</script>`;

// panel fragment (대시보드 탭 주입용)
fs.writeFileSync(path.join(OUT, 'marketplace-panel.html'), fragment, 'utf8');

// 독립 페이지 (deploy.js 가 게이트 주입)
const standalone = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>마켓플레이스 확장 트래커</title><style>body{margin:0;background:${C.bg}}</style></head><body>${fragment}</body></html>`;
fs.writeFileSync(path.join(DOCS, 'marketplace-tracker.html'), standalone, 'utf8');

// 스냅샷 JSON
const snap = { asOf: AS_OF, fx: FX, generated: nowStr, curQ, before2027,
  baseline: { existing: existing.length, activeExisting, periodBk, periodTtv: Math.round(periodTtv), avgDaily: +avgDaily.toFixed(3), annualTtvEok: +annualTtvEok.toFixed(3), matchedCount },
  byStage, byOwner, byRegion, checks };
fs.writeFileSync(path.join(OUT, `marketplace-tracker-${AS_OF}.json`), JSON.stringify(snap, null, 2), 'utf8');

// ── report ──
console.log('── 마켓플레이스 트래커 빌드 ──');
console.log('  panel   : output/marketplace-panel.html  (' + fragment.length + ' chars)');
console.log('  page    : docs/marketplace-tracker.html');
console.log('  snapshot: output/marketplace-tracker-' + AS_OF + '.json');
console.log('  AsOf ' + AS_OF + ' · FX ' + FX + ' · curQ ' + curQ + (before2027 ? ' (2027 시작 전)' : ''));
console.log('── 검증 (10장) ──');
let fail = 0;
checks.forEach(c => { const mark = c.ok ? '✅' : '❌'; if (!c.ok) fail++; console.log('  ' + mark + ' ' + c.name + ': got=' + c.got + ' exp=' + c.exp); });
console.log(fail ? ('  ⚠ ' + fail + '건 불일치 — 확인 필요') : '  ✓ 전 항목 통과');
