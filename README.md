# 영어문장모음집

소리 내어 복습하는 개인용 문장 학습 PWA. 백엔드 없음, 모든 데이터는 기기 안에 저장.
자세한 기능 명세는 [ebs-review-app-spec.md](./ebs-review-app-spec.md) 참고.

## 로컬에서 실행

```bash
npm install
npm run dev      # http://localhost:5173/speaking-app/
npm run build    # dist/ 에 배포용 파일 생성
npm run preview  # http://localhost:4173/speaking-app/ (빌드 결과 확인)
```

주소 끝의 `/speaking-app/`까지 포함해서 열어야 한다. GitHub Pages 하위 경로와 맞추기 위한 설정.

## GitHub Pages 배포

1. GitHub에서 **public** 저장소를 만든다. 이름은 `speaking-app`
   (다른 이름으로 만들려면 `vite.config.js`의 `REPO_NAME`을 그 이름으로 바꿀 것)
2. 이 폴더를 그 저장소에 올린다

   ```bash
   git remote add origin https://github.com/<계정>/speaking-app.git
   git branch -M main
   git push -u origin main
   ```

3. 저장소 → **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꾼다
4. Actions 탭에서 배포가 끝나면 `https://<계정>.github.io/speaking-app/` 에서 열린다

## 키 관리

Azure 키는 **코드나 저장소에 절대 넣지 않는다.** 앱의 설정 화면에서 직접 입력해 기기 저장소에만 보관한다.
`.env`, `secrets.json` 등은 `.gitignore`에 등록돼 있다.

## 구성

| 경로 | 설명 |
|---|---|
| `vite.config.js` | base 경로, PWA manifest·서비스워커, Azure SDK용 `global` 정의 |
| `src/styles/tokens.css` | 색·서체·간격 토큰 (라이트/다크) |
| `src/styles/base.css` | 공통 레이아웃·카드·버튼 |
|  | IndexedDB 열기·스토어 정의, 저장소 영구 보관 요청 |
|  | 전역 설정 읽기/쓰기, Azure 키·지역 연결 확인 |
|  | 해시 라우팅 (안드로이드 뒤로가기 대응) |
|  | 화면별 컴포넌트 (홈, 설정) |
|  | 새 버전 감지 시 "새로고침" 안내 |
| `scripts/make-icons.mjs` | 앱 아이콘 PNG 생성 (`node scripts/make-icons.mjs`) |
| `.github/workflows/deploy.yml` | main 브랜치 push 시 자동 배포 |
