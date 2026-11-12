# 매물 홍보 비서 v2

매물 정보를 이용한 템플릿 / 실제 AI 홍보 문구 작성 도구입니다. 블로그, SNS, 소개 카드, 30초 세로 영상 대본을 지원합니다.

## 로컬 실행

Node.js 22 이상이 필요합니다.

```sh
pnpm install --frozen-lockfile
# .env.example을 .env.local로 복사하고 편집기에 자신의 키를 입력
pnpm dev
```

npm 사용 시 `npm install` 후 `npm run dev`로 실행할 수 있습니다. http://127.0.0.1:4173 을 엽니다. 키 없이도 템플릿은 동작합니다. HTML을 직접 여는 방식은 서버 API를 사용할 수 없습니다.

## AI 환경변수

| 이름 | 용도 |
| --- | --- |
| OPENAI_API_KEY | 실제 OpenAI API 키. 서버에서만 읽음 |
| OPENAI_MODEL | 계정에서 사용 가능한 Responses/구조화 출력 모델. 기본 gpt-6-luna |
| PORT | 로컬 포트. 기본 4173 |

[OpenAI 키 발급](https://platform.openai.com/api-keys)

실제 키를 채팅, GitHub, 브라우저 JavaScript 또는 로그에 붙여넣지 마세요. `.env.local`은 Git에서 제외됩니다. `.env.example`만 공유합니다. 키 수정 후 로컬 서버를 재시작하세요. API 사용은 연결 계정의 사용량에 반영됩니다.

## Vercel 배포

GitHub `harunangman-lab/agent1`을 연결합니다. 저장소 루트, Framework Other, Output Directory `dist`, Build Command 빈칸을 사용합니다. Install Command는 기본값으로 두고 설치를 생략하지 마세요.

`vercel.json`에 정적 경로가 설정되어 있고 루트 `api/*.js`는 Node.js Functions입니다. `dist`만 별도로 올리면 AI 서버가 빠지므로 전체 프로젝트를 배포해야 합니다.

Vercel Project Settings → Environment Variables에서 `OPENAI_API_KEY`를 Sensitive 값으로 저장하고 `OPENAI_MODEL`을 설정합니다. 사용할 Production/Preview 환경을 지정한 뒤 Redeploy하세요. 실제 키는 GitHub에 넣지 않습니다.

배포 후 `/api/config`의 `configured`로 변수 존재 여부를 확인할 수 있습니다. 키·잔액·모델 권한의 유효성을 보장하는 검사는 아닙니다. 실제 AI 생성 성공으로 확인해야 합니다. 예전 ChatGPT Sites 정적 배포에는 Vercel Functions 구성이 자동 반영되지 않습니다.

## 동작

- 템플릿은 브라우저에서, AI 생성은 서버에서 OpenAI Responses API를 호출합니다.
- AI SDK 구조화 출력을 사용하고 `store:false`를 설정합니다. 입력·출력·키를 로그에 기록하지 않습니다.
- 결과는 모드/콘텐츠 유형별로 보관하여 전환해도 수정본이 유지됩니다.
- 제목·본문·문의 문구를 수정할 수 있고 복사·TXT는 현재 수정본을 사용합니다.
- 작성 중 입력과 버튼을 잠그고 중복 요청을 막습니다. 실패하면 입력과 이전 결과를 유지하고 수동 재시도를 제공합니다. 템플릿으로 몰래 대체하지 않습니다.
- 사용한 정보와 확인 사항은 접이식으로 표시합니다. 확인 사항은 홍보 본문·AI 입력·내보내기에서 제외됩니다.

## 데이터 처리와 검증 범위

허용된 입력 항목만 처리하고 상세 주소는 공개 선택 시에만 사용합니다. 전화번호·이메일·고객/소유자 표시·지시문 패턴을 감지해 해당 줄을 제외합니다. 사무소와 홍보용 연락처는 모델에 보내지 않고 서버가 문의 문구에 붙입니다.

모델은 입력 사실 ID를 인용하고 제공된 해시태그만 사용합니다. 서버는 응답 형식, 사실 ID, 미입력 숫자, 개인정보 및 일부 과장 표현을 검사합니다. 모든 의미상의 허위 사실이나 개인정보를 판별하는 기능은 아닙니다. 게시 전 원자료와 대조하세요. 직접 수정한 결과는 자동 사실 검증하지 않습니다. 영상은 대본만 만듭니다.

20KB 요청 제한, 45초 AI 타임아웃, 동일 클라이언트 동시 요청 제한, 인스턴스당 10분 8회 제한을 적용합니다. 이 제한은 서버리스 인스턴스 간 공유되지 않으며 인증·결제·분산 요청 제한을 대체하지 않습니다.

## 구조

- `dist/`: 화면, 편집, 템플릿, 공개 데이터 정리
- `lib/ai-service.js`: 서버 AI 호출·응답 검사
- `lib/http-api.js`: 로컬/Vercel 공통 API
- `api/config.js`, `api/generate.js`: Vercel Functions
- `server.mjs`: 로컬 정적 서버·API·환경변수 로드
- `.env.example`: 빈 키와 모델 설정 예시
- `tests/`: 개인정보, SDK 요청/응답, 오류·중복 요청 검증

## 검증

```sh
pnpm test
```

SDK 성공/오류 테스트는 외부 호출을 가로채는 fixture를 사용하며 실제 키를 요구하지 않습니다. 실서비스 AI 호출 성공을 의미하지 않습니다. 실제 호출 검증에는 유효한 키와 모델 접근 권한이 필요합니다.

참고: [OpenAI 구조화 출력](https://developers.openai.com/api/docs/guides/structured-outputs), [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js).
