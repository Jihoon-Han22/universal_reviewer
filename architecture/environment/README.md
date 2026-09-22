# 정확한 실행 환경과 설치

환경 캡처 시 관측값은 Node **v24.13.1**, npm **11.8.0**이다. 현재 감사 shell의 버전과 같은 뜻이 아니다(이번 감사에서 Node v24.21.0 관측). 루트 engines는 **>=22.13.0**이고 integrations는 >=22이다. PDF.js 6.3.289가 Node >=22.13.0 또는 >=24를 요구한다. 재현 기준 런타임은 캡처한 Node 24.13.1/npm 11.8.0으로 고정한다. 다른 런타임에서 수행한 검사는 실제 버전을 함께 기록하며 기준 런타임 검사를 했다고 주장하지 않는다. 브라우저 QA 버전은 screenshot manifest에 별도 기록한다. 로컬 Python은 제품 실행 전제가 아니며 Python 처리는 E2B에서 수행한다.

[versions.json](versions.json)은 **선언 범위 / lock 고정 / 설치 관측**을 구분한다. `root/package-lock.json`, `integrations/package-lock.json`이 transitive integrity까지 고정하는 설치 기준이다. `npm install`로 새 버전을 풀지 말고 `npm ci`를 두 위치에서 실행한다.

주요 실제 버전: React/ReactDOM 19.3.0, TypeScript 5.9.3, Vite 7.3.6, @vitejs/plugin-react 5.2.0, Motion 12.43.0, lucide-react 0.468.0, Recharts 3.10.1, react-chartjs-2 5.3.1, Chart.js 4.5.1, PDF.js 6.3.289, ExcelJS 4.4.0, mammoth 1.12.3, csv-parse 7.0.2, jszip 3.10.2, saxes 6.0.0, Express 5.2.1, multer 2.4.0, zod 4.6.5, esbuild 0.28.2, jsdom 26.1.0, @google/genai 2.23.0, e2b 2.51.0. 각 사용 책임은 UI 및 pipeline spec에서 규정한다.

## .env와 비밀 경계

설정 읽기: `process.env[name] ?? parseEnv(root/.env)[name] ?? ''`, 문자열 trim. 환경에 빈 문자열이 있으면 파일 값을 덮고 default/missing 규칙을 적용한다. config 객체 freeze. 실제 비밀 값은 패키지에 없다.

| 이름 | 기본값/규칙 | 사용 |
|---|---|---|
| GEMINI_API_KEY | 없음, 실제 Gemini 사용 시 빈 값이면 CONFIG_MISSING | 서버만 모델 호출 |
| E2B_API_KEY | 없음, 실제 E2B 사용 시 빈 값이면 CONFIG_MISSING | 서버만 sandbox 생성 |
| MODEL_EXTRACT | gemini-3.5-flash-lite | 추출/검토 호출 |
| MODEL_EXPLORE | gemini-3.5-flash-lite | 구조/범위 탐색 호출 |
| E2B_TEMPLATE | base | sandbox template |
| PORT | 8787 | **process.env에서만** server listen. `.env`만에 PORT를 써도 현재 index는 자동 적용하지 않음 |
| LLM_MODE | 실제 .env의 이름만 관측, 코드에서는 사용 안 함 | 모드 선택 필수변수로 구현하지 않음 |

모델 이름은 `^(?:models/)?[a-zA-Z0-9._-]+$`로 검증, 실패 CONFIG_INVALID. `.env` ENOENT는 허용, 다른 읽기 실패 CONFIG_READ. health는 configured boolean 및 model 이름만 반환. `VITE_*`로 키 노출 금지. 에러 출력에 SDK request/headers/env를 직렬화하지 않는다.

E2B Python 설치는 한 문서 세션당 1회: `openpyxl==3.1.5 python-docx==1.1.2 PyMuPDF==1.26.4 Pillow==11.3.0`. criteria workbook 전용 세션은 openpyxl==3.1.5. dashboard 세션 Node jsdom==26.1.0. base template의 OS/Python 버전과 transitive Python 패키지는 원본에서 완전 lock하지 않았으므로 provider 환경 해시/버전을 통합 증거에 기록한다. 이를 bitwise reproducible runtime이라 부르지 않는다.

## 최소 구조 / asset 생성

```text
./.env                         # 제공된 비밀, 덮어쓰지 않음
./golden/ ./ralph-golden-v3/     # 읽기 전용 검증 입력
./architecture/                # 이 패키지
./package.json ./package-lock.json ./tsconfig.json ./vite.config.ts ./index.html
./src/main.tsx ./src/App.tsx ./src/components/ ./src/*.css
./server/index.mjs ./server/app.mjs ./server/assets/
./integrations/package.json ./integrations/package-lock.json ./integrations/src/ ./integrations/scripts/
./scripts/ ./public/gspec.svg ./public/pdfjs/6.3.289/
./.cache/rebuild/               # 미래 구현 checkpoint/evidence, 비밀 제외
```

`node architecture/tools/bootstrap.mjs`는 metadata/config/아이콘/설치 후 asset 복사 도구만 제공한다. 핵심 앱·renderer·API는 PLAN에 따라 구현한다. 부트스트랩은 기존 다른 파일을 덮지 않는다. 아이콘은 [assets/gspec.svg](assets/gspec.svg). 기존 전체 소스/번들은 포함하지 않는다.

DM Sans와 Noto Sans KR은 [../ui/fonts/fonts.css](../ui/fonts/fonts.css)에 모든 사용 weight와 unicode subset을 자체 포함했다(126 WOFF2, 3,574,940 bytes, OFL 라이선스와 SHA manifest). bootstrap이 `public/fonts/`로 복사한다. 원본의 Google Fonts remote import 대신 `/fonts/fonts.css`를 import하여 외부망 없는 시각 재현을 보장한다. 이는 제품 동작을 바꾸지 않는 재현용 asset packaging 결정이다. system font fallback만으로 동일한 줄바꿈을 보장하지 않는다.

PDF.js worker는 Vite `pdf.worker.min.mjs?url` import로 번들. `/pdfjs/${pdfjsVersion}/` 아래 cmaps/standard_fonts/wasm/iccs 및 LICENSE를 node_modules에서 복사한다. PDF 생성 모델에 글꼴 포함을 맡기지 않는다. standalone 차트 runtime은 구현한 `scripts/dashboard-chart-entry.jsx`를 esbuild IIFE/minify/browser/es2020/production으로 `server/assets/dashboard-chart-runtime.js`에 만든다. prebuild에 두 asset 작업을 실행한다. dashboard chart entry는 05의 등록/렌더 계약으로 작성한다.

## 앱 구현 이후 실행 명령

```powershell
npm ci
npm --prefix integrations ci
npm --prefix integrations run check
npm test
npm run build
npm run dev
```

dev는 Node watch API 127.0.0.1:8787와 Vite 127.0.0.1:5180을 함께 실행한다. Vite는 strictPort이며 `/api`를 8787로 proxy한다. 개발 UI http://127.0.0.1:5180 . build 뒤 `npm start`는 8787에서 API+dist를 제공한다. dist는 서버 시작 시 존재해야 한다. 종료 시 **그 실행에서 시작한 두 child만** kill하고 진행 run 취소. 기존 서버 전역 kill 금지.

### Node 회귀와 별도 Python 회귀

`npm test`는 root의 Node test glob(server/components/integrations)을 실행하며 Python unittest는 포함하지 않는다. 원본 회귀의 별도 진입점은 프로젝트 루트에서 `python server/document-reader.test.py`다. 이는 새 구현자가 구현하는 sparse reader/requery/PDF 회귀의 위치이며 원본 테스트 파일이 패키지에 제공된다는 뜻은 아니다. 소유 알고리즘 명세의 동등 사례를 자신의 구현에 작성한다.

로컬 Python 회귀에는 실행 가능한 Python 3와 `openpyxl==3.1.5`가 필요하다. 실제 PDF 렌더 분기에는 `PyMuPDF==1.26.4`도 필요하다. 원본 테스트는 PyMuPDF가 없으면 두 실제 PDF 검사를 skip하므로 exit 0만으로 전체 회귀 통과를 선언하지 않는다. 전체 reader 형식을 함께 검사할 때 `python-docx==1.1.2`, `Pillow==11.3.0`도 설치한다. 필요한 패키지는 별도 가상환경에서 `python -m pip install openpyxl==3.1.5 PyMuPDF==1.26.4 python-docx==1.1.2 Pillow==11.3.0`로 준비한다. 원본은 로컬 Python patch 버전을 고정하지 않았으므로 실행 증거에 실제 `python --version`과 패키지 버전·skip 수를 기록한다. 이 로컬 시험 전제는 제품 서버 실행 전제와 다르다. 제품 Python은 E2B에서 실행된다.

원본 Python 시험은 unittest·임시 합성 문서와 읽기 전용 P01 PDF를 사용하고 sparse 하위 프로세스에 12초 제한을 둔다. 네트워크/모델/E2B 호출은 하지 않는다. child process 실행이 제한된 환경의 EPERM은 환경 실행 실패로 기록하며 통과로 바꾸지 않는다.

`npm --prefix integrations run check`는 `loadConfig/publicConfig`를 실행해 configured boolean과 모델 설정을 출력하며 키 값은 출력하지 않는다. 두 키가 없어도 설정 파싱 자체가 성공하면 exit 0/configured=false다. `requireKey`의 CONFIG_MISSING은 실제 해당 provider 사용 시 발생한다. `smoke`는 실제 Gemini+E2B 호출이며 비용·네트워크 전제가 있다. missing API keys / provider unavailable / network restrictions를 mock로 숨기지 않는다. 임의의 8791 보존 서버는 이 제품의 기본 포트가 아니다. 독립 QA는 비어 있는 포트와 별도 browser context를 사용한다.
