const { test } = require('brittle')
const { http, EventEmitter } = require('../lib/runtime.js')
const Panel = require('../lib/panel.js')
const planificar = require('../lib/shard-plan.js')

const peer = (id, ofreceGB, address) => ({
  id,
  address,
  ficha: { etiqueta: id, rpcPort: 50052, ofreceGB }
})

// Nodo de mentira: el panel sólo necesita que le den un plan y eventos.
class NodoFalso extends EventEmitter {
  constructor(peers = [peer('a', 1, '10.0.0.1')]) {
    super()
    this.peers = peers
    this.preguntas = []
    this.ultima = null
  }
  plan() {
    return planificar({ peers: this.peers })
  }
  preguntar(texto) {
    this.preguntas.push(texto)
    this.ultima = new EventEmitter()
    return this.ultima
  }
}

// Levanta el panel en un puerto libre y devuelve con qué hablarle.
function levantar(nodo = new NodoFalso()) {
  const panel = new Panel({ nodo, puerto: 0, version: '9.9.9' })
  const servidor = panel.start()
  return { panel, nodo, puerto: () => servidor.address().port }
}

// bare-http1 no manda el cuerpo si no le decimos cuánto mide.
function postear(puerto, cuerpo, alResponder) {
  const datos = JSON.stringify(cuerpo)
  const req = http.request(
    {
      port: puerto,
      path: '/preguntar',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(datos) }
    },
    alResponder
  )
  req.end(datos)
  return req
}

// Abre el stream de eventos y va juntando lo que llega, ya parseado.
function escuchar(puerto, alRecibir) {
  const recibidos = []
  const req = http.request({ port: puerto, path: '/eventos' }, (res) => {
    let resto = ''
    res.on('data', (d) => {
      resto += d.toString()
      const partes = resto.split('\n\n')
      resto = partes.pop()
      for (const p of partes) {
        if (!p.startsWith('data: ')) continue
        recibidos.push(JSON.parse(p.slice(6)))
        alRecibir(recibidos, req)
      }
    })
  })
  req.end()
  return recibidos
}

test('el que se conecta recibe una foto del estado actual', (t) => {
  t.plan(4)
  const { panel, puerto } = levantar()

  panel.servidor.on('listening', () => {
    escuchar(puerto(), (recibidos, req) => {
      const foto = recibidos[0]
      t.is(foto.tipo, 'foto')
      t.is(foto.version, '9.9.9', 'trae la version, que es lo que cambia con el OTA')
      t.absent(foto.plan.completo, 'y el estado del modelo, sin esperar al proximo cambio')
      t.alike(foto.plan.faltan, { desde: 15, hasta: 27 })
      req.destroy()
      panel.stop()
    })
  })
})

test('un peer que entra viaja al navegador como estado nuevo', (t) => {
  t.plan(2)
  const { panel, nodo, puerto } = levantar()

  panel.servidor.on('listening', () => {
    escuchar(puerto(), (recibidos, req) => {
      if (recibidos.length === 1) {
        nodo.peers = [peer('a', 1, '10.0.0.1'), peer('b', 1, '10.0.0.2')]
        nodo.emit('estado', nodo.plan())
        return
      }
      t.is(recibidos[1].tipo, 'estado')
      t.ok(recibidos[1].plan.completo, 'el panel se entera de que el modelo se completo')
      req.destroy()
      panel.stop()
    })
  })
})

test('la caida de un peer llega al log con su nivel', (t) => {
  t.plan(2)
  const { panel, nodo, puerto } = levantar()

  panel.servidor.on('listening', () => {
    escuchar(puerto(), (recibidos, req) => {
      if (recibidos.length === 1) {
        nodo.emit('peer-lost', peer('b', 1, '10.0.0.2'))
        return
      }
      t.is(recibidos[1].nivel, 'mal', 'rojo en el panel')
      t.ok(/se cayo/.test(recibidos[1].texto))
      req.destroy()
      panel.stop()
    })
  })
})

test('los errores del nodo no se los guarda el panel', (t) => {
  t.plan(1)
  const { panel, nodo, puerto } = levantar()

  panel.servidor.on('listening', () => {
    escuchar(puerto(), (recibidos, req) => {
      if (recibidos.length === 1) {
        nodo.emit('error', new Error('el puerto ya esta ocupado'))
        return
      }
      t.is(recibidos[1].texto, 'el puerto ya esta ocupado', 'el usuario lo ve, no queda oculto')
      req.destroy()
      panel.stop()
    })
  })
})

test('una pregunta del navegador llega al nodo y la respuesta vuelve en vivo', (t) => {
  t.plan(3)
  const { panel, nodo, puerto } = levantar()

  panel.servidor.on('listening', () => {
    escuchar(puerto(), (recibidos, req) => {
      const ultimo = recibidos[recibidos.length - 1]

      // La pregunta se manda recien cuando llego la foto: si sale antes de que el
      // navegador termine de suscribirse, el panel la empuja a cero clientes.
      if (ultimo.tipo === 'foto') {
        postear(puerto(), { pregunta: 'cual es la capital?' })
        return
      }
      if (ultimo.tipo === 'pregunta') {
        t.is(nodo.preguntas[0], 'cual es la capital?', 'el nodo la recibio')
        nodo.ultima.emit('salida', 'Buenos ')
        nodo.ultima.emit('salida', 'Aires')
        return
      }
      if (ultimo.tipo === 'token' && ultimo.txt === 'Aires') {
        t.is(recibidos.filter((r) => r.tipo === 'token').length, 2, 'llega en streaming')
        nodo.ultima.emit('fin')
        return
      }
      if (ultimo.tipo === 'fin') {
        t.pass('avisa que termino')
        req.destroy()
        panel.stop()
      }
    })
  })
})

test('si faltan capas el panel recibe cuales, no un error generico', (t) => {
  t.plan(2)
  const { panel, nodo, puerto } = levantar()

  panel.servidor.on('listening', () => {
    escuchar(puerto(), (recibidos, req) => {
      const ultimo = recibidos[recibidos.length - 1]

      if (ultimo.tipo === 'foto') {
        postear(puerto(), { pregunta: 'algo' })
        return
      }
      if (ultimo.tipo === 'pregunta') {
        const err = new Error('modelo incompleto: faltan las capas 15-27')
        err.faltan = { desde: 15, hasta: 27 }
        nodo.ultima.emit('error', err)
        return
      }
      if (ultimo.tipo === 'sin-respuesta') {
        t.alike(ultimo.faltan, { desde: 15, hasta: 27 }, 'para pintar el rango en rojo')
        t.ok(/faltan las capas/.test(ultimo.motivo))
        req.destroy()
        panel.stop()
      }
    })
  })
})

test('un json roto no tumba el panel', (t) => {
  t.plan(1)
  const { panel, puerto } = levantar()

  panel.servidor.on('listening', () => {
    const post = http.request({ port: puerto(), path: '/preguntar', method: 'POST' }, (res) => {
      t.is(res.statusCode, 400, 'contesta que no se entiende, y sigue vivo')
      panel.stop()
    })
    post.end('esto no es json')
  })
})

test('un panel que no puede escuchar lo dice, no falla en silencio', (t) => {
  t.plan(1)
  const ocupado = new Panel({ nodo: new NodoFalso(), puerto: 0 })
  ocupado.start()

  ocupado.servidor.on('listening', () => {
    const chocado = new Panel({ nodo: new NodoFalso(), puerto: ocupado.servidor.address().port })
    chocado.on('error', (err) => {
      t.ok(/ya esta ocupado/.test(err.message), 'dice por que no hay panel')
      chocado.stop()
      ocupado.stop()
    })
    chocado.start()
  })
})
