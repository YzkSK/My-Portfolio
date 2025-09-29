import Avatar from './assets/Profile.jpg'
import './App.css'

function App() {
  return (
    <div className="App">
      <h1 className="Title">Portfolio</h1>
      <div className="Profile">
        <div className="Avatar">
          <img className="Avatar" src={ Avatar } alt="Avatar" />
        </div>
        <div className='Profile-Text'>
          <div>
            <h2 className="Name">佐藤 康樹</h2>
          </div>
          <div className="Description">
            <p>気ままに開発してる人です。</p>
            <p>主にモバイルアプリケーションを開発</p>
            <p>最近、FlutterとReactに手を出しました。</p>
            <p>ゲーム / 音楽鑑賞が趣味です。</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
