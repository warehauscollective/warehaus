/** Sign-up password rules from the auth frames. Sign-in does not use these. */

export function passwordRuleState(password: string): {
  length: boolean;
  mixedCase: boolean;
  numberOrSymbol: boolean;
  filledBars: number;
  label: string;
  ready: boolean;
} {
  const length = password.length >= 12;
  const mixedCase = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const numberOrSymbol = /[^A-Za-z]/.test(password);
  const met = [length, mixedCase, numberOrSymbol].filter(Boolean).length;
  const label = met <= 1 ? 'Weak' : met === 2 ? 'Fair' : 'Strong';
  return {
    length,
    mixedCase,
    numberOrSymbol,
    filledBars: met === 3 ? 4 : met,
    label: password.length === 0 ? 'Weak' : label,
    ready: length && mixedCase && numberOrSymbol,
  };
}
