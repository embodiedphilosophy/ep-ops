'use client';
import { useState } from 'react';

// Revenue and Meta ad spend by month (one dollar axis), with the plan as a tick on each revenue column.
// Colours validated for colour-blind readers on the ivory surface: revenue #2a78d6, ad spend #d95926.
const usd = n => `$${Math.round(n).toLocaleString('en-US')}`;
const nice = max => { const p = 10 ** Math.floor(Math.log10(max || 1)); return Math.ceil((max || 1) / p / 2) * p * 2; };

export default function Trend({ data, now }) {
  const [hover, setHover] = useState(null);
  if (!data.length) return <p className="ops-empty">No months with data yet.</p>;
  const W = 760, H = 260, L = 64, R = 8, T = 12, B = 30;
  const top = nice(Math.max(...data.map(d => Math.max(d.gross, d.ads, d.plan))));
  const y = v => T + (H - T - B) * (1 - v / top);
  const step = (W - L - R) / data.length, bw = Math.min(22, step / 3.2);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * top);
  const h = hover != null ? data[hover] : null;
  return (
    <figure className="ops-trend">
      <div className="legend"><span className="sw k-rev" /> Revenue <span className="sw k-ads" /> Meta ad spend <span className="sw k-plan" /> Plan</div>
      <div className="wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Revenue, ad spend and plan by month" onMouseLeave={() => setHover(null)}>
          {ticks.map(t => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" /><text x={L - 8} y={y(t) + 4} className="ax" textAnchor="end">{t >= 1000 ? `$${Math.round(t / 1000)}k` : `$${t}`}</text></g>)}
          {data.map((d, i) => {
            const x = L + step * i + step / 2, base = y(0);
            const col = (v, dx, cls) => v > 0 && <path className={cls} d={`M${x + dx - bw / 2},${base} V${y(v) + 4} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${base} Z`} />;
            return (
              <g key={d.month}>
                <rect x={L + step * i} y={T} width={step} height={H - T - B} className="hit" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${d.label}: revenue ${usd(d.gross)}, ad spend ${usd(d.ads)}, plan ${usd(d.plan)}`} />
                {col(d.gross, -bw / 2 - 1, 'k-rev')}
                {col(d.ads, bw / 2 + 1, 'k-ads')}
                {d.plan > 0 && <line x1={x - bw - 5} x2={x + 3} y1={y(d.plan)} y2={y(d.plan)} className="k-plan" />}
                <text x={x} y={H - 10} className={`ax${d.month === now ? ' now' : ''}`} textAnchor="middle">{d.label}</text>
              </g>
            );
          })}
          <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="base" />
        </svg>
        {h && (
          <div className="tip" style={{ left: `${((L + step * hover + step / 2) / W) * 100}%` }}>
            <b>{h.label}{h.month === now ? ' (so far)' : ''}</b>
            <span><i className="sw k-rev" />Revenue {usd(h.gross)}</span>
            <span><i className="sw k-plan" />Plan {usd(h.plan)}</span>
            <span><i className="sw k-ads" />Ad spend {usd(h.ads)}</span>
            {h.ads > 0 && <span>ROAS {h.roas.toFixed(2)}×</span>}
          </div>
        )}
      </div>
      <details className="ops-tableview"><summary>Show as a table</summary>
        <table className="ops-table"><thead><tr><th>Month</th><th className="r">Revenue</th><th className="r">Plan</th><th className="r">Ad spend</th><th className="r">ROAS</th></tr></thead>
          <tbody>{data.map(d => <tr key={d.month}><td>{d.label}</td><td className="r">{usd(d.gross)}</td><td className="r">{usd(d.plan)}</td><td className="r">{usd(d.ads)}</td><td className="r">{d.ads ? `${d.roas.toFixed(2)}×` : '—'}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}
