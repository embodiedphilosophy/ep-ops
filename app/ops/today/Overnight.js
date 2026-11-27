// "What happened overnight": what the automatic jobs and other people changed since yesterday evening, from the Change Log.
export default function Overnight({ log }) {
  return (
    <section className="td-panel td-night" aria-label="What happened overnight">
      <h2>What happened overnight</h2>
      {!log.ok ? <p className="ops-empty">The change history couldn’t be read just now. Reload in a minute.</p>
        : log.lines.length === 0 ? <p className="ops-empty">Nothing changed since yesterday evening.</p> : (
          <ul>{log.lines.map((l, i) => (
            <li key={i}><span className="when">{l.when}</span><span className="what">{l.text}</span>{l.href ? <a href={l.href}>Open</a> : <span />}</li>))}
          </ul>)}
      {log.more > 0 && <p className="ops-more">and {log.more} earlier {log.more === 1 ? 'change' : 'changes'}</p>}
    </section>
  );
}
