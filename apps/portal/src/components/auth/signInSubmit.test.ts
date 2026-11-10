import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { signInSubmitState } from './signInSubmit';

describe('sign-in submit label', () => {
  it('reads Sign in until the form is submitted, even while the link query is loading', () => {
    const untouched = signInSubmitState({ mode: 'signin', busy: false, joining: false });
    assert.equal(untouched.pending, false);
    assert.equal(untouched.label, 'Sign in');

    const working = signInSubmitState({ mode: 'signin', busy: true, joining: false });
    assert.equal(working.pending, true);
    assert.equal(working.label, 'Working…');

    const joining = signInSubmitState({ mode: 'signin', busy: false, joining: true });
    assert.equal(joining.label, 'Working…');

    const register = signInSubmitState({ mode: 'register', busy: false, joining: false });
    assert.equal(register.label, 'Create account');
    assert.equal(
      signInSubmitState({ mode: 'register', busy: true, joining: false }).label,
      'Creating account…',
    );

    const form = readFileSync(new URL('./PortalLoginForm.tsx', import.meta.url), 'utf8');
    assert.match(form, /signInSubmitState\(\{ mode, busy, joining \}\)/);
    assert.equal(form.includes("linkStatus === 'loading'"), false);
  });
});
