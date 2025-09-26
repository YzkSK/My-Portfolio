export const skillItem = ({c, img, skill}: any) => {
    return (
        <div className={c}>
            <div className='Skill-container'>
                <img src={img} className='Skill-img' />
                <p className='Skill-text'>{skill}</p>
            </div>
        </div>
    );
}