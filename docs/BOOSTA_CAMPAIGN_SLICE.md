# Boosta campaign vertical slice

This slice proves the governed path from an operator campaign request to durable Mission evidence:

```text
Campaign request -> Mission -> Boosta Marketing agent -> human draft approval
  -> n8n package verification -> publish-ready artifact -> audit + candidate memory
```

## Operator flow

1. Open **Content pipeline** and complete **Request campaign**.
2. The server validates bounded destinations and languages, creates the Mission and EditorialJob together, and writes the campaign brief beneath `BOOSTA_WORKSPACE_ROOT`.
3. The autonomy worker drafts Swedish and English content as `boosta-marketing` and opens the `campaign-draft` Mission approval.
4. Select **Approve draft** or **Regenerate**. The agent cannot approve its own work.
5. Approval permits the worker to invoke the bounded n8n verification webhook. It does not permit external publishing.
6. A successful verification produces a publish-ready Markdown artifact, completes the Mission, writes audit evidence, and stores an `OPERATIONAL/CANDIDATE` memory record for later human review.

## Required configuration

```text
N8N_CAMPAIGN_WEBHOOK_URL=http://127.0.0.1:5678/webhook/boosta-campaign-verify
```

The webhook must return JSON containing `status: "verified"`, a non-empty `workflow`, and an ISO `checkedAt`. Missing configuration, non-2xx responses, malformed JSON, and non-verified results fail closed and place the editorial job and Mission in a failed state.

## Security boundaries

- Campaign inputs are length bounded and destinations/languages are allowlisted.
- The Marketing agent may draft and request verification but cannot publish externally.
- n8n is invoked only after a recorded human `campaign-draft` approval.
- Memory is stored as a candidate and cannot be self-approved by the agent.
- Audit metadata contains identifiers and checksums, not model prompts or credentials.

## Rollback

Disable the campaign intake route/UI and autonomy service, then roll back application code. The additive database columns may remain safely. If explicit schema rollback is approved after a verified backup, remove the `EditorialJob_missionId_fkey`, its two indexes, and the `missionId`, `verifiedAt`, and `verification` columns.
