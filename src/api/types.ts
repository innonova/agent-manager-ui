// Mirrors agent-manager's models; see ../agent-manager/docs/design.md.
export interface User {
  id: string
  name: string
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
}

export interface AgentStatus {
  state: AgentState
  error: string | null
  lastActivityAt: number
}

export type Item =
  | { kind: 'user'; text: string }
  | { kind: 'text'; text: string; streaming: boolean }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_use'; id: string; name: string; input: unknown }
  | { kind: 'tool_result'; toolUseId: string; output: string; isError: boolean }
  | { kind: 'error'; message: string }
  | { kind: 'system'; text: string }
  | { kind: 'turn_end'; usage?: Record<string, unknown>; costUsd?: number; durationMs?: number }

export interface StoredItem {
  index: number
  sessionId: string
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
  | { type: 'hello'; user: string; daemon: { connected: boolean } }
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
}
