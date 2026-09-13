import type {
  FileDiff,
  RepoChanges,
  Agent,
  AgentCounts,
  AgentStatus,
  DirEntry,
  Feature,
  FeatureStatus,
  FileContent,
  Profile,
  Project,
  RepoInput,
  StoredItem,
  User,
} from './types'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Raised on 401 so the app can go back to the login screen. */
export const unauthorized = new EventTarget()

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 401) unauthorized.dispatchEvent(new Event('unauthorized'))
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    const msg = (data as { message?: string | string[] })?.message
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : (msg ?? res.statusText))
  }
  return data as T
}

export const api = {
  login: (name: string, password: string) =>
    call<{ user: User }>('POST', '/api/auth/login', { name, password }),
  logout: () => call<{ ok: true }>('POST', '/api/auth/logout', {}),
  me: () => call<{ user: User }>('GET', '/api/auth/me'),

  projects: () => call<{ project: Project; agentCounts: AgentCounts }[]>('GET', '/api/projects'),
  project: (id: string) =>
    call<{ project: Project; agentCounts: AgentCounts }>('GET', `/api/projects/${id}`),
  createProject: (input: {
    name: string
    repos: RepoInput[]
    defaultProfile?: string | null
    /** The machine to create it on (a hub); absent means this one. */
    host?: string
  }) => call<{ project: Project; agentCounts: AgentCounts }>('POST', '/api/projects', input),
  updateProject: (
    id: string,
    input: { name?: string; repos?: RepoInput[]; defaultProfile?: string | null },
  ) => call<{ project: Project; agentCounts: AgentCounts }>('PATCH', `/api/projects/${id}`, input),
  deleteProject: (id: string) => call<{ ok: true }>('DELETE', `/api/projects/${id}`),
  /** Stops and resumes the project's idle agents so they see its current settings. */
  restartAgents: (id: string) =>
    call<{ restarted: string[]; skipped: { id: string; why: string }[] }>(
      'POST',
      `/api/projects/${id}/agents/restart`,
      {},
    ),

  agents: (projectId: string) =>
    call<{ agent: Agent; status: AgentStatus }[]>('GET', `/api/projects/${projectId}/agents`),
  createAgent: (
    projectId: string,
    input: {
      name: string
      profile?: string
      cwd?: string
      permissions?: 'bypass' | 'ask'
      model?: string
      effort?: string
    },
  ) =>
    call<{ agent: Agent; status: AgentStatus }>('POST', `/api/projects/${projectId}/agents`, input),
  decide: (id: string, requestId: string, option: string) =>
    call<{ ok: true }>('POST', `/api/agents/${id}/permission`, { requestId, option }),
  agent: (id: string) => call<{ agent: Agent; status: AgentStatus }>('GET', `/api/agents/${id}`),
  /** Transcript items by index: everything from `from`, the last `tail`, or `limit` before `before`. */
  items: (id: string, query: { from?: number; tail?: number; before?: number; limit?: number }) => {
    const q = Object.entries(query)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
    return call<{ items: StoredItem[]; total: number }>('GET', `/api/agents/${id}/items?${q}`)
  },
  /** `steer`: while a turn runs, the message goes into it (or is queued) instead of being refused. */
  turn: (id: string, text: string, steer = false) =>
    call<{ ok: true; mode: 'sent' | 'steered' | 'queued' }>('POST', `/api/agents/${id}/turn`, {
      text,
      ...(steer ? { steer: true } : {}),
    }),
  interrupt: (id: string) => call<{ ok: true }>('POST', `/api/agents/${id}/interrupt`, {}),
  stop: (id: string) => call<{ ok: true }>('POST', `/api/agents/${id}/stop`, {}),
  archive: (id: string) => call<{ ok: true }>('POST', `/api/agents/${id}/archive`, {}),

  profiles: () => call<{ profiles: Profile[] }>('GET', '/api/profiles'),
  /** The profiles a project's agents can use: those of the machine it is on. */
  projectProfiles: (projectId: string) =>
    call<{ profiles: Profile[] }>('GET', `/api/projects/${projectId}/profiles`),

  users: () => call<{ users: User[] }>('GET', '/api/users'),
  createUser: (name: string) =>
    call<{ user: User; password: string }>('POST', '/api/users', { name }),
  renameMe: (name: string) => call<{ user: User }>('PATCH', '/api/users/me', { name }),
  resetPassword: (id: string) =>
    call<{ password: string }>('POST', `/api/users/${id}/password`, {}),
  deleteUser: (id: string) => call<{ ok: true }>('DELETE', `/api/users/${id}`),

  files: (projectId: string, path = '') =>
    call<{ path: string; entries: DirEntry[] }>(
      'GET',
      `/api/projects/${projectId}/files?path=${encodeURIComponent(path)}`,
    ),
  file: (projectId: string, path: string) =>
    call<FileContent>('GET', `/api/projects/${projectId}/file?path=${encodeURIComponent(path)}`),

  features: (projectId: string) =>
    call<{ features: Feature[] }>('GET', `/api/projects/${projectId}/features`),
  createFeature: (
    projectId: string,
    input: { slug: string; title: string; body?: string; priority?: number; repo?: string },
  ) => call<{ feature: Feature }>('POST', `/api/projects/${projectId}/features`, input),
  setFeatureStatus: (projectId: string, slug: string, status: FeatureStatus) =>
    call<{ feature: Feature }>('PATCH', `/api/projects/${projectId}/features/${slug}`, { status }),
  updateFeature: (
    projectId: string,
    slug: string,
    patch: { title?: string; body?: string; priority?: number },
  ) => call<{ feature: Feature }>('PATCH', `/api/projects/${projectId}/features/${slug}`, patch),
  changes: (projectId: string, base = 'read') =>
    call<{ base: string; repos: RepoChanges[] }>(
      'GET',
      `/api/projects/${projectId}/changes?base=${encodeURIComponent(base)}`,
    ),
  changedFile: (projectId: string, path: string, base = 'read') =>
    call<FileDiff>(
      'GET',
      `/api/projects/${projectId}/changes/file?path=${encodeURIComponent(path)}&base=${encodeURIComponent(base)}`,
    ),
  markRead: (projectId: string, repo?: string) =>
    call<{ repos: { repo: string; commit: string }[] }>(
      'POST',
      `/api/projects/${projectId}/changes/read`,
      repo ? { repo } : {},
    ),
  respondFeature: (projectId: string, slug: string, text: string, status?: FeatureStatus) =>
    call<{ feature: Feature }>('POST', `/api/projects/${projectId}/features/${slug}/respond`, {
      text,
      status,
    }),
}
