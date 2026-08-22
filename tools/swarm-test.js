// Test minimo de descubrimiento P2P: dos maquinas, mismo topic.
// Uso:  node tools/swarm-test.js [etiqueta]
// Corre lo mismo en ambas maquinas. Si se ven, imprime "PEER CONECTADO".

const Hyperswarm = require('hyperswarm')
const crypto = require('crypto')

const label = process.argv[2] || require('os').hostname()
const topic = crypto.createHash('sha256').update('shard-swarm').digest()

const swarm = new Hyperswarm()
let peers = 0

console.log(`[${label}] topic: ${topic.toString('hex').slice(0, 16)}...`)
console.log(`[${label}] mi clave: ${swarm.keyPair.publicKey.toString('hex').slice(0, 16)}...`)

swarm.on('connection', (conn, info) => {
  peers++
  const remote = info.publicKey.toString('hex').slice(0, 16)
  console.log(`\n*** PEER CONECTADO: ${remote}... (total: ${peers}) ***\n`)

  conn.on('data', (d) => console.log(`[${label}] recibido: ${d.toString()}`))
  conn.on('error', (err) => console.error(`[${label}] error de conexion:`, err.message))
  conn.on('close', () => {
    peers--
    console.log(`[${label}] peer desconectado (quedan: ${peers})`)
  })

  const timer = setInterval(() => conn.write(`hola de ${label}`), 3000)
  conn.on('close', () => clearInterval(timer))
})

swarm.on('error', (err) => console.error(`[${label}] error de swarm:`, err))

const discovery = swarm.join(topic, { server: true, client: true })

discovery.flushed().then(() => {
  console.log(`[${label}] anunciado en el topic. Esperando peers...`)
})

setInterval(() => {
  if (peers === 0) console.log(`[${label}] todavia sin peers... (${new Date().toLocaleTimeString()})`)
}, 10000)

process.on('SIGINT', async () => {
  console.log(`\n[${label}] cerrando...`)
  await swarm.destroy()
  process.exit(0)
})
