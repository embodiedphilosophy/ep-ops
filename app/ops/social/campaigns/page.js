import { redirect } from 'next/navigation';

// Coming up & campaigns moved onto Launches (one place to plan a launch: emails, social, pages, tasks)
export default function Page() { redirect('/ops/programs?view=launches#coming-up'); }
