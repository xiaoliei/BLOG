export default function HudCorners({ version, session }) {
  return (
    <>
      <div className="hud-corner hud-tl">
        BLOG_OS // <b>{version}</b>
      </div>
      <div className="hud-corner hud-tr">
        SESSION <i>{session}</i> &nbsp;|&nbsp; MODE: BOOT
      </div>
    </>
  );
}
