import { Header } from './Header'
import { Btn } from './Components/btn'

import './App.css'


export const App = () => {
  const title : String = '佐藤 康樹';

  return (
    <div className="App">
      <Header />
      <div className="container">
        <h1 id="Profile" className="Profile-title">Profile</h1>
        <div className='Profile'>
          <img src="./src/img/Profile.jpg" alt="Profile" className='Profile-image' />
          <div className="Profile-Text">
            <h1 className='Profile-Name'>{title}</h1>
            <p>主にKotlin/Swiftなどのモバイルアプリケーション開発を行ってる端くれです。
              <br />
              最近はFlutterやReactにも手を出しはじめました。
            </p>
            <div className="test">
              <Btn h="" c='btn-child' img="./src/img/mark-github-24.svg" name="GitHub" />
              <Btn h="" c='btn-child' img="./src/img/logo-black.png" name="X" />
              <Btn h="" c='btn-child' name="LINE" />
            </div>
          </div>
        </div>

        <div className='Academic-Career'>
          <div id='Academic' className='Academic'>
            <h1 className='Academic-title'>学歴</h1>
            <ul className='Academic-list'>
              <li className='Academic-item'>
                <p className='Academic-time'>2024年3月</p>
                <p className='Academic-text'>角川ドワンゴ学園N高等学校 卒業</p>
              </li>
              <li className='Academic-item'>
                <p className='Academic-time'>2024年4月 〜 現在</p>
                <p className='Academic-text'>武蔵野大学 在学中</p>
              </li>
            </ul>
          </div>
          <div id='Career' className='Career'>
            <h1 className='Career-title'>職歴</h1>
            <ul className='Career-list'>
              <li className='Career-item'>
                <p className='Career-time'>2024年6月 〜 現在</p>
                <p className='Career-text'>プログラミング教室 HALLO</p>
              </li>
            </ul>
          </div>
        </div>
        <div className='Skill'>
          <h1 className='Skill-title'>Skill</h1>
          <div className='Skill-list'>
          </div>
        </div>
      </div>
    </div>
  )
}
