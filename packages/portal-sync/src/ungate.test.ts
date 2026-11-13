import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mapNotionClient,
  mapNotionClientDoc,
  mapNotionContact,
  mapNotionProject,
  mapNotionSharedResource,
  mapNotionTask,
} from './mappers';
import { clientMaySeeProject, clientMaySeeTask } from './taskBoard';
import {
  clientIsStaffVisible,
  contactStaysStaffVisible,
  decideSyncedRowVisibility,
  isClientSurfaceVisible,
  isOrgVisibleToClients,
} from './ungate';

function title(text: string) {
  return { type: 'title', title: [{ plain_text: text }] };
}
function select(name: string | null) {
  return { type: 'select', select: name ? { name } : null };
}
function checkbox(value: boolean) {
  return { type: 'checkbox', checkbox: value };
}
function relation(ids: string[]) {
  return { type: 'relation', relation: ids.map((id) => ({ id })) };
}
function rich(text: string) {
  return { type: 'rich_text', rich_text: [{ plain_text: text }] };
}
function email(value: string) {
  return { type: 'email', email: value };
}
function status(name: string) {
  return { type: 'status', status: { name } };
}
function multi(names: string[]) {
  return { type: 'multi_select', multi_select: names.map((name) => ({ name })) };
}

const enabledClient = {
  'Company Name': title('Acme'),
  Slug: rich('acme'),
  Status: select('Active'),
  'Portal access': select('Enabled'),
};

describe('un-gate each flip', () => {
  it('keeps a Disabled prospect unhidden and its projects staff-visible', () => {
    const mapped = mapNotionClient('c1', {
      ...enabledClient,
      Status: select('Prospect'),
      'Portal access': select('Disabled'),
    });
    assert.equal(mapped.disposition, 'upsert');
    const decision = decideSyncedRowVisibility({
      table: 'clients',
      disposition: mapped.disposition,
    });
    assert.equal(decision.action, 'show');
    const client = { portalAccess: 'Disabled' as const };
    assert.equal(isOrgVisibleToClients(client), false);
    assert.equal(clientIsStaffVisible({}), true);
    const project = decideSyncedRowVisibility({
      table: 'projects',
      disposition: 'upsert',
      parentStaffVisible: clientIsStaffVisible({}),
    });
    assert.equal(project.action, 'show');

    const concealed = decideSyncedRowVisibility({
      table: 'projects',
      disposition: 'upsert',
      parentStaffVisible: clientIsStaffVisible({ syncHiddenAt: 9 }),
    });
    assert.equal(concealed.action, 'store-hidden');

    const trashed = decideSyncedRowVisibility({
      table: 'clients',
      disposition: 'upsert',
      inTrash: true,
    });
    const archived = decideSyncedRowVisibility({
      table: 'clients',
      disposition: 'upsert',
      archived: true,
    });
    assert.equal(trashed.action, 'hide');
    assert.equal(archived.action, 'hide');
    if (trashed.action === 'hide') assert.equal(trashed.reason, 'trashed');

    const missingSlug = mapNotionClient('c2', {
      'Company Name': title('Acme'),
      'Portal access': select('Disabled'),
    });
    assert.equal(missingSlug.disposition, 'quarantine');
    const quarantine = decideSyncedRowVisibility({
      table: 'clients',
      disposition: 'quarantine',
      dispositionReason: 'Client missing Slug',
    });
    assert.equal(quarantine.action, 'quarantine');

    const blankAccess = mapNotionClient('c3', {
      'Company Name': title('Acme'),
      Slug: rich('acme'),
    });
    assert.equal(blankAccess.disposition, 'skip');
  });

  it('keeps contacts, tasks, resources, and docs staff-visible under a Disabled prospect', () => {
    const client = { portalAccess: 'Disabled' as const, syncHiddenAt: null };
    assert.equal(isOrgVisibleToClients(client), false);
    const parentStaffVisible = clientIsStaffVisible(client);
    assert.equal(parentStaffVisible, true);
    const orgVisible = isOrgVisibleToClients(client);
    assert.equal(
      clientMaySeeProject({
        name: 'Site',
        types: ['Website'],
        publishToWarehaus: true,
        archive: false,
        hidden: false,
        orgVisible,
      }),
      false,
    );
    assert.equal(
      clientMaySeeTask({
        publishToWarehaus: true,
        hidden: false,
        project: {
          name: 'Site',
          types: ['Website'],
          publishToWarehaus: true,
          archive: false,
          hidden: false,
          orgVisible,
        },
      }),
      false,
    );

    const contact = mapNotionContact('person', {
      Name: title('Ada'),
      Email: email('ada@acme.test'),
      'Portal Access': select('Enabled'),
      'Client Company': relation(['c1']),
      Role: select('Client Member'),
    });
    assert.equal(contact.disposition, 'upsert');
    assert.equal(
      decideSyncedRowVisibility({
        table: 'contacts',
        disposition: 'upsert',
        parentStaffVisible,
        contactRole: 'Client Member',
      }).action,
      'show',
    );
    assert.equal(
      contactStaysStaffVisible({
        disposition: 'upsert',
        parentStaffVisible: parentStaffVisible,
        effectivePortalAccess: 'Enabled',
        inviteStatus: null,
        unverifiedAcceptance: false,
      }),
      true,
    );
    assert.equal(
      contactStaysStaffVisible({
        disposition: 'upsert',
        parentStaffVisible: parentStaffVisible,
        effectivePortalAccess: 'Enabled',
        inviteStatus: 'Accepted',
        unverifiedAcceptance: true,
      }),
      false,
    );
    assert.equal(
      contactStaysStaffVisible({
        disposition: 'skip',
        parentStaffVisible: parentStaffVisible,
        effectivePortalAccess: 'Disabled',
        inviteStatus: null,
        unverifiedAcceptance: false,
      }),
      false,
    );
    assert.equal(
      contactStaysStaffVisible({
        disposition: 'upsert',
        parentStaffVisible: clientIsStaffVisible({ syncHiddenAt: 9 }),
        effectivePortalAccess: 'Enabled',
        inviteStatus: null,
        unverifiedAcceptance: false,
      }),
      false,
    );

    const task = mapNotionTask(
      'task',
      {
        Name: title('Ship'),
        Projects: relation(['prj']),
        'Publish to Warehaus': checkbox(true),
        Status: status('To Do'),
      },
      true,
    );
    assert.equal(task.disposition, 'upsert');
    assert.equal(
      decideSyncedRowVisibility({
        table: 'tasks',
        disposition: 'upsert',
        parentStaffVisible,
        parentProjectVisible: true,
      }).action,
      'show',
    );
    const hiddenProject = decideSyncedRowVisibility({
      table: 'tasks',
      disposition: 'upsert',
      parentStaffVisible,
      parentProjectVisible: false,
    });
    assert.equal(hiddenProject.action, 'store-hidden');

    const resource = mapNotionSharedResource('resource', {
      Name: title('Logo'),
      Client: relation(['c1']),
      'Publish to Warehaus': checkbox(true),
      Type: select('Image'),
    });
    assert.equal(resource.disposition, 'upsert');
    assert.equal(
      decideSyncedRowVisibility({
        table: 'sharedResources',
        disposition: 'upsert',
        parentStaffVisible,
      }).action,
      'show',
    );

    const doc = mapNotionClientDoc('doc', {
      Title: title('Start'),
      Status: select('Published'),
      'Publish to Warehaus': checkbox(true),
      Client: relation(['c1']),
      'Doc Type': select('Start Here'),
    });
    assert.equal(doc.disposition, 'upsert');
    assert.equal(
      decideSyncedRowVisibility({
        table: 'clientDocs',
        disposition: 'upsert',
        parentStaffVisible,
      }).action,
      'show',
    );

    const concealedParent = clientIsStaffVisible({ syncHiddenAt: 9 });
    assert.equal(concealedParent, false);
    for (const table of ['contacts', 'tasks', 'sharedResources', 'clientDocs'] as const) {
      const stored = decideSyncedRowVisibility({
        table,
        disposition: 'upsert',
        parentStaffVisible: concealedParent,
        ...(table === 'tasks' ? { parentProjectVisible: true } : {}),
        ...(table === 'contacts' ? { contactRole: 'Client Member' as const } : {}),
      });
      assert.equal(stored.action, 'store-hidden');
      if (stored.action === 'store-hidden' && table === 'contacts') {
        assert.equal(stored.revokeSessions, true);
      }

      const trashed = decideSyncedRowVisibility({
        table,
        disposition: 'upsert',
        parentStaffVisible,
        inTrash: true,
      });
      const archived = decideSyncedRowVisibility({
        table,
        disposition: 'upsert',
        parentStaffVisible,
        archived: true,
      });
      assert.equal(trashed.action, 'hide');
      assert.equal(archived.action, 'hide');
      if (trashed.action === 'hide') assert.equal(trashed.reason, 'trashed');

      const quarantine = decideSyncedRowVisibility({
        table,
        disposition: 'quarantine',
        dispositionReason: 'quarantine',
        parentStaffVisible,
      });
      assert.equal(quarantine.action, 'quarantine');
    }
  });

  it('hides a contact when Portal Access is disabled and revokes sessions', () => {
    const mapped = mapNotionContact('p1', {
      Name: title('Ada'),
      Email: email('ada@acme.test'),
      'Portal Access': select('Disabled'),
      'Client Company': relation(['c1']),
      Role: select('Client Member'),
    });
    assert.equal(mapped.disposition, 'skip');
    const decision = decideSyncedRowVisibility({
      table: 'contacts',
      disposition: 'skip',
      dispositionReason: mapped.disposition === 'skip' ? mapped.reason : undefined,
      contactRole: 'Client Member',
    });
    assert.equal(decision.action, 'hide');
    if (decision.action === 'hide') {
      assert.equal(decision.reason, 'gate');
      assert.equal(decision.revokeSessions, true);
    }
  });

  it('hides a contact with an empty Client Company', () => {
    const mapped = mapNotionContact('p1', {
      Name: title('Ada'),
      Email: email('ada@acme.test'),
      'Portal Access': select('Enabled'),
      Role: select('Client Admin'),
    });
    assert.equal(mapped.disposition, 'skip');
    const decision = decideSyncedRowVisibility({
      table: 'contacts',
      disposition: mapped.disposition,
      dispositionReason: mapped.disposition === 'skip' ? mapped.reason : undefined,
    });
    assert.equal(decision.action, 'hide');
  });

  it('hides a project when Publish is off, when archived, and when Type is Internal', () => {
    const base = {
      Name: title('Site'),
      Client: relation(['c1']),
      Status: status('In progress'),
    };
    for (const properties of [
      { ...base, 'Publish to Warehaus': checkbox(false), Archive: checkbox(false), Type: multi(['Website']) },
      { ...base, 'Publish to Warehaus': checkbox(true), Archive: checkbox(true), Type: multi(['Website']) },
      { ...base, 'Publish to Warehaus': checkbox(true), Archive: checkbox(false), Type: multi(['Internal']) },
    ]) {
      const mapped = mapNotionProject('prj', properties);
      assert.equal(mapped.disposition, 'skip');
      const decision = decideSyncedRowVisibility({
        table: 'projects',
        disposition: 'skip',
        dispositionReason: mapped.disposition === 'skip' ? mapped.reason : undefined,
      });
      assert.equal(decision.action, 'hide');
      if (decision.action === 'hide') assert.equal(decision.cascade, 'project-tasks');
    }
  });

  it('hides a task when Publish is off or the parent project fails its gate', () => {
    const unpublished = mapNotionTask(
      't1',
      {
        Name: title('Ship'),
        Projects: relation(['prj']),
        'Publish to Warehaus': checkbox(false),
        Status: status('To Do'),
      },
      true,
    );
    assert.equal(unpublished.disposition, 'skip');
    assert.equal(
      decideSyncedRowVisibility({ table: 'tasks', disposition: 'skip', dispositionReason: 'Publish to Warehaus is false' }).action,
      'hide',
    );

    const parent = mapNotionTask(
      't2',
      {
        Name: title('Ship'),
        Projects: relation(['prj']),
        'Publish to Warehaus': checkbox(true),
        Status: status('To Do'),
      },
      false,
    );
    assert.equal(parent.disposition, 'skip');
    const decision = decideSyncedRowVisibility({
      table: 'tasks',
      disposition: 'skip',
      dispositionReason: parent.disposition === 'skip' ? parent.reason : undefined,
    });
    assert.equal(decision.action, 'hide');
    if (decision.action === 'hide') assert.equal(decision.reason, 'gate');
  });

  it('hides a shared resource when Publish is off', () => {
    const mapped = mapNotionSharedResource('r1', {
      Name: title('Logo'),
      Client: relation(['c1']),
      'Publish to Warehaus': checkbox(false),
      Type: select('Image'),
    });
    assert.equal(mapped.disposition, 'skip');
    assert.equal(
      decideSyncedRowVisibility({ table: 'sharedResources', disposition: 'skip', dispositionReason: 'Publish to Warehaus is false' }).action,
      'hide',
    );
  });

  it('hides a doc when Status is not Published or Publish is off', () => {
    const draft = mapNotionClientDoc('d1', {
      Title: title('Start'),
      Status: select('Draft'),
      'Publish to Warehaus': checkbox(true),
      Client: relation(['c1']),
      'Doc Type': select('Start Here'),
    });
    assert.equal(draft.disposition, 'skip');
    const unpublished = mapNotionClientDoc('d2', {
      Title: title('Start'),
      Status: select('Published'),
      'Publish to Warehaus': checkbox(false),
      Client: relation(['c1']),
      'Doc Type': select('Start Here'),
    });
    assert.equal(unpublished.disposition, 'skip');
    for (const mapped of [draft, unpublished]) {
      const decision = decideSyncedRowVisibility({
        table: 'clientDocs',
        disposition: 'skip',
        dispositionReason: mapped.disposition === 'skip' ? mapped.reason : undefined,
      });
      assert.equal(decision.action, 'hide');
    }
  });

  it('hides archived and trashed pages even when properties would pass', () => {
    const mapped = mapNotionProject('prj', {
      Name: title('Site'),
      Client: relation(['c1']),
      Status: status('In progress'),
      'Publish to Warehaus': checkbox(true),
      Archive: checkbox(false),
      Type: multi(['Website']),
    });
    assert.equal(mapped.disposition, 'upsert');
    const archived = decideSyncedRowVisibility({
      table: 'projects',
      disposition: 'upsert',
      archived: true,
    });
    const trashed = decideSyncedRowVisibility({
      table: 'contacts',
      disposition: 'upsert',
      inTrash: true,
      contactRole: 'Client Member',
    });
    assert.equal(archived.action, 'hide');
    assert.equal(trashed.action, 'hide');
    if (archived.action === 'hide') {
      assert.equal(archived.reason, 'trashed');
      assert.equal(archived.cascade, 'project-tasks');
    }
    if (trashed.action === 'hide') {
      assert.equal(trashed.revokeSessions, true);
    }
  });

  it('stores children of a disabled client as hidden instead of showing them', () => {
    const project = decideSyncedRowVisibility({
      table: 'projects',
      disposition: 'upsert',
      parentStaffVisible: false,
    });
    assert.equal(project.action, 'store-hidden');
    if (project.action === 'store-hidden') {
      assert.equal(project.reason, 'ancestor');
      assert.equal(project.cascade, 'project-tasks');
    }

    const contact = decideSyncedRowVisibility({
      table: 'contacts',
      disposition: 'upsert',
      parentStaffVisible: false,
      contactRole: 'Client Member',
    });
    assert.equal(contact.action, 'store-hidden');
    if (contact.action === 'store-hidden') assert.equal(contact.revokeSessions, true);

    const staff = decideSyncedRowVisibility({
      table: 'contacts',
      disposition: 'upsert',
      parentStaffVisible: false,
      contactRole: 'Warehaus Staff',
    });
    if (staff.action === 'store-hidden') assert.equal(staff.revokeSessions, false);

    const task = decideSyncedRowVisibility({
      table: 'tasks',
      disposition: 'upsert',
      parentProjectVisible: false,
    });
    assert.equal(task.action, 'store-hidden');
  });

  it('shows a row that still passes and whose parent is enabled', () => {
    const decision = decideSyncedRowVisibility({
      table: 'projects',
      disposition: 'upsert',
      parentStaffVisible: true,
    });
    assert.deepEqual(decision, { action: 'show' });
  });
});

describe('client surface visibility', () => {
  it('treats a missing hide stamp as visible and a stamp as hidden', () => {
    assert.equal(isClientSurfaceVisible({}), true);
    assert.equal(isClientSurfaceVisible({ syncHiddenAt: 1 }), false);
  });

  it('requires the client itself to be enabled', () => {
    assert.equal(isOrgVisibleToClients({ portalAccess: 'Enabled' }), true);
    assert.equal(isOrgVisibleToClients({ portalAccess: 'Disabled' }), false);
    assert.equal(isOrgVisibleToClients({ portalAccess: 'Enabled', syncHiddenAt: 5 }), false);
    assert.equal(isOrgVisibleToClients(null), false);
  });
});
