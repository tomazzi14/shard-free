// El panel: sirve una página y le empuja el estado del nodo en vivo.
//
// Va por SSE (Server-Sent Events) y no por websocket: el estado viaja en un solo sentido,
// el navegador reconecta solo si se corta, y no depende de una librería más. Las preguntas
// suben por un POST normal.

const { http, EventEmitter } = require('./runtime.js')
const pagina = require('./panel-html.js')

const PUERTO = 7777
const MAX_LOG = 50

class Panel extends EventEmitter {
  constructor({ nodo, puerto = PUERTO, version = '' }) {
    super()
    this.nodo = nodo
    this.puerto = puerto
    this.version = version
    this.clientes = new Set()
    this.log = []
    this.servidor = null
  }

  _anotar(nivel, texto) {
    const t = Date.now()
    this.log.push({ nivel, texto, t })
    if (this.log.length > MAX_LOG) this.log.shift()
    this._empujar({ tipo: 'log', nivel, texto, t })
  }

  _empujar(evento) {
    const linea = `data: ${JSON.stringify(evento)}\n\n`
    for (const res of this.clientes) res.write(linea)
  }

  // Todo lo que el panel necesita para pintarse de cero, para el que recién se conecta.
  // `yo` va aparte del plan porque esta máquina puede no estar sirviendo ninguna capa y
  // aun así el panel tiene que poder decir cuál de las filas es la de acá.
  _foto() {
    return {
      tipo: 'foto',
      plan: this.nodo.plan(),
      version: this.version,
      yo: this.nodo.id,
      etiqueta: this.nodo.ficha.etiqueta,
      log: this.log
    }
  }

  start() {
    this.nodo.on('estado', (plan) => this._empujar({ tipo: 'estado', plan }))
    this.nodo.on('peer', (p) => this._anotar('ok', `${p.ficha.etiqueta} (${p.address}) joined`))
    this.nodo.on('peer-lost', (p) => this._anotar('mal', `${p.ficha.etiqueta} left`))
    // Un peer que arranca anuncia 0GB y sube cuando su servidor de capas esta listo. Sin
    // esta linea la banda pasa a COMPLETE sola y el log no explica por que.
    this.nodo.on('peer-cambio', (p) =>
      this._anotar('ok', `${p.ficha.etiqueta} now offers ${p.ficha.ofreceGB}GB`)
    )
    this.nodo.on('error', (err) => this._anotar('mal', err.message))
    this.nodo.on('capas-listas', (p) => this._anotar('ok', `serving layers on :${p}`))

    this.servidor = http.createServer((req, res) => this._atender(req, res))
    // Un panel que no puede escuchar tiene que decirlo: si no, la app parece andar bien y
    // el navegador no muestra nada.
    this.servidor.on('error', (err) => {
      const detalle =
        err.code === 'EADDRINUSE' ? `port ${this.puerto} is already taken` : err.message
      this.emit('error', new Error(`the panel could not listen: ${detalle}`))
    })
    this.servidor.listen(this.puerto, '127.0.0.1')
    return this.servidor
  }

  _atender(req, res) {
    if (req.url === '/eventos') return this._suscribir(res)
    if (req.url === '/preguntar' && req.method === 'POST') return this._preguntar(req, res)
    if (req.url === '/' || req.url === '/index.html') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(pagina)
      return
    }
    res.statusCode = 404
    res.end('not found')
  }

  _suscribir(res) {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.write(`data: ${JSON.stringify(this._foto())}\n\n`)

    this.clientes.add(res)
    res.on('close', () => this.clientes.delete(res))
  }

  _preguntar(req, res) {
    let cuerpo = ''
    req.on('data', (d) => (cuerpo += d))
    req.on('end', () => {
      let pregunta
      try {
        pregunta = JSON.parse(cuerpo).pregunta
      } catch {
        res.statusCode = 400
        res.end('unreadable json')
        return
      }

      res.statusCode = 202
      res.end('ok')
      this._lanzar(pregunta)
    })
  }

  _lanzar(pregunta) {
    this._anotar('ok', `asked: ${pregunta}`)
    this._empujar({ tipo: 'pregunta', pregunta })

    const corrida = this.nodo.preguntar(pregunta)

    // El comando exacto, para poder repetirlo a mano cuando algo no anda.
    if (corrida.args) this._anotar('tenue', `llama-cli ${corrida.args.join(' ')}`)

    corrida
      .on('salida', (txt) => this._empujar({ tipo: 'token', txt }))
      .on('error', (err) => {
        this._anotar('mal', err.message)
        // La salida cruda es fea, pero sin ella un fallo es indistinguible de otro.
        if (err.crudo) this._anotar('tenue', `raw output: ${err.crudo.slice(-300)}`)
        this._empujar({ tipo: 'sin-respuesta', motivo: err.message, faltan: err.faltan || null })
      })
      .on('fin', () => this._empujar({ tipo: 'fin' }))
  }

  stop() {
    for (const res of this.clientes) res.end()
    this.clientes.clear()
    this.servidor?.close()
  }
}

module.exports = Panel
module.exports.PUERTO = PUERTO
