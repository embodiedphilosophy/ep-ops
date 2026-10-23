'use client';
import { useEffect, useState } from 'react';

const when = iso => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

// Each survey: its times, how many mentees chose each (most popular marked), who chose it, and who hasn't answered yet.
export default function PollResults() {
  const [data, setData] = useState(null);
  const load = async () => {
    setData(null);
    const res = await fetch('/api/ops/polls').catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setData(res?.ok ? j : { error: j?.error || 'Couldn’t load the results. Try again.' });
  };
  useEffect(() => { load(); }, []);
  if (!data) return <p className="ops-empty">Loading…</p>;
  if (data.error) return <p className="ops-empty">{data.error} <button className="chip" onClick={load}>Try again</button></p>;
  return (
    <section className="ops-polls">
      <p className="ops-empty">Times show in your own time zone. To change the options or confirm a time, edit the survey in <a href="/ops/settings?t=mpolls">Settings → Sahṛdaya Upāya → Polls</a> (set Final = Yes on the chosen time).{' '}<button className="chip" onClick={load}>Refresh</button></p>
      {!data.votesOn && <p className="ops-empty" role="alert">Answers aren’t connected in this environment, so counts show as zero.</p>}
      {!data.polls.length && <p className="ops-empty">No survey is open. Add one under Settings → Sahṛdaya Upāya → Polls.</p>}
      {data.polls.map(p => {
        const top = Math.max(0, ...p.options.map(o => o.count));
        return (
          <div key={p.id} style={{ margin: '18px 0' }}>
            <h2 style={{ margin: '0 0 4px' }}>{p.title}</h2>
            <p className="ops-empty">{p.answered} of {data.cohort} mentees have answered{p.final ? ` · confirmed: ${when(p.final)}` : p.closes ? ` · closes ${when(p.closes)}` : ''}</p>
            <ul className="ops-site-rows">
              {p.options.map(o => (
                <li key={o.start} style={{ padding: '8px 0' }}>
                  <strong>{when(o.start)}</strong>{' '}
                  <span>· {o.count} {o.count === 1 ? 'person' : 'people'}{top > 0 && o.count === top ? ' · most popular' : ''}{p.final === o.start ? ' · confirmed' : ''}</span>
                  {o.people.length > 0 && <div className="ops-empty">{o.people.join(', ')}</div>}
                </li>
              ))}
            </ul>
            {p.waiting.length > 0 && <p className="ops-empty">Haven’t answered yet: {p.waiting.join(', ')}</p>}
          </div>
        );
      })}
    </section>
  );
}
