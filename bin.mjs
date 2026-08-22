import { command, flag, summary } from 'paparam'
import { persistent } from 'bare-storage'
import process from 'bare-process'
import os from 'bare-os'
import { isWindows } from 'which-runtime'
import path from 'bare-path'
import pkg from './package.json'
import App from './app.js'
import Nodo from './lib/nodo.js'
import banda from './lib/banda.js'
import Panel from './lib/panel.js'

const appName = pkg.productName || pkg.name
const isDev = path.basename(Bare.argv[0]) === (isWindows ? 'bare.exe' : 'bare')

const cmd = command(
  appName,
  summary(pkg.description),
  flag('--version|-v', 'Print the current version'),
  flag('--storage <dir>', 'custom storage directory'),
  flag('--no-updates', 'disable OTA updates for this run'),
  flag('--label <name>', 'name this machine shows to the other peers'),
  flag('--port <n>', 'port where this machine serves its layers (default 50052)'),
  flag('--offer <gb>', 'how much memory this machine lends (default: half its RAM)'),
  flag('--model <path>', 'path to the .gguf'),
  flag('--llama <path>', 'path to llama-cli'),
  flag('--ask <question>', 'ask once the model is complete, then exit'),
  flag('--panel <port>', 'web panel port (default 7777)'),
  flag('--no-panel', 'run without the web panel')
)

cmd.parse(Bare.argv.slice(isDev ? 2 : 1))
if (cmd.flags.help) Bare.exit()
if (cmd.flags.version) {
  console.log(`${appName} v${pkg.version}`)
  Bare.exit()
}

const updates = cmd.flags.updates
const storage = cmd.flags.storage || (isDev ? null : path.join(persistent(), appName))
const dir = storage || path.join(os.tmpdir(), 'pear', appName)

console.log(`Updates: ${updates === false ? 'disabled' : 'enabled'}`)

const app = new App({
  dir,
  app: isDev ? null : os.execPath(),
  updates,
  version: pkg.version,
  upgrade: pkg.upgrade,
  name: isWindows ? appName + '.exe' : appName
})

// El worker del template avisa cosas suyas ('Hello from worker', dónde guarda el estado).
// No aportan nada al usuario y ensucian la banda, así que no se imprimen. Lo que sí importa
// de ese worker son las actualizaciones, que tienen sus propios eventos acá abajo.
app.on('message', () => {})
app.on('updating', () => console.log('[updater] getting new update'))
app.on('updating-delta', (delta) => console.log('[updater]', delta))
app.on('updated', () => console.log('[updater] update complete... applying'))
app.on('update-applied', () =>
  console.log('[updater] applied update, restart to run latest version')
)
app.on('error', (err) => console.error('[app:error]', err))

let nodo = null
let panel = null
const apagar = (code) => {
  panel?.stop()
  nodo?.stop()
  return app.exit(code)
}

process.on('SIGHUP', () => apagar(129))
process.on('SIGINT', () => apagar(130))
process.on('SIGQUIT', () => apagar(131))
process.on('SIGTERM', () => apagar(143))

try {
  await app.ready()
} catch (err) {
  console.error('[app:error]', err)
  await app.close().finally(() => Bare.exit(1))
}

// A partir de acá la app deja de ser el template y es Shard: presta capas, busca a las
// otras maquinas y dice si entre todas alcanzan para el modelo entero.
nodo = new Nodo({
  etiqueta: cmd.flags.label,
  rpcPort: Number(cmd.flags.port) || undefined,
  ofreceGB: Number(cmd.flags.offer) || undefined,
  modelo: cmd.flags.model || undefined,
  binario: cmd.flags.llama || undefined
})

const { etiqueta, ramGB, ofreceGB, rpcPort } = nodo.ficha

nodo.on('listening', (info) => {
  console.log(
    `\n[${etiqueta}] en ${info.address}, presta ${ofreceGB}GB de ${ramGB}GB, capas en :${rpcPort}`
  )
})

nodo.on('peer', (peer) => {
  console.log(
    `\n+ ${peer.ficha.etiqueta} (${peer.address}) - ${peer.ficha.ramGB}GB, ${peer.ficha.cores} cores`
  )
})

nodo.on('peer-lost', (peer) => {
  console.log(`\n- ${peer.ficha.etiqueta} (${peer.address}) se fue`)
})

nodo.on('estado', (plan) => console.log('\n' + banda(plan, pkg.version).join('\n')))
nodo.on('error', (err) => console.error('[nodo:error]', err.message))

// El panel se levanta antes de arrancar el nodo, para no perderse el primer estado.
if (cmd.flags.panel !== false) {
  // Ojo: con --no-panel, paparam deja flags.panel en true, y Number(true) es 1. Sin este
  // typeof, el panel termina intentando escuchar en el puerto 1.
  const puerto = typeof cmd.flags.panel === 'string' ? Number(cmd.flags.panel) : undefined

  panel = new Panel({ nodo, puerto, version: pkg.version })
  panel.on('error', (err) => console.error('[panel:error]', err.message))
  panel.start()
  console.log(`Panel en http://localhost:${panel.puerto}`)
}

nodo.start()

if (cmd.flags.ask) {
  let preguntado = false
  nodo.on('estado', (plan) => {
    if (!plan.completo || preguntado) return
    preguntado = true
    console.log(`\n> ${cmd.flags.ask}\n`)
    nodo
      .preguntar(cmd.flags.ask)
      .on('salida', (txt) => process.stdout.write(txt))
      .on('error', (err) => console.error(`\nSIN RESPUESTA: ${err.message}`))
      .on('fin', () => apagar(0))
  })
} else {
  console.log(`\nShard v${pkg.version} corriendo. Ctrl+C para parar.\n`)
}
