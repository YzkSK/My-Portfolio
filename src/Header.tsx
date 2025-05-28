import './Header.css';
import { Link } from 'react-router-dom';

export const Header = () => {
    const title: string = 'Header Component';

    return (
        <header className="header">
            <div>{title}</div>
            <nav>
                <ul>
                    <li>
                        <Link to="/">Home</Link>
                    </li>
                    <li>
                        <Link to="/test">Test</Link>
                    </li>
                </ul>
            </nav>
        </header>
    );
}