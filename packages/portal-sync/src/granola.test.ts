import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FIXTURE_GRANOLA_NOTES,
  GRANOLA_IMPORT_FAILED,
  clientMayOpenGranolaRecap,
  clientSafeResourceText,
  granolaSyncRow,
  importGranolaNote,
  isGranolaPortalPage,
  readGranolaSource,
  staffGranolaStatus,
  staffNotesHref,
} from './granola';

const TRANSCRIPT = 'TRANSCRIPT: Ada: the raw speaker turns stay in Notion.';

describe('granola import', () => {
  it('stores a recap and drops the transcript', () => {
    const draft = importGranolaNote(FIXTURE_GRANOLA_NOTES[0]!);
    assert.equal(draft.status, 'imported');
    assert.equal(draft.publishToWarehaus, false);
    assert.equal(draft.type, 'Meeting notes');
    assert.equal(draft.source, 'granola');
    assert.equal(draft.notionPageId, 'granola:kickoff');
    assert.equal(draft.externalId, 'wh_grn_kickoff');
    assert.equal(draft.clientSlug, 'northwind');
    assert.match(draft.description ?? '', /Summary: The menu structure is agreed\./);
    assert.match(draft.description ?? '', /Decisions:\nKeep one column\./);
    assert.match(draft.description ?? '', /Action items:\nMaya: update the wireframe\./);
    const encoded = JSON.stringify(draft);
    assert.equal(encoded.includes(TRANSCRIPT), false);
    assert.equal(encoded.includes('transcript'), false);
    assert.equal('transcript' in draft, false);
  });

  it('fails a transcript-only note and keeps the previous recap out of the draft', () => {
    const draft = importGranolaNote(FIXTURE_GRANOLA_NOTES[1]!);
    assert.equal(draft.status, 'failed');
    assert.equal(draft.error, 'No client-safe recap');
    assert.equal(draft.description, null);
    assert.equal(draft.publishToWarehaus, false);
    assert.equal(JSON.stringify(draft).includes('TRANSCRIPT'), false);
  });

  it('does not copy a recap field that repeats the transcript', () => {
    const draft = importGranolaNote({
      id: 'leak',
      title: 'Leak',
      transcript: 'secret speaker dump',
      summary: 'secret speaker dump',
      clientSlug: 'northwind',
    });
    assert.equal(draft.status, 'failed');
    assert.equal(draft.description, null);
  });

  it('refuses to call Granola when the key is missing and never returns a key', () => {
    assert.deepEqual(readGranolaSource({}), { configured: false });
    assert.deepEqual(readGranolaSource({ GRANOLA_API_KEY: '   ' }), { configured: false });
    const configured = readGranolaSource({ GRANOLA_API_KEY: 'present' });
    assert.deepEqual(configured, { configured: true });
    assert.equal(JSON.stringify(configured).includes('present'), false);
  });

  it('keeps full notes as a Notion link', () => {
    assert.equal(
      staffNotesHref('https://www.notion.so/0123456789abcdef0123456789abcdef'),
      'https://www.notion.so/0123456789abcdef0123456789abcdef',
    );
    assert.equal(staffNotesHref('http://www.notion.so/abc'), null);
    assert.equal(staffNotesHref('https://example.com/notes'), null);
    assert.equal(isGranolaPortalPage('granola:kickoff'), true);
    assert.equal(isGranolaPortalPage('notion-res-public'), false);
  });
});

describe('client recap guard', () => {
  it('leaves an ordinary description alone', () => {
    assert.equal(clientSafeResourceText('Shared recap'), 'Shared recap');
    assert.equal(clientSafeResourceText(''), null);
  });

  it('returns the recap and drops the transcript block', () => {
    const mixed = [
      'Summary: The menu structure is agreed.',
      'Transcript:',
      'Ada: secret speaker turns that a client must not see.',
      'Decisions:',
      'Keep one column.',
    ].join('\n');
    const safe = clientSafeResourceText(mixed);
    assert.match(safe ?? '', /The menu structure is agreed/);
    assert.match(safe ?? '', /Keep one column/);
    assert.equal(safe?.includes('secret speaker'), false);
    assert.equal(safe?.toLowerCase().includes('transcript'), false);
  });

  it('drops a speaker-turn dump that has no recap', () => {
    const dump = ['Ada: one', 'Ben: two', 'Cara: three', 'Diego: four'].join('\n');
    assert.equal(clientSafeResourceText(dump), null);
  });

  it('hides an unpublished or transcript-only granola row from a client', () => {
    assert.equal(
      clientMayOpenGranolaRecap({
        notionPageId: 'granola:kickoff',
        source: 'granola',
        publishToWarehaus: false,
        description: 'Summary: Agreed.',
      }),
      false,
    );
    assert.equal(
      clientMayOpenGranolaRecap({
        notionPageId: 'granola:standup',
        publishToWarehaus: true,
        description: 'TRANSCRIPT:\nAda: secret',
      }),
      false,
    );
    assert.equal(
      clientMayOpenGranolaRecap({
        notionPageId: 'granola:kickoff',
        publishToWarehaus: true,
        description: 'Summary: Agreed.',
      }),
      true,
    );
    assert.equal(
      clientMayOpenGranolaRecap({
        notionPageId: 'notion-file',
        publishToWarehaus: false,
        description: null,
      }),
      true,
    );
  });
});

describe('staff granola status', () => {
  it('shows a clock time after a clean run and Failed after an error', () => {
    const ran = granolaSyncRow({
      configured: true,
      lastRunAt: '2026-10-29T08:10:00Z',
      lastError: null,
    });
    assert.equal(ran.label, 'Granola import');
    assert.equal(ran.value, 'Last run 08:10');
    assert.equal(ran.tone, 'muted');
    const failed = granolaSyncRow({
      configured: true,
      lastRunAt: '2026-10-29T08:10:00Z',
      lastError: GRANOLA_IMPORT_FAILED,
    });
    assert.equal(failed.value, 'Failed');
    assert.equal(failed.tone, 'danger');
    assert.equal(
      granolaSyncRow({ configured: false, lastRunAt: null, lastError: null }).value,
      'Not configured',
    );
  });

  it('does not surface a transcript that was written into the status error', () => {
    const status = staffGranolaStatus({
      lastSyncedAt: Date.parse('2026-10-29T08:10:00Z'),
      lastError: 'TRANSCRIPT: Ada said the secret',
      details: JSON.stringify({ configured: true, transcript: 'nope' }),
    });
    assert.equal(status.lastError, GRANOLA_IMPORT_FAILED);
    assert.equal(status.configured, true);
    assert.equal(JSON.stringify(status).includes('secret'), false);
    assert.equal(JSON.stringify(status).includes('nope'), false);
  });
});
