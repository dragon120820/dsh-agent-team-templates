export const name = 'dsh-plugin-att-spike'
export const inject = []

export function apply(ctx) {
  ctx.commands.register({
    name: 'att-spike',
    description: 'ATT spike echo',
    handler: () => ({
      kind: 'success',
      text: JSON.stringify({ ok: true, pid: process.pid, ts: Date.now() }),
    }),
  })
  ctx.logger?.info?.('[att-spike] host applied')
}
