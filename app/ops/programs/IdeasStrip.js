import { canEditEvents } from '@/lib/ops/nav';
import '../ads/ads.css';

// "Ideas from Ads" (Ads PR 5): the topic ideas a person pressed Send to Programs on, read from the dashboard's own database (never the calendar). Each is a DRAFT: nothing is in the
// Master Schedule, on the website or in a calendar until a person creates the real program through "Add a program". Only directors and the Ads role are shown this strip.
export default function IdeasStrip({ ideas, user }) {
  if (!ideas.length) return null;
  const editor = canEditEvents(user);
  return (
    <section className="pg-ideas" id="ideas-from-ads" aria-label="Ideas from Ads">
      <h2 className="ops-sub">Ideas from Ads <span>{ideas.length}</span></h2>
      <p className="sub">Draft ideas from the weekly read. They are not on the calendar or the website. “Create a program from this idea” opens Add a program with the title filled in, and you check and save it as usual.</p>
      <ul>{ideas.map(i => (
        <li key={i.id} className="ai-idea" data-idea={i.id}>
          <div className="ph"><b>{i.title}</b><span className="ads-pill warn">Draft</span></div>
          <p>{i.summary}</p>
          <p className="sub"><b>Fits:</b> {i.format} · <b>Aim it at:</b> {i.audience}</p>
          <details><summary>The evidence</summary><ul>{i.evidence.map(e => <li key={e.id}><b>{e.text}</b> {e.label}<span className="sub"> · {e.source} · {e.period}{e.low ? ' · too few to read a trend into' : ''}</span></li>)}</ul></details>
          <div className="soc-act">
            {editor ? <a className="soc-btn primary" href={`/ops/programs?idea=${encodeURIComponent(i.id)}`}>Create a program from this idea</a> : <span className="sub">Floss, Irene or Jacob can create the program from this idea.</span>}
            <a className="soc-btn" href="/ops/ads?view=insights">Back to the numbers</a>
          </div>
          <p className="sub">Sent by {i.sent_by}.</p>
        </li>))}</ul>
    </section>
  );
}
