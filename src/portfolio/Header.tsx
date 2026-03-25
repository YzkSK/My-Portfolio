import './Header.css';
import { Link } from 'react-router-dom';

export const Header = () => {
    return (
        <header className="header">
            <div>
                <Link to="/">Portfolio</Link>
            </div>
        </header>
    );
}
