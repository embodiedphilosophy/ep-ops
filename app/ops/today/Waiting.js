import { HoursDecide } from '../people/HoursActions';

// "Waiting on your yes": one list for every area. Each line says what it is and who or when, and opens (or, for extra hours, decides through
// the same buttons and the same API as People › Hours) the place where the work is done.
export default function Waiting({ items }) {
  return (
    <section className="td-panel td-wait" id="waiting" aria-label="Waiting on your yes">
      <h2>Waiting on your yes <span>{items.reduce((n, w) => n + (w.count || 1), 0)}</span></h2>
      {items.length === 0 ? <p className="ops-empty">Nothing is waiting on you.</p> : (
        <ul>{items.map(w => (
          <li key={w.key}>
            <span className="t"><b>{w.title}</b>{w.detail && <small>{w.kind} · {w.detail}</small>}{!w.detail && <small>{w.kind}</small>}</span>
            {w.request ? <HoursDecide id={w.request.id} hours={w.request.hours} /> : <a className="chip" href={w.href}>{w.cta || 'Review'}</a>}
          </li>))}
        </ul>)}
    </section>
  );
}
