import {Link} from 'react-router-dom';
import { Header } from './Header'
import './App.css'


export const App = () => {
  const title : String = '佐藤 康樹';

  return (
    <div className="App">
      <Header />
      <h1>{title}</h1>
      <ul>
        <li className="App-list">
          あいうえお
        </li>
        <li className="App-list">
          かきくけこ
        </li>
        <li className="App-list">
          さしすせそ
        </li>
        <li className="App-list">
          たちつてと
        </li>
        <li className="App-list">
          なにぬねの
        </li>
        <li className="App-list">
          はひふへほ
        </li>
        <li className="App-list">
          まみむめも
        </li>
        <li className="App-list">
          やゆよ
        </li>
        <li className="App-list">
          らりるれろ
        </li>
        <li className="App-list">
          わをん
        </li>
      </ul>
    </div>
  )
}
