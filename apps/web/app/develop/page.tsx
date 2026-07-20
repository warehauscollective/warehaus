import { redirect } from 'next/navigation';

export default function DevelopPage() {
  redirect('/?tab=develop');
}
