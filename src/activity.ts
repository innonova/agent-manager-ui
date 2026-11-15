/**
 * What kind of thing a tool call is, from its name; the transcript already
 * has the command or path, so the line just says the shape of it. Claude
 * Code's, Codex's and Copilot's names, as far as they are known here.
 */
const TOOL_PHRASES: Record<string, string> = {
  Bash: 'running a command',
  shell: 'running a command',
  bash: 'running a command',
  Read: 'reading a file',
  view: 'reading a file',
  Write: 'editing a file',
  Edit: 'editing a file',
  NotebookEdit: 'editing a file',
  edit: 'editing a file',
  create: 'editing a file',
  str_replace_editor: 'editing a file',
  Glob: 'searching',
  Grep: 'searching',
  grep: 'searching',
  glob: 'searching',
  WebSearch: 'searching the web',
  WebFetch: 'fetching a page',
  Agent: 'running a helper',
  Task: 'running a helper',
  TodoWrite: 'updating its plan',
  Skill: 'loading a skill',
  ToolSearch: 'looking up a tool',
  Monitor: 'watching a job',
}
/** A name with no phrase still says which tool: "running WebPreview"; an MCP tool by its own name, its server dropped. */
export function toolPhrase(name: string | null | undefined): string {
  if (!name) return 'waiting for a tool'
  const known = TOOL_PHRASES[name]
  if (known) return known
  const mcp = /^mcp__[^_]+(?:_[^_]+)*__(.+)$/.exec(name)
  return `running ${mcp ? mcp[1] : name}`
}
