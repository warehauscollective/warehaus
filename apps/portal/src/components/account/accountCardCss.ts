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
.account-field {
  width: 100%;
  box-sizing: border-box;
  background: var(--bg-2);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 12px 16px;
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 20px;
}
.account-field:focus { outline: none; }
@media (min-width: 768px) {
  .account-profile { gap: 48px; }
  .account-card { padding: 48px; }
}
`;
