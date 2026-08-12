export default function LandingClock({ time, date, className = '' }) {
  const [hh, mm] = time.split(':');
  return (
    <div className={`landing-clock${className ? ` ${className}` : ''}`}>
      <div className="time">
        {hh}
        <span className="colon">:</span>
        {mm}
      </div>
      <div className="date">{date}</div>
    </div>
  );
}
