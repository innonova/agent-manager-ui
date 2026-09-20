---
title: a new agent appears in every open tab without a refresh
status: done
priority: 40
---

**Purpose.** When an agent is created, by a person in another tab or by
an agent with `am new`, everyone looking at that project should see it
appear in the sidebar tree and the agent list at once, the way a
state change or a new transcript item already appears. Today the
person has to refresh the page to see agents that were added; on a
day when agents start other agents, that is most of them.

**Requirements.**
- A new agent shows up in every open tab within a moment of its
  creation: in the tree under its project, in the project's agent
  list, with its state as it stands, and the project's counts move
  with it.
- The same for the other way round: an agent that is archived or
  forgotten elsewhere leaves every tab (forgetting already broadcasts
  `agent.removed`; archiving may not).
- No polling. The event stream is the channel, as for everything else.
- On a hub, an agent created on a spoke appears the same way (the hub
  forwards the spokes' frames with ids prefixed).

**Facts.** The manager broadcasts `agent.state`, `agent.item`,
`agent.session`, `agent.reset`, `agent.removed` and `project.counts`
on `/api/events` (`src/events/events.gateway.ts`; the list is in
`docs/design.md` under the websocket). Creating an agent emits a state
frame for an id the UI has never seen, and the UI's agents store
(`src/stores/agents.ts`) ignores state frames for unknown ids; the
tree and the list read `agents.byProject`, filled once by
`agents.load(projectId)`. The counts badge updates because
`project.counts` is applied to the projects store. Playwright drives
two tabs elsewhere in `e2e/app.spec.ts` (search for `context.newPage`
or a second `page`) if a two-tab check is wanted; the fake agent is
enough. The UI's suite owns port 4299, one run at a time; the manager
must be built (`npm run build` in `../agent-manager`) before it runs.

**Worth.** A small round: one frame or one store rule, a test, a line
in each design doc. If it grows past that, say why.

**Gate.** Worked alone. Each repository touched gets its full gate and
its own commit; no push, no deploy; the delegating agent closes the
gate and deploys.

## Report (2026-09-20)

**What changed.** Two new websocket frames rather than the store rule
the feature's Facts leaned toward, agreed in the plan:

- *agent-manager.* `create()` emits a new `agent.created` carrying the
  whole agent record and its status; `archive()` emits a new
  `agent.archived` (`{ agentId, projectId }`). Both are on the
  `AgentEvents` interface, wired in `events.gateway.ts`, and documented
  in the websocket frame list in `docs/design.md`. Chosen over
  materialising on an unknown `agent.state`: the state frame carries no
  agent record, so that route needs an async fetch on every unknown-id
  frame plus a race guard (a new agent emits `starting`→`idle`+counts in
  a burst); a dedicated frame is synchronous and symmetric with the
  `agent.removed` it mirrors. `agent.archived` rather than reusing
  `agent.removed` keeps the design's own distinction (archived is off
  the active list but still readable; removed is gone).
- *agent-manager-ui.* The agents store handles `agent.created` (adds the
  row, **only where the project's list is already loaded in this tab** —
  otherwise a project we have not loaded would be left a partial list of
  one; opening it later fetches the whole list; idempotent, since the
  creating tab added the row optimistically and hears its own frame) and
  `agent.archived` (drops it from the active list via the existing
  `forget()`). `ProjectTree.vue` reloads the "archived" row on
  `agent.archived` too, so a newly-archived agent appears there live.
  Types in `api/types.ts`. `docs/design.md` sidebar and testing sections
  updated.

Counts already moved live via `project.counts`; left untouched. A tab
with the agent's own page open when it is archived elsewhere is left as
it is (transcript stays valid and readable, as for a remove today) — the
one behaviour we agreed to note and not grow.

**What was verified, and how.**
- *agent-manager* full gate: `npm run build` clean, `npm test` 116
  unit (incl. the new `test/hub-prefix.spec.ts`), `npm run test:e2e`
  120 e2e, `npm run lint` clean (the one warning is pre-existing, in
  `scripts/smoke-agents.mjs`, not touched here).
- The hub path — which the plan agreed to cover by unit test rather
  than a hub e2e — is pinned by `test/hub-prefix.spec.ts`: `rewriteFrame`
  prefixes the agent record's `id`/`projectId` inside an `agent.created`
  frame and the ids of an `agent.archived` frame, and does not
  false-prefix an object that lacks the agent shape.
- *agent-manager-ui* full gate: `npm run test:unit` 8 (incl. the new
  store cases: added only when the project is loaded, ignored otherwise,
  idempotent for the creating tab, dropped on archive), `npm run lint`
  clean, `npm run build` clean, `npm run test:e2e` 24 including a new
  two-tab test (`e2e/app.spec.ts`): tab A on a project sees an agent
  created in tab B appear with its state and then leave on archive,
  neither with a reload.

**What is left open.** Nothing in the feature's scope. Not pushed, not
deployed, per the gate: the delegating agent closes and deploys.

**What I noticed and left alone.**
- A tab *viewing* an archived agent's page is not navigated away for a
  remote archive (only the acting tab navigates); its transcript stays
  readable. Agreed as out of scope and noted here.
- Project creation and deletion have no live frame at all: there is no
  `project.created`/`project.removed`, and `removeProject()`
  (`agents.service.ts`) forgets its agents without emitting
  `agent.removed` per agent. So a project added or deleted elsewhere
  lingers in other tabs until a refresh — the project-level analogue of
  this very feature, and a natural companion to it. Outside this
  feature's scope; noticed by reading, not chased down.

Gated alone, both repositories.
