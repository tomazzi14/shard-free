// Descubrimiento + banda de estado del modelo, entre las máquinas de la red local.
// Uso:  node tools/discovery-test.js [etiqueta] [puertoRpc] [ofreceGB]
//   o:  bare tools/discovery-test.js [etiqueta] [puertoRpc] [ofreceGB]
//
// ofreceGB es cuánta memoria presta esta máquina. Por defecto la mitad de la RAM, que en
// una laptop moderna alcanza para el modelo entero: para ver el reparto entre varias hay
// que bajarlo (1GB = 15 capas de las 28).

const LanDiscovery = require('../lib/lan-discovery.js')
const planificar = require('../lib/shard-plan.js')

const os = (() => {
  try {
    return require('bare-os')
  } catch {
    return require('os')
  }
})()

// En Bare no existe `process`; en Node no existe `Bare`. El optional chaining no alcanza:
// referenciar una variable no declarada lanza ReferenceError, hay que usar typeof.
const argv = typeof Bare !== 'undefined' ? Bare.argv.slice(1) : process.argv
const etiqueta = argv[2] || os.hostname()
const rpcPort = Number(argv[3]) || 50052

const ramGB = +(os.totalmem() / 1073741824).toFixed(1)
// La mitad de la RAM deja aire para el resto del sistema.
const ofreceGB = Number(argv[4]) || +(ramGB / 2).toFixed(1)

const ficha = {
  etiqueta,
  ramGB,
  cores: os.availableParallelism ? os.availableParallelism() : os.cpus().length,
  rpcPort,
  ofreceGB
}

const disco = new LanDiscovery({ id: `${os.hostname()}-${rpcPort}`, ficha })

// Esta máquina también aporta capas: entra al plan como un peer más, por loopback.
const propio = { id: disco.id, address: '127.0.0.1', ficha }

function banda() {
  const plan = planificar({ peers: [propio, ...disco.peers.values()] })

  console.log('\n' + '-'.repeat(64))
  if (plan.completo) {
    console.log(`MODEL COMPLETE - ${plan.capas}/${plan.capas} capas servidas`)
  } else {
    console.log(
      `MODEL INCOMPLETE - faltan las capas ${plan.faltan.desde}-${plan.faltan.hasta} ` +
        `(${plan.cubiertas}/${plan.capas} cubiertas)`
    )
  }
  for (const a of plan.asignaciones) {
    console.log(
      `  capas ${String(a.desde).padStart(2)}-${String(a.hasta).padEnd(2)}  ${a.rpc}  ${a.etiqueta}`
    )
  }
  console.log(`  --rpc ${plan.rpc || '(vacio)'}`)
  console.log('-'.repeat(64) + '\n')
}

disco.on('listening', (info) => {
  console.log(`[${etiqueta}] escuchando en ${info.address}:${info.puerto} (red ${info.cidr})`)
  console.log(`[${etiqueta}] presta ${ofreceGB}GB de ${ramGB}GB, rpc en :${rpcPort}`)
  banda()
})

disco.on('sweep', (info) => {
  const mudas = Object.entries(info.sinRespuesta)
    .map(([code, n]) => `${n} ${code}`)
    .join(', ')
  const anterior = mudas ? ` (barrido anterior: ${mudas})` : ''
  console.log(`[${etiqueta}] barriendo ${info.total} direcciones de ${info.red}${anterior}`)
})

disco.on('peer', (peer) => {
  console.log(`\n*** PEER ENCONTRADO: ${peer.ficha.etiqueta} en ${peer.address} ***`)
  console.log(`    ${peer.ficha.ramGB}GB RAM, ${peer.ficha.cores} cores, rpc:${peer.ficha.rpcPort}`)
  banda()
})

disco.on('peer-lost', (peer) => {
  console.log(`\n*** PEER PERDIDO: ${peer.ficha.etiqueta} (${peer.address}) ***`)
  banda()
})

disco.on('error', (err) => console.error(`[${etiqueta}] ERROR:`, err.message))

disco.start()
