import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  ACTIVITY_MILESTONE_ID_GAP,
  boardCountsFromTasks,
  clientMilestoneEmptyKind,
  dialogTabBoundary,
  goalKey,
  milestoneResourceChoices,
  milestonesAfterQuery,
  nextTabIndex,
  resourcesForProject,
  reviewStamp,
  storedMilestoneReview,
  tabIds,
} from './milestoneGuards';

const roadmap = readFileSync(new URL('./ProjectRoadmap.tsx', import.meta.url), 'utf8');
const projects = readFileSync(new URL('../pages/ProjectsContent.tsx', import.meta.url), 'utf8');
const board = readFileSync(new URL('../tasks/TaskBoard.tsx', import.meta.url), 'utf8');
const chrome = readFileSync(new URL('./milestoneChrome.tsx', import.meta.url), 'utf8');
const tasks = readFileSync(new URL('../../../convex/tasks.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../../../convex/schema.ts', import.meta.url), 'utf8');

describe('milestone review fixes', () => {
  it('keeps resource choices on the current project', () => {
    const rows = [
      { id: 'here', projectId: 'p-site', title: 'Site brief' },
      { id: 'blank', projectId: null, title: 'Other client deck' },
      { id: 'elsewhere', projectId: 'p-other', title: 'Northwind notes' },
    ];
    assert.deepEqual(resourcesForProject(rows, 'p-site').map((row) => row.id), ['here']);
    assert.equal(projects.includes('!resource.projectId'), false);
    assert.match(projects, /resourcesForProject\(/);
    assert.match(projects, /resourceChoices=\{isStaff \? resourceChoices : \[\]\}/);
    const choices = milestoneResourceChoices(
      [{ id: 'here', title: 'Site brief' }],
      [{ id: 'attached', title: 'Already on this milestone' }],
    );
    assert.deepEqual(choices.map((choice) => choice.id), ['here', 'attached']);
    assert.equal(roadmap.includes('milestone.resourceChoices'), false);
  });

  it('shows a save failure inside the open dialog', () => {
    assert.match(roadmap, /saveError=\{error\}/);
    assert.match(roadmap, /error && !reviewOpen && !editing/);
    const review = roadmap.slice(roadmap.indexOf('function ReviewDialog'), roadmap.indexOf('function EditDialog'));
    const edit = roadmap.slice(roadmap.indexOf('function EditDialog'), roadmap.indexOf('function CreateMilestone'));
    assert.match(review, /saveError \? <FormAlert>/);
    assert.match(edit, /saveError \? <FormAlert>/);
  });

  it('mounts assign on the tasks tab and does not offer New task there', () => {
    const tasksTab = roadmap.slice(roadmap.indexOf("tab === 'tasks'"), roadmap.indexOf("tab === 'reviews'"));
    assert.match(tasksTab, /Assign existing task/);
    assert.match(tasksTab, /<MoreMenu/);
    assert.equal(tasksTab.includes('New task'), false);
    const menu = roadmap.slice(roadmap.indexOf('function MoreMenu'), roadmap.indexOf('function ReviewDialog'));
    assert.match(menu, /data-testid="milestone-attach"/);
    assert.equal(menu.includes('New task'), false);
    assert.equal(roadmap.includes('>New task<'), false);
    const create = tasks.slice(tasks.indexOf('export const createTask'), tasks.indexOf('export const updateLiveFields'));
    assert.equal(create.includes('milestoneId'), false);
  });

  it('does not attribute reviews or activity by milestone name', () => {
    assert.equal(roadmap.includes('item.name === milestone.name'), false);
    assert.equal(roadmap.includes("startsWith('milestone.')"), false);
    assert.match(roadmap, /storedMilestoneReview\(milestone\)/);
    assert.match(roadmap, /ACTIVITY_MILESTONE_ID_GAP/);
    const activity = schema.slice(schema.indexOf('activity: defineTable'), schema.indexOf('taskResponses: defineTable'));
    assert.equal(activity.includes('milestoneId'), false);
    assert.match(activity, /name: v\.string\(\)/);
    const launch = storedMilestoneReview({
      id: 'm-launch',
      approval: 'approved',
      note: 'Ship it',
      approverName: 'Ada',
      decidedAt: 1,
    });
    const billing = storedMilestoneReview({
      id: 'm-billing',
      approval: 'unreviewed',
      note: null,
      approverName: null,
      decidedAt: null,
    });
    assert.equal(launch?.id, 'm-launch');
    assert.equal(billing, null);
    assert.match(ACTIVITY_MILESTONE_ID_GAP, /no milestone id/);
  });

  it('limits the shared board surface to the milestone board', () => {
    assert.match(board, /const framedSurface = framed && !phone/);
    assert.match(board, /shared=\{framedSurface\}/);
    assert.match(board, /\{shared && fade \?/);
    const milestoneBoard = projects.slice(projects.indexOf('renderTasks='), projects.indexOf('details='));
    const projectBoard = projects.slice(projects.indexOf("itemView.region === 'board'"));
    assert.match(milestoneBoard, /<TaskBoard[\s\S]*?\bframed\b/);
    assert.equal(projectBoard.includes('framed'), false);
  });

  it('separates an authorized empty milestone list from an inaccessible project', () => {
    assert.equal(clientMilestoneEmptyKind({ publishToWarehaus: true, internal: false }), 'none-shared');
    assert.equal(clientMilestoneEmptyKind({ publishToWarehaus: false }), 'unavailable');
    assert.equal(clientMilestoneEmptyKind({ internal: true, publishToWarehaus: true }), 'unavailable');
    assert.equal(clientMilestoneEmptyKind({ syncHidden: true, publishToWarehaus: true }), 'unavailable');
    assert.equal(clientMilestoneEmptyKind({ name: 'warehaus.studio', publishToWarehaus: true }), 'unavailable');
    assert.match(roadmap, /testId="milestone-none-shared"/);
    assert.match(roadmap, /testId="milestone-unavailable"/);
  });

  it('counts lane cards from the tasks the board can draw', () => {
    const shown = [
      { id: 'parent', parentTaskId: null, isDone: false },
      { id: 'child', parentTaskId: 'parent', isDone: true },
    ];
    assert.deepEqual(boardCountsFromTasks(shown), { lanes: 1, laneDone: 0, nested: 1 });
    assert.deepEqual(boardCountsFromTasks([]), { lanes: 0, laneDone: 0, nested: 0 });
    assert.match(roadmap, /const board = boardCountsFromTasks\(shownTasks\)/);
    assert.match(roadmap, /\{board\.lanes\} on the board/);
    assert.match(roadmap, /board\.lanes === 0/);
  });

  it('traps dialog focus and restores it on close', () => {
    assert.equal(dialogTabBoundary({ shiftKey: false, atFirst: false, atLast: true }), 'first');
    assert.equal(dialogTabBoundary({ shiftKey: true, atFirst: true, atLast: false }), 'last');
    assert.equal(dialogTabBoundary({ shiftKey: false, atFirst: true, atLast: false }), null);
    assert.match(chrome, /dialogTabBoundary\(/);
    assert.match(chrome, /previous\?\.focus\(\{ preventScroll: true \}\)/);
    assert.match(chrome, /tabIndex=\{-1\}/);
    assert.match(roadmap, /\[error, noteAttempt\]/);
  });

  it('announces the resource count and uses a tab pattern', () => {
    assert.match(roadmap, /data-testid="milestone-resource-count" aria-live="polite"/);
    assert.equal(nextTabIndex(0, 4, 'ArrowRight'), 1);
    assert.equal(nextTabIndex(0, 4, 'ArrowLeft'), 3);
    assert.equal(nextTabIndex(2, 4, 'Home'), 0);
    assert.equal(nextTabIndex(2, 4, 'End'), 3);
    assert.deepEqual(tabIds('milestone', 'tasks'), { tab: 'milestone-tab-tasks', panel: 'milestone-panel' });
    assert.match(chrome, /aria-controls=\{ids\.panel\}/);
    assert.match(chrome, /tabIndex=\{selected \? 0 : -1\}/);
    assert.match(chrome, /nextTabIndex\(/);
    assert.match(roadmap, /role="tabpanel"/);
    assert.match(chrome, /scrollActiveIntoView\(node, \{ activeSelector: '\[aria-selected="true"\]' \}\)/);
  });

  it('keeps the last milestone list when a later query fails', () => {
    const previous = [{ id: 'm1' }];
    assert.deepEqual(
      milestonesAfterQuery({ data: undefined, error: 'boom', loading: false, previous }),
      previous,
    );
    assert.deepEqual(milestonesAfterQuery({ data: [], error: null, loading: false, previous }), []);
    assert.deepEqual(milestonesAfterQuery({ data: undefined, error: null, loading: false, previous }), []);
    assert.match(roadmap, /Milestones could not refresh\. Showing the last list that loaded\./);
    assert.match(roadmap, /milestonesAfterQuery\(/);
  });

  it('labels the decision time as a review and keeps duplicate goal lines', () => {
    const now = Date.parse('2026-11-08T15:00:00Z');
    assert.equal(reviewStamp(null, now), 'No review yet');
    assert.equal(reviewStamp(now, now), 'Last review today');
    assert.equal(reviewStamp(Date.parse('2026-11-01T15:00:00Z'), now).startsWith('Last review '), true);
    assert.equal(reviewStamp(now, now).includes('Updated'), false);
    assert.notEqual(goalKey(0, 'Ship'), goalKey(1, 'Ship'));
    assert.match(roadmap, /goalKey\(index, goal\)/);
    assert.match(roadmap, /reviewStamp\(milestone\.decidedAt\)/);
  });
});
