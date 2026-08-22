// Paso 1: que puede hacer UDP en Bare.
// Prueba unicast, broadcast global y broadcast de subred.
// Uso:  bare tools/udp-smoke.js

const dgram = require('bare-dgram')

const PORT = 41234
const SUBNET_BCAST = '192.168.112.255'
const recibidos = []

const receptor = dgram.createSocket()
receptor.on('message', (msg, rinfo) => {
  recibidos.push(msg.toString())
  console.log(`RECIBIDO "${msg}" de ${rinfo.address}:${rinfo.port}`)
})
receptor.on('error', (err) => console.error('error receptor:', err.message))

const emisor = dgram.createSocket()
emisor.on('error', (err) => console.error('error emisor:', err.message))

function probar (etiqueta, destino) {
  const buf = Buffer.from(etiqueta)
  emisor.send(buf, 0, buf.byteLength, PORT, destino, (err) => {
    console.log(err ? `${etiqueta} -> ${destino}: FALLO (${err.message})` : `${etiqueta} -> ${destino}: enviado`)
  })
}

receptor.bind(PORT, '0.0.0.0', () => {
  console.log(`escuchando en 0.0.0.0:${PORT}\n`)
  probar('unicast', '127.0.0.1')
  probar('bcast-global', '255.255.255.255')
  probar('bcast-subred', SUBNET_BCAST)
})

setTimeout(() => {
  console.log(`\nRESUMEN: llegaron ${recibidos.length} de 3 -> [${recibidos.join(', ')}]`)
  Bare.exit(0)
}, 3000)
