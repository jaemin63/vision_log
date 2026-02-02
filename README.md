# Image Logger - 실행 가이드

NestJS 백엔드와 React 프론트엔드로 구성된 이미지 로거 애플리케이션입니다.

## 프로젝트 구조

```
image_logger/
├── backend/          # NestJS 백엔드
│   ├── src/
│   ├── images/      # 이미지 저장 디렉토리
│   └── package.json
│
└── frontend/        # React 프론트엔드
    ├── src/
    └── package.json
```

## 사전 요구사항

- Node.js (v20.16.0 이상 권장)
- npm

## 설치 및 실행

### 1. 백엔드 실행

```bash
# 백엔드 디렉토리로 이동
cd backend

# 의존성 설치 (최초 1회만)
npm install

# 개발 모드로 실행
npm run start:dev
```

**백엔드 실행 확인:**
- 서버가 `http://localhost:3000`에서 실행됩니다
- Health check: `http://localhost:3000/health`
- API: `http://localhost:3000/api/images`

**백엔드 스크립트:**
- `npm run start:dev` - 개발 모드 (ts-node, 핫 리로드)
- `npm run build` - 프로덕션 빌드
- `npm run start` - 프로덕션 실행 (빌드 후)

### 2. 프론트엔드 실행

**새 터미널 창에서:**

```bash
# 프론트엔드 디렉토리로 이동
cd frontend

# 의존성 설치 (최초 1회만)
npm install

# 개발 서버 실행
npm run dev
```

**프론트엔드 실행 확인:**
- 개발 서버가 `http://localhost:3001`에서 실행됩니다
- 브라우저에서 자동으로 열립니다

**프론트엔드 스크립트:**
- `npm run dev` - 개발 서버 실행 (Vite)
- `npm run build` - 프로덕션 빌드
- `npm run preview` - 빌드된 앱 미리보기

## 환경 변수 설정 (선택사항)

### 백엔드 환경 변수

`backend/.env` 파일 생성 (선택사항):

```env
# 이미지 디렉토리 경로 (기본값: ./images)
IMAGE_DIRECTORY=./images

# 서버 포트 (기본값: 3000)
PORT=3000

# CORS 허용 Origin (기본값: http://localhost:3001)
CORS_ORIGIN=http://localhost:3001

# Modbus/TCP 활성화 (기본값: false)
MODBUS_ENABLED=false
```

### 프론트엔드 환경 변수

`frontend/.env` 파일 생성 (선택사항):

```env
# 백엔드 API URL (기본값: http://localhost:3000)
VITE_API_URL=http://localhost:3000
```

## 빠른 시작

### 1. 백엔드 실행

```bash
cd backend
npm install  # 최초 1회만
npm run start:dev
```

### 2. 프론트엔드 실행 (새 터미널)

```bash
cd frontend
npm install  # 최초 1회만
npm run dev
```

### 3. 브라우저에서 확인

- 프론트엔드: `http://localhost:3001`
- 백엔드 Health: `http://localhost:3000/health`

## 테스트 이미지 추가

1. `backend/images/` 폴더에 이미지 파일 추가
   - 지원 형식: `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`
2. 브라우저에서 "Refresh" 버튼 클릭 또는 자동 새로고침

## 기능 테스트

### 1. 이미지 리스트 확인
- 좌측 패널에 이미지 목록 표시

### 2. 이미지 프리뷰
- 이미지 클릭 → 우측 패널에 프리뷰 표시

### 3. 전체 화면 오버레이
- "Fullscreen" 버튼 클릭 → 전체 화면 표시
- ESC 키로 닫기

### 4. 이벤트 시뮬레이션
- "Simulate Event" 버튼 클릭 → 랜덤 이미지로 이벤트 발생

### 5. 백엔드 이벤트 트리거 (테스트)

PowerShell:
```powershell
$body = @{ filename = "이미지파일명.jpg" } | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:3000/api/events/trigger" -Method POST -Body $body -ContentType "application/json"
```

또는 브라우저 콘솔:
```javascript
fetch('http://localhost:3000/api/events/trigger', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ filename: '이미지파일명.jpg' })
})
```

## 문제 해결

### 백엔드가 시작되지 않을 때
- 포트 3000이 사용 중인지 확인
- `backend/node_modules`가 설치되어 있는지 확인
- 콘솔 에러 메시지 확인

### 프론트엔드가 시작되지 않을 때
- 포트 3001이 사용 중인지 확인
- `frontend/node_modules`가 설치되어 있는지 확인
- Vite 에러 메시지 확인

### 이미지가 표시되지 않을 때
- `backend/images/` 폴더에 이미지 파일이 있는지 확인
- 브라우저 콘솔에서 네트워크 에러 확인
- 백엔드가 실행 중인지 확인

### WebSocket 연결 문제
- 백엔드가 실행 중인지 확인
- 브라우저 콘솔에서 Socket.IO 연결 메시지 확인
- 방화벽 설정 확인

## 개발 팁

### 백엔드 로그 확인
- 백엔드 터미널에서 실시간 로그 확인
- 이미지 이벤트 발생 시 로그 출력

### 프론트엔드 핫 리로드
- Vite가 자동으로 변경사항 반영
- 저장 시 자동 새로고침

### 디버깅
- 브라우저 개발자 도구 (F12)
- Network 탭: API 요청 확인
- Console 탭: 로그 및 에러 확인

## 프로덕션 빌드

### 백엔드 빌드
```bash
cd backend
npm run build
npm run start
```

### 프론트엔드 빌드
```bash
cd frontend
npm run build
# dist/ 폴더에 빌드된 파일 생성
```

## 추가 정보

- 백엔드 API 문서: `backend/MODBUS_INTEGRATION.md`
- 프로젝트 계획: `PLAN.md`
