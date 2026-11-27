# Deploy to main: setup

One-time setup for the Deploy to main button on the Warehaus Portal project (ADR-0009). Peter does these steps himself. No agent creates, reads or pastes any of these values, and none of them goes in the repo, a doc or chat.

Until every step is done, staff see the "to deploy" counter and nobody sees the button.

## What gets set

| Name | Where it lives | What it is for |
|---|---|---|
| `CONVEX_DEPLOY_KEY` | GitHub, `production` environment | Lets the deploy workflow deploy production Convex `unique-turtle-383`. |
| `VERCEL_TOKEN` | GitHub, `production` environment | Lets the deploy workflow deploy the Vercel project `warehaus-portal`. |
| `DEPLOY_REPORT_SECRET` | GitHub, `production` environment, and production Convex | Signs the workflow's step reports to the Portal. The same value in both places. |
| `DEPLOY_GITHUB_TOKEN` | Production Convex | Lets the Portal start the deploy workflow and read which commits are on `main`. It cannot write to the repository and cannot deploy. |

## 1. Make the report secret

In Terminal:

```bash
openssl rand -hex 32
```

Keep the output for steps 2 and 4. It is used twice.

## 2. GitHub: the `production` environment

In the `warehauscollective/warehaus` repository on GitHub:

1. Settings, then Environments, then New environment. Name it `production`.
2. Deployment branches and tags: choose Selected branches and tags, and add `main`. Leave Required reviewers off: pressing the button in the Portal is the approval.
3. Under Environment secrets, add three secrets:
   - `CONVEX_DEPLOY_KEY`: in the Convex dashboard open the production deployment `unique-turtle-383`, then Settings, then Deploy keys, and generate a production deploy key. It starts with `prod:`. The workflow refuses any other kind.
   - `VERCEL_TOKEN`: in Vercel, Account Settings, then Tokens. Create a token scoped to the Warehaus team.
   - `DEPLOY_REPORT_SECRET`: the value from step 1.

## 3. GitHub: the token for the Portal

1. Your GitHub Settings, then Developer settings, then Personal access tokens, then Fine-grained tokens, then Generate new token.
2. Resource owner: `warehauscollective`. Repository access: Only select repositories, `warehaus`.
3. Repository permissions:
   - Actions: Read and write (starts the workflow).
   - Contents: Read-only (lists the commits on `main`).
   - Metadata: Read-only (added by GitHub).
4. Generate it and keep the value for step 4.

This token is wider than the "can only start workflows" token ADR-0009 describes, by one permission: it can also read the repository. The confirm step needs that to list the commits that go out. It still cannot write to the repository.

## 4. Convex: production environment variables

In the Convex dashboard, production deployment `unique-turtle-383`, Settings, then Environment Variables. Add:

- `DEPLOY_GITHUB_TOKEN`: the token from step 3.
- `DEPLOY_REPORT_SECRET`: the value from step 1.

Do not set either on shared dev `graceful-mastiff-960`.

## 5. Check it

1. Open the Warehaus Portal project page in production. When `main` holds commits production does not run, the counter and the Deploy to main button show between the runner chip and New milestone.
2. Press Deploy to main. The confirm step lists the milestones and commits that go out.
3. Confirm. The dialog shows Convex, then Vercel. When both finish, the counter clears and each milestone reads Shipped · Deployed.

## If a deploy fails

The counter reads Deploy failed and an Ask opens on you when a milestone was in the run. Open the dialog for the workflow log. Retry runs the deploy again from the same commit; both deploys are safe to repeat.

## Turning it off

Delete `DEPLOY_GITHUB_TOKEN` from production Convex. The button hides at once and no run can start.
