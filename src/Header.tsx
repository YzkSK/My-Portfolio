import './Header.css';
import { Link } from 'react-router-dom';

export const Header = () => {
    const title: string = 'Portfolio';

    return (
        <header className="header">
            <div>
                <Link to="/">{title}</Link> 
            </div>
            {/* <nav>
                <ul className="nav-list">
                    <li className="nav-item">
                        <a href="#Profile">Profile</a>
                    </li>
                    <li className="nav-item">
                        <a href="#Academic">Academic</a>
                    </li>
                </ul>
            </nav> */}
        </header>
    );
}