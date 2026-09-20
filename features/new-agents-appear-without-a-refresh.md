---
title: a new agent appears in every open tab without a refresh
status: planned
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
