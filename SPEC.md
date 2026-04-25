# OMH Global SnM Weekly Report — 전체 스펙

## 프로젝트 개요

**목적**: OhMyHotel Global SnM 팀의 주간 보고서를 자동 생성하는 Node.js 기반 시스템.
매주 토요일 전사 발표용 / 대표(Jackie) 보고용 단일 HTML 대시보드를 GitHub Pages에 자동 배포.

**Live URL**: https://bstars00-rgb.github.io/-/
**Git Repo**: https://github.com/bstars00-rgb/-

---

## 운영 플로우 (매주)

### 매주 토요일
1. 부킹데이트 로우데이터(7일치, 토~금)를 `2. RawData_By Booking Date/`에 추가
2. CRM 파일 최신 버전을 `3. CRM/`에 교체 (팀원 시트, 계약변경 시트 포함)
3. Claude에게 "주간보고 업데이트" 요청 또는 직접 실행:
   ```bash
   node scripts/run-weekly.js 2026-04-18
   ```
   인자는 **보고 주의 토요일** (생략 시 직전 토요일 자동)

### 매월 1일
- 전월 체크아웃 로우데이터를 `1. RawData_By Check Out/2. 2026 Data/`에 추가
- 다음 주간 보고 실행 시 자동으로 ② 채널별 분석 + ③ 월별 실적에 반영

---

## 폴더 구조

```
REPORT/
├── package.json
├── scripts/
│   ├── run-weekly.js          ← 통합 실행기 (전처리→누적→생성→배포 4단계)
│   ├── preprocess.js          ← xlsx → CSV 전처리 (스트리밍)
│   ├── ytd-accumulator.js     ← 월별 YTD 누적 (체크아웃 기준)
│   ├── generate-weekly.js     ← 주간 보고서 생성기 (메인)
│   ├── generate-dashboard.js  ← HTML 대시보드 생성기
│   ├── deploy.js              ← GitHub Pages 배포
│   ├── i18n.js                ← KR/EN 다국어 사전
│   ├── guest-nationality.js   ← 고객 국적 추정 (성씨 패턴)
│   └── create-team-input.js   ← 팀 입력용 Excel 템플릿 생성기
├── 1. RawData_By Check Out/
│   ├── 1. 2025 Data/          ← 73MB xlsx (528K행, 1년치)
│   └── 2. 2026 Data/
│       ├── 1. Jan, Feb/
│       ├── 2. Mar/
│       └── 3. Apr/ (다음 달부터 추가)
├── 2. RawData_By Booking Date/  ← 매주 7일치 추가
├── 3. CRM/
│   └── 2026_Dev_Schedule__updated_*.xlsx  ← 단일 통합 파일
├── 4. 계약변경/                  ← (사용 안함, CRM 통합)
├── 5. Team Input/               ← (선택, CRM 시트에 통합됨)
├── 6. 월간 통계자료/            ← 한/일/베트남 인바운드 통계
├── processed/                   ← CSV 캐시 + ytd_accumulator.json
├── output/                      ← 생성된 Excel + JSON + HTML
├── docs/                        ← GitHub Pages 배포본
└── .git/                        ← git remote: bstars00-rgb/-
```

---

## 데이터 소스 매핑

### 1. 로우데이터 (예약 데이터)

| 폴더 | 기준 | 형식 | 컬럼 차이 |
|---|---|---|---|
| 2025 Data | Check-out | CamelCase (BookingDate, BillingSumByCompanyCurrencyJPYAmount) | 11컬럼 |
| 2026 Jan-Feb | Check-out | 공백 (Booking Date, Billing Sum by Company Currency_JPY) | 24컬럼 |
| 2026 Mar+ | Check-out | 공백 + 75컬럼 풀 | 75컬럼 |
| Booking Date 폴더 | Booking | 동일 75컬럼 | |

**필요 컬럼 9개**: bookingDate, bookingItemCode, sellerName, sellerCountry, hotelCountry, checkOutDate, roomNights, billingJPY (TTV), bookingStatus, guestName (Last Name / First Name), revenueJPY (Billing Revenue), hotelName

### 2. CRM 파일 (단일 xlsx, 다중 시트)

| 시트 | 용도 |
|---|---|
| `CRM` | 채널 정보 + API 통합 진행률 (300행, 동적 컬럼 헤더 인식) |
| `Dev Schedule 2025-26` | 프로젝트 간트 데이터 (Category/Project/PIC/DevOwner/Status/Start/End) |
| `계약변경` | 컨트랙트 변경 추적 (No/Company/Settlement/Contract Date/Follow Up/완료일/Citi Bank) — 기존 17 + 신규 8 |
| `Ben`, `Grace`, `Jane`, `Jasmine` | 팀원별 주간 보고 (Date/Author/Channel/Type/Content/Action/Note) |
| `프로모션 현황`, `단체건` | 향후 프로모션/단체 입력용 |

**팀원 시트 주차 헤더 형식 (자동 인식)**:
- `April 13-17`, `April 20-24`
- `4/13~4/17`, `4/20 ~ 4/24`
- `4월13일~4월17일`, `4월21일`
- Excel serial (46115, 46134…)
- `4/21` 단일 날짜

### 3. 월간 통계 (`6. 월간 통계자료/`)

엑셀 시트: `한국 데이터`, `일본 그래프`, `베트남`
- Inbound, Outbound, YoY 증감 (월별)
- 데이터 출처 URL 포함 (visitkorea, jnto, tradingeconomics)

---

## 핵심 비즈니스 규칙

### 주간 기준
- **토요일 ~ 금요일** (7일)
- 인자: 토요일 날짜 (예: `2026-04-18`)
- ⚠️ `new Date('YYYY-MM-DD')`는 UTC 파싱 → 로컬 파싱 사용 (`new Date(y, m-1, d)`)

### 예약 상태 필터
- **Confirmed + Reserved** 포함
- Cancelled 제외
- 2025 데이터는 Status 컬럼 없음 (모두 Confirmed로 가정)

### 집계 키
- TTV (수탁고): `Billing Sum by Company Currency_JPY`
- Revenue: `Billing Revenue by Company Currency_JPY` (공백 2개 주의)
- 예약건수: `Booking Item Code` unique count
- RN: `Number Room Night(s)` 합계
- 채널: `Seller Name`
- 국가: `Hotel Country` → 일본/한국/베트남/기타 매핑

### 비교 기준
- **WoW**만 사용 (Booking Date 기준 동일)
- MoM/YoY 제거됨 (Booking Date vs Check-out 기준 불일치)
- 월별 실적 탭에서만 MoM/YoY 사용 (둘 다 Check-out 기준)

### Ctrip 의존도 계산
- Ctrip TTV%: `sellerName.toLowerCase().includes('ctrip') || includes('trip.com')` 의 TTV / 전체 TTV
- China B2B%: `sellerCountry === 'china'` 의 TTV / 전체 TTV
- Top3 Non-Ctrip%: Ctrip 제외 Top 3 채널 합산 비중
- 목표: Ctrip 35%↓, China 65%↓ (CEO OKR v9 KR6)

### 고객 국적 추정 (Last Name 패턴)
- Korean: KIM, LEE, PARK, CHOI, JUNG... (60+ 성씨)
- Chinese: WANG, LI, ZHANG, LIU, CHEN, WONG, CHAN...
- Japanese: SUZUKI, SATO, TANAKA...
- Vietnamese: NGUYEN, TRAN, LE...
- SEA, Indian, Thai 패턴별 매핑
- 100% 정확하지 않음 (참고용)

---

## 대시보드 탭 구조

| # | ID | 탭 이름 | 데이터 기준 | 자동/수동 |
|---|---|---|---|---|
| 1 | tab1 | 주간 실적 | Booking Date | 자동 |
| 2 | tab10 | 채널별 분석 | Booking Date | 자동 |
| 3 | tab2m | 월별 실적 (C/O) | Check-out | 자동 (월) |
| 4 | tab2 | API·채널 파이프라인 | CRM | 자동 |
| 5 | tab3 | 계약 변경·SG Flip | CRM/계약변경 | 자동 |
| 6 | tab4 | 프로모션·단체 | CRM 시트 | 자동 |
| 7 | tab5 | Exception Report | Team Input | 자동 |
| 8 | tab6 | 시장동향 | Google News RSS | 자동 |
| 9 | tab7 | 의사결정 요청 | 수동 입력 | 수동 |
| 10 | tab8 | Action Item (Weekly Sales Brief) | CRM 팀원 시트 | 자동 |
| 11 | tab9 | 월간 통계 | 월간 통계 xlsx | 자동 |

### 각 탭별 핵심 콘텐츠

#### ① 주간 실적
- KPI 카드 5개: Bookings, RN, TTV, Revenue, Ctrip%
- Channel Top 20 테이블 (Bookings/RN/TTV/Revenue + 각 WoW)
- Country Mix (도넛차트 + 테이블 + 합계)
- Daily Trend (4주 롤링 28일, TTV+Revenue 막대 / Bookings 라인, 주차 구분선)
- Ctrip / China Dependency Monitor (게이지 3개)

#### ② 채널별 분석
- 상단 채널 선택 버튼 (Top 20 채널, 첫 번째 자동 선택)
- 선택 채널의 KPI 5개 + Country Breakdown + Top Hotels (5)
- Booking Date 기준 표기

#### ③ 월별 실적 (C/O)
- **YTD 통합 카드** (1~3월 누적): Bookings, RN, TTV+YoY, Revenue, Margin
- Latest Month KPI 카드
- Monthly TTV/Revenue Trend 차트 (이중축, 막대+라인)
- Ctrip/China Dependency Trend 라인차트 (목표선 35%/65%)
- Monthly Summary 테이블 (15개월)
- Top Channels by Month (2026)
- Country by Month (2026)

#### ④ API·채널 파이프라인
- Pipeline Funnel (5단계)
- Pipeline Status 테이블 (16채널, 단계별)
- API Integration Dev Schedule (Gantt 차트)
  - Status별 색상: Live(초록), Testing(시안), In Development(파랑), NDA/Contract(노랑), Contact(회색)
- Dev Schedule 상세 테이블

#### ⑤ 계약 변경·SG Flip
- 기존 업체 17건 + 신규 업체 8건
- 컬럼: #, Company, Settlement, Contract Date, Follow Up, **완료일**, Citi Bank
- 진행률 요약 카드 4개 (전체/완료/진행 중/완료율)

#### ⑥ 프로모션·단체
- CRM의 프로모션 현황, 단체건 시트 자동 표시
- 비어있을 때 안내 메시지

#### ⑦ Exception Report
- Team Input의 Exception 시트 (있으면)
- 데이터 없으면 "이상 없음" 표시

#### ⑧ 시장동향
- **Market Insight 요약** (500자 미만, 자동 생성)
- 매크로 이슈 5건 (Google News RSS, 최근 7일)
- 경쟁 OTA 동향 (Agoda, Trip.com, Booking.com, Expedia, MakeMyTrip, Traveloka)
- (옵션) Claude API로 한국어 요약

#### ⑨ 의사결정 요청
- 수동 입력 테이블 (contenteditable)

#### ⑩ Action Item
- **Weekly Sales Brief** (전사 발표용, 3분 미만, 좌측 파란 테두리)
  - 오프닝 통계
  - 신규 채널 개발 (전체 항목)
  - 오픈/테스트
  - 프로모션/영업 (전체 항목)
  - 이슈 대응
  - 지역별 요약 (전체 채널 목록)
  - Next Week Focus (전체 액션)
- Summary KPI 4개 (Total/Channels/New Deals/Issues)
- Team Contribution 바 차트
- Activity by Category (전체 항목 표시, 자르기 없음)
- Regional Highlights (전체 항목)
- Key Next Actions

#### ⑪ 월간 통계
- **PDF Download 버튼** (window.print + new window)
- 한국/일본/베트남 인바운드/아웃바운드 + YoY 차트 + 테이블
- 데이터 출처 링크

---

## 다국어 (i18n)

- 헤더 우상단 **KR / EN 토글 버튼**
- `data-i18n="key"` 속성 기반 런타임 전환
- 차트 라벨도 자동 전환 (Country 차트 등)
- 모든 i18n 키는 `scripts/i18n.js`

---

## 기술적 세부사항

### 의존성 (package.json)
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.88.0",
    "exceljs": "^4.4.0",
    "xlsx": "^0.18.5",
    "xlsx-stream-reader": "^1.1.1"
  }
}
```

### 대용량 파일 처리
- 2025 73MB → `xlsx-stream-reader`로 SAX 스트리밍 파싱
- 528K 행 → 약 2분 / 메모리 안전

### 차트 라이브러리
- **ECharts 5** (CDN 인라인)
- TailwindCSS (CDN)
- 단일 HTML 번들 (오프라인 동작)

### CRM 컬럼 동적 인식
- 헤더 row의 텍스트 기반 `findIndex()` 사용
- 컬럼 추가/순서 변경에 자동 대응
- Status, Channel Name, 진행율 등 위치 변동 무관

### Status → 색상 매핑
```js
{
  'Live':'#10b981', 'Completed':'#10b981', 'Go-lived':'#10b981',
  'Testing':'#06b6d4',
  'In Development':'#3b82f6', 'In Progress':'#3b82f6',
  'NDA/Contract':'#f59e0b', 'Under Contract':'#f59e0b',
  'Contact':'#64748b', 'Planned':'#64748b', 'Pending':'#475569',
}
```

### YTD 누적 (`processed/ytd_accumulator.json`)
- 월별 / 채널×국가별 cfd, ttv, revenue 누적
- 새 데이터 추가 시 `ytd-accumulator.js` 재실행으로 갱신
- 현재 16개월 적재 (2025-01 ~ 2026-04)

### Daily Trend (4주 롤링)
- 보고 주 기준 직전 28일
- Booking Date 기준 일별 집계
- DoD (전일대비) 모든 지표
- 토요일에 주차 구분선

### News Fetcher (Google News RSS)
- HTTP 리다이렉트 자동 추적
- when=7d 필터 (최근 7일)
- 매크로 5건 + 6개 OTA 각 3건

### GitHub Pages 배포
- `docs/index.html` ← 최신 보고서 복사
- `docs/OMH_Weekly_Dashboard_YYYY-MM-DD.html` ← 아카이브
- 자동 git commit/push (no-verify 없음)

---

## 알려진 제약사항

1. **고객 국적 추정**은 성씨 패턴 기반 → 100% 정확하지 않음 (Others 분류 다수)
2. **Booking Date vs Check-out** 기준 차이로 MoM/YoY 비교 불가 (WoW만 사용)
3. **Anthropic API 키** 미설정 시 뉴스 한국어 요약 비활성화 (영어 원문만)
4. **개인정보**: 고객 이름이 CSV에 저장됨 (`processed/`는 .gitignore에 포함되어 외부 노출 안 됨)

---

## 향후 확장 아이디어

- ⑥ 프로모션/단체 데이터 자동 수집
- 매주 목요일 자동 알림 (Teams webhook)
- Daily 자동 데이터 업데이트 (cron + GitHub Actions)
- 다른 OMH 팀(SCM 등) 데이터 통합
- **Sales CRM으로 고도화** (별도 React + TypeScript 프로젝트로 진행 예정)
  - 참고: `C:\Users\LENOVO\Desktop\CRM\prototypes\sales-dashboard`
  - 11개 페이지 (Daily Briefing, Overview, Performance, CRM, Destination, Hotels, Trends, LiveMap, Calendar, Integration)
  - React 19 + Vite + TailwindCSS 4 + Recharts + react-router

---

## 주요 변경 이력

- v1: 초기 Excel 생성기
- v2: 단일 HTML 대시보드 (ECharts) + GitHub Pages 배포
- v3: 11개 탭 구조, KR/EN i18n, Weekly Sales Brief, 월간 통계 PDF
- v4: 채널별 분석 탭 분리, Daily Trend 4주 롤링, YTD 통합 카드
- v5: CRM 단일 파일 통합 (계약변경/팀원/프로모션 시트), 주차 필터링
- (다음): Sales CRM React 프로젝트로 마이그레이션

---

## 빠른 시작 (다른 환경에서)

```bash
# 1. 클론
git clone https://github.com/bstars00-rgb/-.git REPORT
cd REPORT

# 2. 의존성
npm install

# 3. 데이터 폴더 준비
mkdir -p "1. RawData_By Check Out" "2. RawData_By Booking Date" "3. CRM" "6. 월간 통계자료"
# 각 폴더에 xlsx 파일 배치

# 4. 실행
node scripts/run-weekly.js 2026-04-18

# 5. 결과
# output/OMH Global SnM Weekly Report_2026-04-18.xlsx
# output/OMH_Weekly_Dashboard_2026-04-18.html
# https://bstars00-rgb.github.io/-/ (자동 배포)
```
