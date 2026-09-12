// Mirrors agent-manager's models; see ../agent-manager/docs/design.md.
export interface User {
  id: string
  name: string
}

export interface Project {
  id: string
  name: string
  path: string
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
  | {
      type: 'agent.session'
      agentId: string
      session: { daemonSessionId: string; startedAt: number; endedAt: number | null }
    }
