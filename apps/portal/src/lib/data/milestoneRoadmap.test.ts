import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { FIXTURE_TASKS } from '@/lib/data/fixtures';
import { fixtureMilestones } from '@/lib/data/milestoneRoadmap';

const site = {
  id: 'p-site',
  name: 'Northwind site',
  publishToWarehaus: true,
  internal: false,
};

describe('fixture roadmap', () => {
  it('shows the milestone tasks to staff and hides the unpublished milestone from a client', () => {
    const staff = fixtureMilestones(site, FIXTURE_TASKS, 'staff');
    const client = fixtureMilestones(site, FIXTURE_TASKS, 'client');
    assert.deepEqual(
      staff.map((milestone) => milestone.name),
      ['Launch the homepage', 'Billing export draft'],
    );
    assert.deepEqual(
      client.map((milestone) => milestone.name),
      ['Launch the homepage'],
    );
    const launch = client[0];
    assert.ok(launch);
    assert.equal(launch.countIsDecision, false);
    assert.equal(launch.openCount > 0, true);
    assert.deepEqual(
      launch.rows.map((row) => row.name),
      ['Approve the type ramp', 'Build the project page'],
    );
    assert.equal(launch.rows[1]?.children[0]?.name, 'Check the type scale');
    assert.equal(launch.rows[1]?.status, 'In Progress');
    assert.equal(launch.rows[1]?.stage, 'Building');
    assert.equal(launch.rows[1]?.resourceCount, 3);
    assert.equal('pullRequestUrl' in (launch.rows[1] ?? {}), false);
    const staffLaunch = staff[0];
    assert.equal(
      staffLaunch?.rows[1]?.pullRequestUrl,
      'https://github.com/warehauscollective/warehaus/pull/83',
    );
  });
});

describe('roadmap markup', () => {
  it('renders goals as text and does not use a checkbox', () => {
    const source = readFileSync(new URL('../../components/projects/ProjectRoadmap.tsx', import.meta.url), 'utf8');
    assert.match(source, /data-testid="milestone-goals"/);
    assert.match(source, /data-testid="milestone-counts"/);
    assert.match(source, /not the decision/);
    assert.doesNotMatch(source, /type="checkbox"/);
    assert.doesNotMatch(source, /PortalCheckbox/);
    assert.doesNotMatch(source, /percent/);
  });
});
