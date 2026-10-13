// "This week": programming and team meetings, side by side (or stacked in Today's right-hand column).
// The join link is a button, never a raw URL.
const day = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
const dm = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function Meetings({ programming, team, director, stacked = false }) {
  return (
    <div className={`ops-week${stacked ? ' stacked' : ''}`}>
      <section>
        <h2>{stacked ? 'Programming this week' : 'Programming'} <span>{programming.length || ''}</span></h2>
        {programming.length === 0 ? <p className="ops-empty">No programming in the next seven days.</p> : (
          <ul className="ops-meet">
            {programming.map(m => (
              <li key={m.id}>
                <div className="d">{day(m.date)}<small>{dm(m.date)}{m.time ? ` · ${m.time}` : ''}</small></div>
                <div className="t">{m.title}</div>
                <div className="w">{[m.teachers && `Teaching: ${m.teachers}`, m.course_host && `Host: ${m.course_host}`].filter(Boolean).join(' · ') || m.owner}</div>
                <div className="z">
                  {m.join_url
                    ? <a className="join" href={m.join_url} target="_blank" rel="noopener">Join</a>
                    : <span className={`nolink${director ? ' bad' : ''}`} title={director ? 'Add it in the Event Details Zoom Link column, or set Zoom to one-off or series' : undefined}>No link yet</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2>{stacked ? 'Team meetings this week' : 'Team meetings'} <span>{team.meetings.length || ''}</span></h2>
        {team.error ? <p className="ops-empty">Couldn’t load team meetings: {team.error}</p>
          : team.meetings.length === 0 ? <p className="ops-empty">No team meetings you’re invited to this week.</p> : (
          <ul className="ops-meet">
            {team.meetings.map(m => (
              <li key={m.id}>
                <div className="d">{String(m.day || '').slice(0, 3).toUpperCase()}<small>{String(m.day || '').replace(/^\w+,\s*/, '').replace(/^(\w{3})\w*/, '$1')} · {m.time}</small></div>
                <div className="t">{m.title}</div>
                <div className="w">{m.who ? `With ${m.who}` : ''}</div>
                <div className="z">{m.link && <a className="join quiet" href={m.link} target="_blank" rel="noopener">Join</a>}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
