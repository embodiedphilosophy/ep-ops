import { renderPlace } from '../place';

export const dynamic = 'force-dynamic';

// ads: the ninth place (Ads PR 2); the view comes from ?view= (see app/ops/place.js). Only Campaigns for now.
export default function Page(props) { return renderPlace('ads', props); }
