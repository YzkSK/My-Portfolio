import {Link} from 'react-router-dom';
import './App.css'


export const App = () => {
  const title : String = 'Hello World';

  return (
    <div className="App">
      <h1>{title}</h1>
      <Link to='/test'>
      ボタン
      </Link> 
    </div>
  )
}
