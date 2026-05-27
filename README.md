# 소상공인 메뉴 주문·접수 지원 플랫폼

> 민간 테이블오더의 수수료 부담을 해결하기 위한 공공지원형 무료 QR 주문 플랫폼

## 팀원
신선경 / 김경환 / 김우진 | 지도교수: 방효은 교수님 | 트랙 A

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프론트엔드 | React (Vite) |
| 데이터베이스 | Supabase (PostgreSQL + Realtime) |
| 다국어 | i18next |
| AI 백엔드 | Python FastAPI |
| ML 모델 | scikit-learn (RandomForest, 코사인 유사도) |
| 배포 | Vercel |

---

## 주요 기능

### 고객 주문 화면
- QR 코드 스캔으로 메뉴 확인 및 주문
- AI 기반 조리시간 예측 (RandomForest Regressor)
- 협업 필터링 기반 메뉴 추천 (코사인 유사도)
- 장바구니 수량 수정
- 음성 주문 (Web Speech API)
- 직원 호출
- 4개국어 지원 (한/영/중/일)
- 주문 접수·완료 실시간 팝업 (Supabase Realtime)

### 주방 디스플레이
- 실시간 주문 접수
- 대기/조리중 컬럼 분리
- 직원 호출 실시간 알림

### 관리자 대시보드
- 매출 통계 및 차트
- Python AI 예측 패널 (주문수·피크타임·인기메뉴)
- 메뉴 추가/삭제/사진/재고 관리

---

## ML 모델

| 기능 | 모델 | Input | Output |
|------|------|-------|--------|
| 내일 예상 주문수 | RandomForest Regressor | 요일 | 주문수 |
| 피크타임 예측 | RandomForest Regressor | 시간대 | 주문수 |
| 조리시간 예측 | RandomForest Regressor | 시간대·요일·대기수 | 분 |
| 시간대별 인기 메뉴 | RandomForest Classifier | 시간대·요일 | TOP3 메뉴 |
| 요일별 인기 메뉴 | RandomForest Classifier | 시간대·요일 | TOP3 메뉴 |
| 메뉴 추천 | 코사인 유사도 | 주문-메뉴 행렬 | 추천 메뉴 |

---

## 배포 링크

| 화면 | URL |
|------|-----|
| 고객 주문 (1번) | https://qr-order-app-nine.vercel.app/menu/1 |
| 고객 주문 (2번) | https://qr-order-app-nine.vercel.app/menu/2 |
| 고객 주문 (3번) | https://qr-order-app-nine.vercel.app/menu/3 |
| 주방 디스플레이 | https://qr-order-app-nine.vercel.app/kitchen |
| 관리자 화면 | https://qr-order-app-nine.vercel.app/admin |
| QR 코드 관리 | https://qr-order-app-nine.vercel.app/qr |

---

## 실행 방법

### 프론트엔드
```bash
cd qr-order-app
npm install
npm run dev
```

### AI 백엔드
```bash
cd qr-order-backend
venv\Scripts\activate
uvicorn main:app --reload
```