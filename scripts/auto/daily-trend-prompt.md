# 데일리 트렌드 자동 업데이트 (헤드리스 · 매일 07:00 KST)

당신은 OMH 데일리 부킹 트렌드를 갱신·배포하는 자동화 작업을 수행합니다. 사용자 확인 없이 아래 절차를 끝까지 실행하세요.

## 절차
1. **엘리스 MCP 도구 로드**: ToolSearch 로 `get_hotel_bookings` 를 로드한다. (서버가 disconnected면 30초 후 1회 재시도, 그래도 없으면 3번으로 건너뛰지 말고 중단·로그만 남긴다.)

2. **최근 14일 부킹 수집 — 반드시 "하루씩" 당긴다**: `get_hotel_bookings` 를 호출한다.
   - ⚠️ 14일을 한 번에(`fromDate`~`toDate` 넓게) 당기지 말 것. 넓은 창은 최근 날짜가 쿼터를 먼저 채우고 과거 날짜가 **조용히 잘린다**(실측: 11-16~18이 3800건인데 수백 건으로 잘려 배포된 사고 있음).
   - 오늘(KST)부터 13일 전까지 **각 날짜마다 따로** 호출한다: `dateBasis: "BOOKING_DATE"`, `fromDate = toDate = <그 날짜>`.
   - 채널/국가 필터 없음(전체). 한 날짜 안에서 `limit: 1000`, `offset` 을 0, 1000, 2000, 3000 … 으로 늘려가며 **그 날짜의 `totalCount` 에 도달할 때까지** 모든 페이지를 받는다. (일별 3000~4000건이라 보통 offset 3000까지 간다.)
   - 큰 응답은 자동으로 파일에 저장되니, 응답의 파일 경로를 모아 Node/jq로 합친다.
   - 각 레코드에서 최소 `bookingItemCode, bookingDate, sellerName, hotelName, hotelCountry, hotelCity, roomNights, roomCount, paxCount, checkInDate, checkOutDate, billing, revenue, currency, fxRate, bookingStatus, cancelDate, contractType, paymentMethod` 를 유지한다.

3. **레코드 저장 + 날짜별 완전성 검증**: `bookingItemCode` 로 중복 제거한 배열을 `output/ellis-records.json` 에 저장한다.
   - 저장 전, **날짜별 수집 건수 == 그 날짜의 `totalCount`** 인지 확인한다. 오늘(진행 중인 당일)만 소폭 차이(±수 건)를 허용하고, **그 외 날짜가 totalCount에 못 미치면 모자란 offset을 다시 받아 채운다.** 끝내 못 채우면 4번 이후를 **중단**하고 로그에 `FAIL day=<날짜> got/total` 로 남긴다(이전 페이지 유지).

4. **집계 실행**:
   ```
   node scripts/build-daily-trend.js --records output/ellis-records.json
   ```
   콘솔에 `source: ellis-mcp` 와 asof/어제 예약/DoD 가 출력되는지 확인한다.

5. **페이지 생성**:
   ```
   node scripts/build-daily-trend-page.js
   ```

6. **배포**:
   ```
   node scripts/deploy-daily-trend.js
   ```
   `✅ 데일리 트렌드 배포 완료` 가 출력되면 성공.

7. **완료 로그**: `output/daily-trend-runlog.txt` 에 한 줄 추가 — `<실행시각 KST> OK asof=<asof> 어제=<건수> DoD=<%> topCh=<상위3>`. 실패 시 `FAIL <사유>` 로 남긴다.

## 주의
- **실데이터 수집 실패 시 배포하지 말 것** (이전 페이지 유지). 부분 페이지만 받았으면(totalCount 미달) 배포 금지.
- 취소건(bookingStatus에 cancel 포함)은 build 스크립트가 실현 RN/TTV·국가·채널 집계에서 자동 제외한다 — 별도 필터 불필요.
- 금액/마진/게스트명은 이 페이지에 노출되지 않음(집계만). 그대로 진행.
- 전체 절차는 무인 실행이다. 중간에 질문/확인을 요청하지 말 것.
