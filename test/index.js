const { test } = require('brittle')
const LanDiscovery = require('../lib/lan-discovery.js')
const { ipsDeSubred } = LanDiscovery

// Socket de mentira: registra lo enviado y permite simular paquetes entrantes.
function socketFalso() {
  const enviados = []
  const oyentes = {}
  return {
    enviados,
    on(evento, fn) {
      oyentes[evento] = fn
    },
    bind(puerto, address, cb) {
      cb()
    },
    send(buf, off, len, puerto, address, cb) {
      enviados.push({ address, sobre: JSON.parse(buf.toString()) })
      if (cb) cb(null)
    },
    close() {
      this.cerrado = true
    },
    recibir(sobre, address) {
      oyentes.message(Buffer.from(JSON.stringify(sobre)), { address, port: 41234 })
    }
  }
}

function nodo(extra = {}) {
  const socket = socketFalso()
  const disco = new LanDiscovery({ id: 'yo', ficha: { rpcPort: 50052 }, socket, ...extra })
  return { disco, socket }
}

test('una /24 son 253 destinos: sin red, sin broadcast, sin uno mismo', (t) => {
  const ips = ipsDeSubred('192.168.1.50', '255.255.255.0')
  t.is(ips.length, 253)
  t.absent(ips.includes('192.168.1.50'), 'no se barre a uno mismo')
  t.absent(ips.includes('192.168.1.0'), 'no se barre la direccion de red')
  t.absent(ips.includes('192.168.1.255'), 'no se barre la de broadcast')
})

test('la /20 real del proyecto cubre las dos laptops', (t) => {
  const ips = ipsDeSubred('192.168.112.241', '255.255.240.0')
  t.is(ips.length, 4093)
  t.ok(ips.includes('192.168.113.16'), 'la otra laptop cae en otro tercer octeto')
})

test('rechaza subredes demasiado grandes', (t) => {
  t.exception(() => ipsDeSubred('10.0.0.1', '255.255.0.0'), /demasiado grande/)
})

test('un HELLO ajeno se responde y el peer queda registrado', (t) => {
  const { disco, socket } = nodo()
  disco.start()

  const encontrados = []
  disco.on('peer', (p) => encontrados.push(p))
  socket.recibir({ t: 'hello', id: 'otro', ficha: { rpcPort: 50053 } }, '192.168.1.9')

  t.is(encontrados.length, 1, 'avisa del peer nuevo')
  t.is(encontrados[0].address, '192.168.1.9')
  t.is(encontrados[0].ficha.rpcPort, 50053, 'guarda la ficha del otro')

  const respuesta = socket.enviados.find((e) => e.address === '192.168.1.9' && e.sobre.t === 'here')
  t.ok(respuesta, 'contesta con HERE a quien saluda')
  t.is(respuesta.sobre.id, 'yo', 'la respuesta lleva la identidad propia')
  disco.stop()
})

test('un HERE registra pero no genera respuesta, para no rebotar al infinito', (t) => {
  const { disco, socket } = nodo()
  disco.start()
  socket.enviados.length = 0

  socket.recibir({ t: 'here', id: 'otro', ficha: {} }, '192.168.1.9')

  t.is(disco.peers.size, 1, 'queda registrado')
  t.is(socket.enviados.length, 0, 'no contesta un HERE')
  disco.stop()
})

test('el mismo peer dos veces avisa una sola vez', (t) => {
  const { disco, socket } = nodo()
  disco.start()

  let avisos = 0
  disco.on('peer', () => avisos++)
  socket.recibir({ t: 'hello', id: 'otro', ficha: {} }, '192.168.1.9')
  socket.recibir({ t: 'hello', id: 'otro', ficha: {} }, '192.168.1.9')

  t.is(avisos, 1)
  t.is(disco.peers.size, 1)
  disco.stop()
})

test('ignora el eco de uno mismo', (t) => {
  const { disco, socket } = nodo()
  disco.start()
  disco.on('peer', () => t.fail('no debe registrarse a si mismo'))

  socket.recibir({ t: 'hello', id: 'yo', ficha: {} }, '192.168.1.50')

  t.is(disco.peers.size, 0)
  disco.stop()
})

test('un paquete ilegible no tumba el proceso', (t) => {
  const { disco, socket } = nodo()
  disco.start()

  const errores = []
  disco.on('error', (e) => errores.push(e))

  disco._onMensaje(Buffer.from('esto no es json'), { address: '192.168.1.9', port: 41234 })

  t.is(errores.length, 1, 'reporta el error')
  t.ok(errores[0].message.includes('192.168.1.9'), 'dice de quien vino')
  t.is(disco.peers.size, 0, 'no registra nada')
  disco.stop()
})

test('stop() es seguro de llamar dos veces', (t) => {
  const { disco } = nodo()
  disco.start()
  disco.stop()
  disco.stop()
  t.pass('sin excepcion')
})

test('despues de stop() no se envia nada mas', (t) => {
  const { disco, socket } = nodo()
  disco.start()
  disco.stop()
  socket.enviados.length = 0

  disco._enviar({ t: 'hello' }, '192.168.1.9')

  t.is(socket.enviados.length, 0, 'el barrido no revive tras apagar')
})

test('un peer que deja de responder se da por perdido', (t) => {
  const { disco, socket } = nodo()
  disco.start()

  const perdidos = []
  disco.on('peer-lost', (p) => perdidos.push(p))
  socket.recibir({ t: 'hello', id: 'otro', ficha: { rpcPort: 50053 } }, '192.168.1.9')
  t.is(disco.peers.size, 1, 'primero esta')

  // Envejecemos el registro en vez de esperar el TTL real.
  disco.peers.get('otro').visto -= 60000
  disco._limpiar()

  t.is(disco.peers.size, 0, 'se lo saca de la lista')
  t.is(perdidos.length, 1, 'avisa que se cayo')
  t.is(perdidos[0].ficha.rpcPort, 50053, 'el aviso trae la ficha, para saber que capas faltan')
  disco.stop()
})

test('un peer que sigue respondiendo no se da por perdido', (t) => {
  const { disco, socket } = nodo()
  disco.start()
  disco.on('peer-lost', () => t.fail('no debe caerse un peer vivo'))

  socket.recibir({ t: 'hello', id: 'otro', ficha: {} }, '192.168.1.9')
  disco._limpiar()

  t.is(disco.peers.size, 1)
  disco.stop()
})
