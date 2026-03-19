import './btn.css'

type BtnProps = {
  h: string;
  img?: string;
  c: string;
  name: string;
};

export const Btn = ({ h, img, c, name }: BtnProps) => {
  if (img === undefined) {
    return (
      <div className={c}>
        <div className='btn-container'>
          <a href={h} className='btn'></a>
          <p className='btn-text'>{name}</p>
        </div>
      </div>
    );
  } else {
    return (
      <div className={c}>
        <div className='btn-container'>
          <img src={img} className='btn-img' />
          <a href={h} className='btn'></a>
          <p className='btn-text'>{name}</p>
        </div>
      </div>
    );
  }
};