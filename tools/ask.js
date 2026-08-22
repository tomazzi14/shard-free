// Preguntarle al modelo repartido entre las máquinas de la red.
// Uso:  node tools/ask.js "tu pregunta" [etiqueta] [puertoRpc] [ofreceGB]
//
// Espera a que el modelo esté completo antes de preguntar. Si al cabo de ESPERA_MAX
// siguen faltando capas, no inventa una respuesta: dice cuáles faltan y sale con 1.

const Nodo = require('../lib/nodo.js')

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

const ESPERA_MAX = 30000
const pregunta = argv[2]

if (!pregunta) {
  console.error('falta la pregunta: node tools/ask.js "cual es la capital de Argentina?"')
  salir(1)
}

const nodo = new Nodo({
  etiqueta: argv[3],
  rpcPort: Number(argv[4]) || 50052,
  ofreceGB: Number(argv[5]) || undefined
})

const { etiqueta, ofreceGB, rpcPort } = nodo.ficha
let preguntado = false

function preguntar() {
  if (preguntado) return
  preguntado = true

  const plan = nodo.plan()
  console.log('')
  for (const a of plan.asignaciones) {
    const rango = `${String(a.desde).padStart(2)}-${String(a.hasta).padEnd(2)}`
    console.log(`  capas ${rango}  ${a.rpc}  ${a.etiqueta}`)
  }
  console.log(`\n> ${pregunta}\n`)

  nodo
    .preguntar(pregunta, { nPredict: 64 })
    .on('salida', escribir)
    .on('error', (err) => {
      console.error(`\nSIN RESPUESTA: ${err.message}`)
      nodo.stop()
      salir(1)
    })
    .on('fin', () => {
      nodo.stop()
      salir(0)
    })
}

nodo.on('listening', () => {
  console.log(`[${etiqueta}] presta ${ofreceGB}GB, rpc en :${rpcPort}. Buscando peers...`)
})

nodo.on('peer', (peer) => {
  const plan = nodo.plan()
  console.log(
    `[${etiqueta}] + ${peer.ficha.etiqueta} (${peer.address}) -> ${plan.cubiertas}/${plan.capas} capas`
  )
})

nodo.on('estado', (plan) => {
  if (plan.completo) preguntar()
})

nodo.on('error', (err) => console.error(`[${etiqueta}] ERROR:`, err.message))

nodo.start()

// Si nadie más aparece, preguntamos igual: la inferencia se va a negar y va a decir qué falta.
setTimeout(preguntar, ESPERA_MAX)
