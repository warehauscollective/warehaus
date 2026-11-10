/**
 * The submit control stays "Sign in" until the person submits.
 * Link-status loading is not a submit: an untouched form was painting a
 * grey "Working…" while getLinkStatus was still in flight, including the
 * server render that hydrates into that label.
 */
export function signInSubmitState(input: {
  mode: 'signin' | 'register';
  busy: boolean;
  joining: boolean;
}): { pending: boolean; label: string } {
  const pending = input.busy || input.joining;
  if (!pending) {
    return { pending, label: input.mode === 'signin' ? 'Sign in' : 'Create account' };
  }
  return {
    pending,
    label: input.mode === 'register' ? 'Creating account…' : 'Working…',
  };
}
