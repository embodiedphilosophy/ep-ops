// Today's count cards: a label, a big serif number, one line of context. The whole card is a link into the place where the work is done.
// `cards` is built by the page from what it already read; it only holds the cards this person may open.
export default function Cards({ cards }) {
  if (!cards.length) return null;
  return (
    <div className="td-cards" role="list">
      {cards.map(c => (
        <a key={c.key} role="listitem" href={c.href} className={`ops-tile td-card${c.tone === 'late' ? ' late' : ''}`}>
          <span className="l">{c.late && <i aria-hidden="true" />}{c.label}</span>
          <span className="n">{c.n ?? '–'}</span>
          <span className="l sub">{c.detail || ' '}</span>
        </a>
      ))}
    </div>
  );
}
