import { redirect } from 'next/navigation';

/** Legacy Docs deep link → Resources library. */
export default function DocsPage() {
  redirect('/resources');
}
