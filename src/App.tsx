import {Link} from 'react-router-dom';
import { Header } from './Header'
import './App.css'


export const App = () => {
  const title : String = 'Hello World';

  return (
    <div className="App">
      <Header />
      <h1>{title}</h1>
      <Link to='/test'>
      ボタン
      </Link>
    </div>
  )
}
