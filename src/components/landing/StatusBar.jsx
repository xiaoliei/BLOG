import { SITE, SYS_INIT } from '../../config/site';

export default function StatusBar({ time, coords, uptime, upSpeed }) {
  return (
    <div className="status-bar">
      <span className="sb-item">
        <span className="lb">SYS</span>
        <span className="vl">{SITE.name}</span>
      </span>
      <span className="sb-item">
        <span className="lb">TASK</span>
        <span className="vl">{uptime}</span>
      </span>
      <span className="sb-coords sb-item">
        <span className="c">X</span>
        {' '}
        {coords.x.toFixed(2).padStart(8, ' ')}
        &nbsp;&nbsp;
        <span className="c">Y</span>
        {' '}
        {coords.y.toFixed(1).padStart(5, ' ')}
        &nbsp;&nbsp;
        <span className="c">Z</span>
        {' '}
        {coords.z.toFixed(2).padStart(8, ' ')}
      </span>
      <span className="sb-item">
        <span className="lb">NET</span>
        <span className={`net-state ${SYS_INIT.net.state.toLowerCase()}`}>{SYS_INIT.net.state}</span>
      </span>
      <span className="sb-item">
        <span className="lb">TX</span>
        <span className="vl">{upSpeed}</span>
      </span>
      <span className="sb-item">
        <span className="lb">{SITE.timezone}</span>
        <span className="vl">{time}</span>
      </span>
    </div>
  );
}
