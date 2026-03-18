import { Header } from './Header'

export const Test = () => {
    const title: string = 'Test Page';

    return (
        <div className="Test portfolio-content">
            <Header />
            <h1>{title}</h1>
        </div>
    );
}