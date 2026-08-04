import { redirect } from 'next/navigation';

/** Legacy Files deep link → Resources library. */
export default function FilesPage() {
  redirect('/resources');
}
