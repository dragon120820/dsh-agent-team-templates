window.__ModuleLoader__.load({
  id: 'dsh-plugin-att-spike',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')

    function Probe(props) {
      const [out, setOut] = React.useState('idle')
      const [busy, setBusy] = React.useState(false)

      const run = async () => {
        setBusy(true)
        try {
          const ctx = window.__attCtx
          if (!ctx) throw new Error('client ctx not captured')
          const r = await ctx.remote.commands.execute(
            props.sessionId,
            '/att-spike',
            [],
            new AbortController().signal,
          )
          setOut(JSON.stringify(r))
        } catch (e) {
          setOut('ERR ' + String(e && e.stack ? e.stack : e))
        } finally {
          setBusy(false)
        }
      }

      return React.createElement(
        'div',
        { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
        React.createElement(
          'button',
          {
            type: 'button',
            disabled: busy,
            onClick: run,
            style: {
              minHeight: 28,
              padding: '3px 8px',
              borderRadius: 6,
              border: 0,
              cursor: 'pointer',
              background: 'transparent',
              color: 'var(--dsw-alias-label-tertiary)',
              fontSize: 12,
            },
          },
          'probe',
        ),
        React.createElement(
          'span',
          {
            style: {
              maxWidth: 260,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 11,
              color: 'var(--dsw-alias-label-caption)',
            },
          },
          out,
        ),
      )
    }

    function SettingsTab() {
      return React.createElement(
        'div',
        { style: { padding: 16, fontSize: 13, color: 'var(--dsw-alias-label-primary)' } },
        'settings tab alive',
      )
    }

    function apply(ctx) {
      window.__attCtx = ctx

      ctx.effect(
        () =>
          ctx.slots.register(
            {
              name: 'conversation.session.header.actions',
              id: 'att-spike',
              order: -50,
            },
            Probe,
          ),
        'att-spike:header',
      )

      try {
        ctx.effect(
          () =>
            ctx.slots.register(
              {
                name: 'settings.plugins.tab',
                id: 'att-spike',
                order: 10,
                title: 'ATT Spike',
              },
              SettingsTab,
            ),
          'att-spike:settings',
        )
        console.log('[att-spike] settings.plugins.tab registered')
      } catch (e) {
        console.log('[att-spike] settings.plugins.tab FAILED', String(e))
      }

      console.log('[att-spike] client applied')
    }

    exports.apply = apply
    exports.inject = ['slots', 'sessions', 'remote']
    return module.exports
  },
})
