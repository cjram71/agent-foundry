# Fork-based execution (P18)

Agent Foundry can execute approved tasks against an authorised GitHub
repository even when its dedicated GitHub account has read-only access. It
never needs write access to the upstream repository: task branches are pushed
to a fork and proposed back to upstream as draft pull requests.

## Routing rule

At workspace setup, `GitHubClient` reads the authenticated viewer's permission
on the authorised repository:

| `viewerPermission` | Branch destination |
| --- | --- |
| `ADMIN`, `MAINTAIN`, `WRITE` | Authorised repository (existing direct-write behaviour) |
| `TRIAGE`, `READ`, missing/unknown | Verified fork owned by the authenticated GitHub user |

For read-only repositories, the client obtains the authenticated login, reuses
that user's existing fork or creates it with `gh repo fork`, and then verifies
all of these properties before pushing:

1. the returned repository has the expected `owner/name`;
2. GitHub marks it as a fork;
3. its parent is the authorised upstream repository; and
4. the authenticated account has write permission to it.

A same-named repository that is not the expected fork fails closed. Authentication,
network, and GraphQL failures are not treated as a missing fork; only a genuine
not-found response permits fork creation.

## Workspace and pull-request topology

The authorised upstream is always the source of the base branch. For a forked
execution, workspace setup produces:

```text
upstream  https://github.com/<authorised-owner>/<repository>.git
origin    https://github.com/<authenticated-user>/<repository>.git
```

The generated `foundry/task-*` branch is pushed to `origin`. Draft pull
requests continue to target the authorised repository and its configured base
branch, but use the explicit head `<authenticated-user>:foundry/task-*`. The
same qualified head is used for P13 replay/adoption, so branches with identical
names in different forks cannot be confused.

Direct-write repositories retain their original `origin`; their PR heads are
also owner-qualified for one deterministic code path.

## Operator requirements

- Authenticate `gh` as a dedicated **user account** capable of creating forks.
  A bare installation token without an authenticated user identity cannot use
  the read-only fork path.
- The upstream must permit forks. Private/internal repository fork policy is
  controlled by its GitHub organisation or enterprise.
- The account must be able to create (or already own) `<login>/<repository>`.
  If an unrelated repository occupies that name, rename/remove it or provision
  the correct fork before retrying.
- The upstream must allow pull requests from the fork. Agent Foundry creates a
  draft only and never merges it automatically.

No database migration or project setting is required. Existing authorised
projects automatically select direct-write or fork execution from GitHub's
current permission at the start of each task.
