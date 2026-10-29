/** Local to Account profile and appearance. Does not change portal chrome. */
export const ACCOUNT_CARD_CSS = `
.account-profile { gap: 32px; }
.account-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 36px;
  padding: 25px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}
.account-sign-out {
  width: 100%;
  box-sizing: border-box;
}
.account-password-hint:focus-visible,
.account-sign-out:focus-visible,
.account-theme-toggle:focus-visible {
  outline: 2px solid var(--fg);
  outline-offset: 3px;
}
@media (min-width: 768px) {
  .account-profile { gap: 48px; }
  .account-card { padding: 48px; }
  .account-sign-out { width: auto; }
}
`;
