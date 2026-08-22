// Preguntarle al modelo repartido entre las máquinas de la red.
// Uso:  node tools/ask.js "tu pregunta" [etiqueta] [puertoRpc] [ofreceGB]
//
// Espera a que el modelo esté completo antes de preguntar. Si al cabo de ESPERA_MAX
// siguen faltando capas, no inventa una respuesta: dice cuáles faltan y se va.

const LanDiscovery = require('../lib/lan-discovery.js')
const planificar = require('../lib/shard-plan.js')
const inferir = require('../lib/inferencia.js')

const os = (() => {
  try {
    return require('bare-os')
  } catch {
    return require('os')
  }
})()

// En Bare no hay `process`. bare-process lo emula; para el argv seguimos usando Bare.argv,
// que es lo que tenemos verificado.
const proc = (() => {
  try {
    return require('bare-process')
  } catch {
    return process
  }
})()

const escribir = (txt) => proc.stdout.write(txt)
const salir = (code) => (typeof Bare !== 'undefined' ? Bare.exit(code) : proc.exit(code))
const argv = typeof Bare !== 'undefined' ? Bare.argv.slice(1) : process.argv

const pregunta = argv[2]
const etiqueta = argv[3] || os.hostname()
const rpcPort = Number(argv[4]) || 50052
const ramGB = +(os.totalmem() / 1073741824).toFixed(1)
const ofreceGB = Number(argv[5]) || +(ramGB / 2).toFixed(1)

const MODELO = './models/Llama-3.2-3B-Instruct-Q4_K_M.gguf'
const ESPERA_MAX = 30000

if (!pregunta) {
  console.error('falta la pregunta: node tools/ask.js "cual es la capital de Argentina?"')
  salir(1)
}

const ficha = { etiqueta, ramGB, rpcPort, ofreceGB }
const disco = new LanDiscovery({ id: `${os.hostname()}-${rpcPort}`, ficha })
const propio = { id: disco.id, address: '127.0.0.1', ficha }

const plan = () => planificar({ peers: [propio, ...disco.peers.values()] })

let preguntado = false

function preguntar() {
  if (preguntado) return
  preguntado = true

  const p = plan()
  console.log('')
  for (const a of p.asignaciones) {
    console.log(
      `  capas ${String(a.desde).padStart(2)}-${String(a.hasta).padEnd(2)}  ${a.rpc}  ${a.etiqueta}`
    )
  }
  console.log(`\n> ${pregunta}\n`)

  inferir(p, { modelo: MODELO, prompt: pregunta, nPredict: 64 })
    .on('salida', escribir)
    .on('error', (err) => {
      console.error(`\nSIN RESPUESTA: ${err.message}`)
      disco.stop()
      salir(1)
    })
    .on('fin', () => {
      console.log('')
      disco.stop()
      salir(0)
    })
}

disco.on('listening', () => {
  console.log(`[${etiqueta}] presta ${ofreceGB}GB, rpc en :${rpcPort}. Buscando peers...`)
})

disco.on('peer', (peer) => {
  const p = plan()
  console.log(
    `[${etiqueta}] + ${peer.ficha.etiqueta} (${peer.address}) -> ${p.cubiertas}/${p.capas} capas`
  )
  if (p.completo) preguntar()
})

disco.on('error', (err) => console.error(`[${etiqueta}] ERROR:`, err.message))

disco.start()

// Si nadie más aparece, preguntamos igual: inferir() se va a negar y va a decir qué falta.
setTimeout(preguntar, ESPERA_MAX)
