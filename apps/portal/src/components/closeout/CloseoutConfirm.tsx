'use client';

import { useState, type ReactNode } from 'react';
import type { ArchiveTaskChoice, LeftoverChoice } from '@convex/_lib/closeout';
import { Icon } from '@/components/ui/Icon';
import { PortalModal } from '@/components/ui/PortalModal';
import { OutlineButton, PrimaryButton } from '@/components/ui/primitives';
import { useMaxWidth } from '@/lib/design/useMaxWidth';
import {
  ARCHIVE_BODY,
  ARCHIVE_MILESTONE_TITLE,
  ARCHIVE_TASK_OPTIONS,
  ARCHIVE_TASK_TITLE,
  ARCHIVE_TASKS_LABEL,
  CONFIRM_CANCEL,
  LEFTOVERS_LABEL,
  MARK_COMPLETE_BODY,
  MARK_COMPLETE_EMPTY_BODY,
  MARK_COMPLETE_TITLE,
  MENU_ARCHIVE,
  MENU_MARK_COMPLETE,
  leftoverOptions,
  markCompleteOpenBody,
  type ConfirmKind,
} from './closeoutCopy';

export type ConfirmChoice = LeftoverChoice | ArchiveTaskChoice | null;

/** Title, body and choice for each confirm kind. The first option is the default. */
export function confirmContent(input: { kind: ConfirmKind; open: number; parkedMilestone: boolean }): {
  title: string;
  body: string;
  choiceLabel: string | null;
  options: readonly { value: LeftoverChoice | ArchiveTaskChoice; label: string }[];
  action: string;
  danger: boolean;
} {
  if (input.kind === 'archive') {
    return { title: ARCHIVE_TASK_TITLE, body: ARCHIVE_BODY, choiceLabel: null, options: [], action: MENU_ARCHIVE, danger: true };
  }
  if (input.kind === 'archive-milestone') {
    // With nothing open there is nothing to choose.
    const ask = input.open > 0;
    return {
      title: ARCHIVE_MILESTONE_TITLE,
      body: ARCHIVE_BODY,
      choiceLabel: ask ? ARCHIVE_TASKS_LABEL : null,
      options: ask ? ARCHIVE_TASK_OPTIONS : [],
      action: MENU_ARCHIVE,
      danger: true,
    };
  }
  if (input.kind === 'mark-complete-open') {
    return {
      title: MARK_COMPLETE_TITLE,
      body: markCompleteOpenBody(input.open),
      choiceLabel: LEFTOVERS_LABEL,
      options: leftoverOptions(input.parkedMilestone),
      action: MENU_MARK_COMPLETE,
      danger: false,
    };
  }
  return {
    title: MARK_COMPLETE_TITLE,
    body: input.kind === 'mark-complete-empty' ? MARK_COMPLETE_EMPTY_BODY : MARK_COMPLETE_BODY,
    choiceLabel: null,
    options: [],
    action: MENU_MARK_COMPLETE,
    danger: false,
  };
}

const FOCUS =
  'focus-visible:[--tw-outline-style:solid] focus-visible:outline-2 focus-visible:outline-[var(--info)] focus-visible:outline-offset-2';

/**
 * ConfirmFrame kinds mark-complete-empty 1036:8712, mark-complete 1036:8822,
 * mark-complete-open 1036:8945, archive-milestone 1036:9117 and the task
 * archive 747:10674. Centered at 1440, a bottom sheet at 390. One PortalModal.
 * There is no Checkbox in the library: a choice is StatusMenu-style option
 * rows with a check on the selected one.
 */
export function CloseoutConfirm({
  kind,
  open = 0,
  parkedMilestone = false,
  busy = false,
  error = null,
  onCancel,
  onConfirm,
  extra,
}: {
  kind: ConfirmKind;
  /** Open tasks on the milestone. */
  open?: number;
  /** The project has a milestone named "Parked for later". */
  parkedMilestone?: boolean;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (choice: ConfirmChoice) => void;
  extra?: ReactNode;
}) {
  const phone = useMaxWidth(767);
  const content = confirmContent({ kind, open, parkedMilestone });
  const [choice, setChoice] = useState<ConfirmChoice>(content.options[0]?.value ?? null);
  const confirm = () => {
    if (!busy) onConfirm(content.options.length > 0 ? choice : null);
  };
  const pad = phone ? 16 : 24;
  return (
    <PortalModal
      testId="closeout-confirm"
      label={content.title}
      onClose={() => {
        if (!busy) onCancel();
      }}
      narrow={phone}
      sheet="bottom"
      width={440}
      header="compact"
      showIcon={content.danger}
      headerIcon={content.danger ? <Icon name="Warning2" size="lg" color="danger" /> : undefined}
      focusCancel
      showFooter={false}
      locked={busy}
      onConfirm={confirm}
      confirmOnEnter
    >
      <div data-confirm-kind={kind} onClick={(event) => event.stopPropagation()}>
        <p data-testid="closeout-confirm-body" style={{ margin: `8px ${pad}px 16px`, fontSize: 14, lineHeight: '21px' }}>
          {content.body}
        </p>
        {content.choiceLabel ? (
          <div role="radiogroup" aria-label={content.choiceLabel} style={{ margin: `0 ${pad - 10}px 8px` }}>
            <p
              data-testid="closeout-choice-label"
              style={{ margin: '0 10px 8px', fontSize: 13, lineHeight: '20px', fontWeight: 500, color: 'var(--muted)' }}
            >
              {content.choiceLabel}
            </p>
            {content.options.map((option) => {
              const selected = option.value === choice;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-testid={`closeout-option-${option.value}`}
                  disabled={busy}
                  onClick={() => setChoice(option.value)}
                  className={`closeout-option flex w-full items-center gap-2 text-left ${FOCUS}`}
                  style={{
                    padding: 10,
                    border: 0,
                    borderRadius: 12,
                    background: selected ? 'var(--surface-2)' : 'transparent',
                    color: 'var(--fg)',
                    font: 'inherit',
                    fontSize: 14,
                    lineHeight: '21px',
                    cursor: busy ? 'default' : 'pointer',
                  }}
                >
                  <span style={{ flex: '1 1 auto', minWidth: 0 }}>{option.label}</span>
                  {selected ? <Icon name="Check" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
        {extra}
        {error ? (
          <p role="alert" data-testid="closeout-confirm-error" style={{ margin: `0 ${pad}px 12px`, color: 'var(--danger-text)', fontSize: 14, lineHeight: '21px' }}>
            {error}
          </p>
        ) : null}
        <div
          className="flex flex-nowrap items-center justify-end gap-2"
          style={{ padding: phone ? '16px 16px 24px' : '16px 24px 20px' }}
        >
          <OutlineButton nowrap height={42} paddingInline={16} disabled={busy} onClick={onCancel}>
            {CONFIRM_CANCEL}
          </OutlineButton>
          {content.danger ? (
            <button
              type="button"
              data-testid="closeout-confirm-submit"
              data-tone="danger"
              disabled={busy}
              onClick={confirm}
              className={FOCUS}
              style={{
                height: 42,
                padding: '0 16px',
                borderRadius: 10,
                border: '1px solid var(--danger)',
                background: 'transparent',
                color: 'var(--danger-text)',
                font: 'inherit',
                fontSize: 14,
                whiteSpace: 'nowrap',
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.55 : 1,
              }}
            >
              {busy ? 'Saving…' : content.action}
            </button>
          ) : (
            <PrimaryButton testId="closeout-confirm-submit" height={42} paddingInline={16} disabled={busy} onClick={confirm}>
              {busy ? 'Saving…' : content.action}
            </PrimaryButton>
          )}
        </div>
      </div>
    </PortalModal>
  );
}
