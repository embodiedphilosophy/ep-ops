import { renderPlace } from '../place';

export const dynamic = 'force-dynamic';

// publish: one of the eight places; the view comes from ?view= (see app/ops/place.js)
export default function Page(props) { return renderPlace('publish', props); }
