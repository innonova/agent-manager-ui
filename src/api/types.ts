// Mirrors agent-manager's models; see ../agent-manager/docs/design.md.
export interface User {
  id: string
  name: string
  createdAt: number
  lastLoginAt: number | null
}

export interface Repo {
  name: string
  path: string
}

/** What a project takes on create/update; a missing name is derived from the directory name. */
export interface RepoInput {
  name?: string
  path: string
}

export interface Project {
  id: string
  name: string
  /** The machine the project is on; a hub shows several. */
  host?: string
  /** Path of the primary repository (repos[0]). */
  path: string
  repos: Repo[]
  defaultProfile: string | null
  createdAt: number
}

export type AgentState =
  'starting' | 'idle' | 'working' | 'waiting-input' | 'waiting-permission' | 'error' | 'exited'

export type AgentCounts = Record<AgentState, number>

export interface Agent {
  id: string
  projectId: string
  name: string
  profile: string
  cwd: string
  vendorConversationId: string | null
  currentSessionId: string | null
  createdAt: number
  archivedAt: number | null
  /** `ask`: gated tools wait for the human; `bypass`: the agent acts freely. */
  permissions: 'bypass' | 'ask'
  /** Vendor model and effort names passed at session start; null is the vendor's default. */
  model: string | null
  effort: string | null
  /** What the agent was told about running here at its last session start; null when the note is off. */
  harnessNote?: string | null
}

export interface HostStatus {
  name: string
  local: boolean
  /** The hub's link to this host's event stream. */
  connected: boolean
  /** The host's link to its own daemon. */
  daemon: boolean
  /** The hub's last request to it failed; what it said. */
  error?: string
}

export interface PresenceUser {
  userId: string
  name: string
  typing: boolean
}

export interface PermissionOption {
  id: string
  kind: 'allow' | 'allow-always' | 'deny'
  label: string
}

export interface AgentStatus {
  state: AgentState
  error: string | null
  lastActivityAt: number
  /** Background jobs the agent left running; it will start a turn by itself when they finish. */
  background: number
  /** The model the vendor reports as active, once it has said. */
  model: string | null
  /** Messages held for the next turn because the vendor could not take one mid-turn. */
  queued: number
  /** The vendor account's limits as last reported through this agent. */
  usage: AccountUsage | null
}

export interface AccountUsage {
  windows: { name: string; usedPercent: number; resetsAt: number | null }[]
  status?: 'ok' | 'warning' | 'rejected'
  plan?: string
  context?: { used: number; size: number }
  spend?: { inputTokens: number; outputTokens: number; costUsd?: number; turns: number }
  /** The agent's spend across all its sessions; only once it has been restarted (the vendor's counters start over). */
  total?: { inputTokens: number; outputTokens: number; costUsd?: number; turns: number }
  provider?: string
  at: number
}

export interface AccountUsageRow {
  profile: string
  agentId: string
  usage: AccountUsage
}

/** An image sent with a turn: base64 with its media type. */
export interface TurnImage {
  mediaType: string
  data: string
}

export type Item =
  | { kind: 'user'; text: string; by?: string; images?: TurnImage[] }
  | { kind: 'text'; text: string; streaming: boolean }
  | { kind: 'thinking'; text: string }
  | {
      kind: 'permission'
      requestId: string
      tool: string
      title: string
      input: unknown
      options: PermissionOption[]
      decision: string | null
    }
  | { kind: 'tool_use'; id: string; name: string; input: unknown }
  | { kind: 'tool_result'; toolUseId: string; output: string; isError: boolean }
  | { kind: 'error'; message: string }
  | { kind: 'system'; text: string }
  | { kind: 'turn_end'; usage?: Record<string, unknown>; costUsd?: number; durationMs?: number }

export interface StoredItem {
  index: number
  sessionId: string
  /** When the item first appeared, unix ms. */
  at: number
  seqFrom: number
  seqTo: number
  item: Item
}

export interface Profile {
  name: string
  description?: string
  supported: boolean
}

export type EventFrame =
  | {
      type: 'hello'
      user: string
      daemon: { connected: boolean }
      presence?: Record<string, PresenceUser[]>
      uiBuild?: string | null
      hosts?: HostStatus[]
    }
  | { type: 'ui.build'; id: string | null }
  | { type: 'hosts'; hosts: HostStatus[] }
  | { type: 'host.reconnected'; name: string }
  | { type: 'daemon'; connected: boolean }
  | { type: 'project.counts'; projectId: string; counts: AgentCounts }
  | { type: 'agent.state'; agentId: string; projectId: string; status: AgentStatus }
  | { type: 'agent.item'; agentId: string; item: StoredItem }
  | { type: 'agent.reset'; agentId: string }
  | { type: 'feature.changed'; projectId: string; feature: Feature }
  | {
      type: 'agent.session'
      agentId: string
      session: { daemonSessionId: string; startedAt: number; endedAt: number | null }
    }
  | { type: 'users.changed'; users: User[] }
  | { type: 'presence'; agents: Record<string, PresenceUser[]> }

export interface DirEntry {
  name: string
  path: string
  type: 'file' | 'dir' | 'symlink' | 'other'
  size: number
  mtime: number
  /** git ignores it (or it is `.git`); shown greyed like in VS Code. */
  ignored: boolean
  /** git status; a directory carries the most significant status of its contents. */
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'conflict' | null
}

export interface FileContent {
  path: string
  size: number
  mtime: number
  content: string
  binary: boolean
  truncated: boolean
}

export type FeatureStatus = 'planned' | 'in-progress' | 'review' | 'blocked' | 'done'

export interface Feature {
  slug: string
  repo: string
  /** <repo>/features/<slug>.md */
  path: string
  title: string
  status: FeatureStatus
  priority: number
  dependsOn: string[]
  /** The spec, followed by `## Report` (agent) and `## Response` (human) sections. */
  body: string
  mtime: number
  /** Per repository, the commits the work spans; recorded at in-progress and done. */
  range: Record<string, { base: string; end: string | null }> | null
}

export type ChangeStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
export interface ChangedFile {
  /** <repo>/path */
  path: string
  status: ChangeStatus
  oldPath?: string
}
export interface RepoChanges {
  repo: string
  base: string | null
  head: string | null
  note: string | null
  files: ChangedFile[]
}
export interface FileDiff {
  path: string
  base: string | null
  before: string | null
  after: string | null
  binary: boolean
  truncated: boolean
}
