import './Header.css';
import { Link } from 'react-router-dom';

export const Header = () => {
    const title: string = 'My Portfolio';

    return (
        <header className="header">
            <div>
                <Link to="/">{title}</Link> 
            </div>
            <nav>
                <ul className="nav-list">
                    <li className="nav-item">
                        <Link to="/">Home</Link>
                    </li>
                    <li className="nav-item">
                        <Link to="/test">Test</Link>
                    </li>
                </ul>
            </nav>
        </header>
    );
}