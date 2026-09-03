import { navigate } from '../router.js'

export default function Home() {
  return (
    <>
      <header className="head">
        <h1 className="serif head__title">영어문장모음집</h1>
        <hr className="rule-line" />
        <p className="muted">소리 내어 복습하는 나만의 문장 노트</p>
      </header>

      <section className="card stack">
        <h2 className="section-title">폴더</h2>
        <p className="muted">
          아직 폴더가 없습니다. 폴더 만들기와 카드 관리는 3단계에서 붙습니다.
        </p>
      </section>

      <section className="card stack">
        <h2 className="section-title">시작하기 전에</h2>
        <p className="muted">
          말하기 채점을 쓰려면 설정 화면에서 Azure 키와 지역을 먼저 넣어야 합니다.
        </p>
        <button className="btn btn--full" onClick={() => navigate('/settings')}>
          설정 열기
        </button>
      </section>
    </>
  )
}
