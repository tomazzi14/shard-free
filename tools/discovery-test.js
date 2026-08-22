// Descubrimiento + banda de estado del modelo, entre las máquinas de la red local.
// Uso:  node tools/discovery-test.js [etiqueta] [puertoRpc] [ofreceGB]
//   o:  bare tools/discovery-test.js [etiqueta] [puertoRpc] [ofreceGB]
//
// ofreceGB es cuánta memoria presta esta máquina. Por defecto la mitad de la RAM, que en
// una laptop moderna alcanza para el modelo entero: para ver el reparto entre varias hay
// que bajarlo (1GB = 15 capas de las 28).

const Nodo = require('../lib/nodo.js')

// En Bare no existe `process`; en Node no existe `Bare`. El optional chaining no alcanza:
// referenciar una variable no declarada lanza ReferenceError, hay que usar typeof.
const argv = typeof Bare !== 'undefined' ? Bare.argv.slice(1) : process.argv

const nodo = new Nodo({
  etiqueta: argv[2],
  rpcPort: Number(argv[3]) || 50052,
  ofreceGB: Number(argv[4]) || undefined
})

const { etiqueta, ramGB, ofreceGB, rpcPort } = nodo.ficha

nodo.on('listening', (info) => {
  console.log(`[${etiqueta}] escuchando en ${info.address}:${info.puerto} (red ${info.cidr})`)
  console.log(`[${etiqueta}] presta ${ofreceGB}GB de ${ramGB}GB, rpc en :${rpcPort}`)
})

nodo.on('sweep', (info) => {
  const mudas = Object.entries(info.sinRespuesta)
    .map(([code, n]) => `${n} ${code}`)
    .join(', ')
  const anterior = mudas ? ` (barrido anterior: ${mudas})` : ''
  console.log(`[${etiqueta}] barriendo ${info.total} direcciones de ${info.red}${anterior}`)
})

nodo.on('peer', (peer) => {
  console.log(`\n*** PEER ENCONTRADO: ${peer.ficha.etiqueta} en ${peer.address} ***`)
  console.log(`    ${peer.ficha.ramGB}GB RAM, ${peer.ficha.cores} cores, rpc:${peer.ficha.rpcPort}`)
})

nodo.on('peer-lost', (peer) => {
  console.log(`\n*** PEER PERDIDO: ${peer.ficha.etiqueta} (${peer.address}) ***`)
})

nodo.on('estado', (plan) => {
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
    const rango = `${String(a.desde).padStart(2)}-${String(a.hasta).padEnd(2)}`
    console.log(`  capas ${rango}  ${a.rpc}  ${a.etiqueta}`)
  }
  console.log(`  --rpc ${plan.rpc || '(vacio)'}`)
  console.log('-'.repeat(64) + '\n')
})

nodo.on('error', (err) => console.error(`[${etiqueta}] ERROR:`, err.message))

nodo.start()
