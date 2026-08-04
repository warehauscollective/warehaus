import { redirect } from 'next/navigation';

/** Chatroom is out of scope (D-H) — send deep links home. */
export default function ChatroomPage() {
  redirect('/');
}
