import { renderPlace } from '../place';

export const dynamic = 'force-dynamic';

// ads: the ninth place (Ads PR 2); the view comes from ?view= (see app/ops/place.js): Campaigns, and the Audience library (Ads PR 4).
export default function Page(props) { return renderPlace('ads', props); }
