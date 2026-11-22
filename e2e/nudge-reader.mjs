// Stands in for the model that reads a stopped agent's last message (agent-manager's "Nudge"):
// whatever it is given, the agent paused with work left, so the manager will ask it.
process.stdin.resume()
process.stdin.on('end', () =>
  console.log(JSON.stringify({ verdict: 'paused', why: 'the next part is still to do' })),
)
