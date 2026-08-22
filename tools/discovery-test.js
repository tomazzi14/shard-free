// Paso 2: probar el descubrimiento entre dos máquinas de la misma red.
// Uso:  node tools/discovery-test.js [etiqueta]
//   o:  bare tools/discovery-test.js [etiqueta]

const LanDiscovery = require('../lib/lan-discovery.js')

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

const disco = new LanDiscovery({
  id: `${os.hostname()}-${Math.random().toString(16).slice(2, 8)}`,
  ficha: {
    etiqueta,
    ramGB: +(os.totalmem() / 1073741824).toFixed(1),
    cores: os.availableParallelism ? os.availableParallelism() : os.cpus().length,
    rpcPort: 50052
  }
})

disco.on('listening', (info) => {
  console.log(`[${etiqueta}] escuchando en ${info.address}:${info.puerto} (red ${info.cidr})`)
})

disco.on('sweep', (info) => {
  console.log(`[${etiqueta}] barriendo ${info.total} direcciones de ${info.red}`)
})

disco.on('peer', (peer) => {
  console.log(`\n*** PEER ENCONTRADO: ${peer.ficha.etiqueta} en ${peer.address} ***`)
  console.log(
    `    ${peer.ficha.ramGB}GB RAM, ${peer.ficha.cores} cores, rpc:${peer.ficha.rpcPort}\n`
  )
})

disco.on('peer-lost', (peer) => {
  console.log(`\n*** PEER PERDIDO: ${peer.ficha.etiqueta} (${peer.address}) ***\n`)
})

disco.on('error', (err) => console.error(`[${etiqueta}] ERROR:`, err.message))

disco.start()
