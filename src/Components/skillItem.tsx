type SkillItemProps = {
  c: string;
  img: string;
  skill: string;
};

export const SkillItem = ({ c, img, skill }: SkillItemProps) => {
  return (
    <div className={c}>
      <div className='Skill-container'>
        <img src={img} className='Skill-img' />
        <p className='Skill-text'>{skill}</p>
      </div>
    </div>
  );
}