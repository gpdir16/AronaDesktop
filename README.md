# 아로나 데스크탑

블루 아카이브의 캐릭터인 아로나를 실제 컴퓨터에서 AI 에이전트로 사용할수 있도록 만든 프로그램입니다.

제 다른 프로젝트인 [tabyAgent](https://github.com/gpdir16/tabyAgent)를 기반으로 설계되었으며, tabyAgent에서 지원하는 대부분의 기능들 (터미널 실행, 파일 읽기/쓰기, 브라우저 작업 등)을 사용할 수 있습니다.

> 블루 아카이브 및 아로나의 저작권은 모두 NEXON Korea Corporation에 있으며, 이 프로젝트는 개인적인 용도로만 사용 가능합니다.

## 설치 방법

macOS에서 개발 및 테스트 되었으며 Linux에서도 아마 돌아갈겁니다. Windows에서 구동은 테스트되지 않았습니다.

정식 배포는 계획에 없기 때문에, .app 형태로는 제공되지 않고 직접 빌드하거나 Node.js 환경에서 실행해야 합니다.

1. 저장소를 클론합니다.
    ```bash
    git clone https://github.com/gpdir16/AronaDesktop.git
    cd AronaDesktop
    ```
2. 패키지를 설치합니다.
    ```bash
    bun install # 또는 npm install
    ```
3. 앱을 실행한 다음 종료합니다.
    ```bash
    bun start # 또는 npm start
    # 실행이 완료되면 Control + C로 종료
    ```
4. `user/config.json` 파일을 열어 사용할 LLM API 키(OpenAI, OpenRouter 등)를 설정합니다.
5. 앱을 다시 실행합니다. 이제 사용할 준비가 되었습니다.
    ```bash
    bun start # 또는 npm start
    ```


## 개발 환경

- **Node.js**: v24 이상 권장
- **포맷팅**: 프로젝트는 Prettier를 사용합니다. 코드 작성 후 아래 명령어로 포맷팅할 수 있습니다.
    ```bash
    bun format # 또는 npm run format
    ```

## 스택

- **프레임워크**: [Electron](https://www.electronjs.org/) (Desktop App)
- **AI / LLM**: `openai` (Node.js SDK), [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk)
- **프론트엔드 (UI & 렌더링)**: Plain HTML/CSS/JS, [Spine WebGL](http://ko.esotericsoftware.com/)
- **토큰 계산**: `js-tiktoken`

## 프로젝트 구조

```text
AronaDesktop/
├── agent/       # tabyAgent 기반 AI 에이전트 로직 (LLM 클라이언트, 프롬프트, 도구, 스킬 등)
├── assets/      # Spine 모델 (.atlas, .skel) - 레포에 포함되지 않음, 직접 다운로드 필요
├── main/        # Electron 메인 프로세스 로직 (창 관리, IPC 핸들러, 로컬 서버)
├── renderer/    # Electron 렌더러 프로세스 프론트엔드 로직 (UI 상호작용, Spine 렌더링, 채팅 패널)
├── shared/      # 메인과 렌더러가 공유하는 코드 (IPC 채널 정보 등)
└── user/        # 사용자 설정 (API 키, 구성 정보, MCP 설정, 메모리, 커스텀 스킬) - 레포에 포함되지 않음, 자동으로 생성됨
```
