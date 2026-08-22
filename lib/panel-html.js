// La página del panel, en una sola pieza.
//
// Va como string y no como archivo suelto porque bare-pack empaqueta el binario siguiendo
// los require: un .html suelto no viajaría adentro del ejecutable.
//
// Sin fuentes ni librerías remotas a propósito: el panel tiene que pintar igual con la red
// del venue caída. Si una fuente de Google cuelga la carga en cámara, perdimos la escena.

module.exports = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shard</title>
<style>
  :root {
    --bg: #0A0E14;
    --caja: #111823;
    --linea: #1E2836;
    --texto: #C9D4E5;
    --tenue: #6B7C93;
    --vivo: #FFB000;
    --muerto: #EF4444;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    background: var(--bg); color: var(--texto);
    font-family: var(--mono); font-size: 14px; line-height: 1.5;
  }
  .envoltorio { max-width: 980px; margin: 0 auto; }

  header { display: flex; align-items: baseline; gap: 16px; margin-bottom: 4px; }
  .logo { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
  .logo i { color: var(--vivo); font-style: normal; }
  .lema { color: var(--tenue); font-size: 13px; }
  .version {
    margin-left: auto; color: var(--tenue); font-size: 12px;
    border: 1px solid var(--linea); border-radius: 4px; padding: 2px 8px;
  }

  .banda {
    margin: 20px 0; padding: 20px 24px;
    border: 1px solid; border-radius: 6px;
    font-size: 20px; font-weight: 700; letter-spacing: 0.02em;
  }
  .banda.viva { color: var(--vivo); border-color: var(--vivo); background: rgba(255,176,0,0.06); }
  .banda.muerta { color: var(--muerto); border-color: var(--muerto); background: rgba(239,68,68,0.06); }
  .banda small { display: block; margin-top: 6px; font-size: 12px; font-weight: 400; opacity: 0.75; }

  .capas { display: flex; gap: 2px; margin-bottom: 20px; }
  .capa { flex: 1; height: 34px; border-radius: 2px; background: var(--linea); position: relative; }
  .capa.servida { background: var(--vivo); opacity: 0.85; }
  .capa.servida.b { opacity: 0.45; }
  .capa.falta { background: rgba(239,68,68,0.18); border: 1px solid var(--muerto); }

  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em;
       color: var(--tenue); margin: 24px 0 8px; font-weight: 400; }

  .maquina {
    display: flex; align-items: center; gap: 14px;
    border: 1px solid var(--linea); border-left: 3px solid var(--vivo);
    border-radius: 4px; background: var(--caja); padding: 12px 16px; margin-bottom: 6px;
  }
  .maquina .nombre { font-weight: 700; min-width: 120px; }
  .maquina .dato { color: var(--tenue); font-size: 12px; }
  .maquina .rango { margin-left: auto; color: var(--vivo); font-weight: 700; }

  form { display: flex; gap: 8px; }
  input[type=text] {
    flex: 1; background: var(--caja); border: 1px solid var(--linea);
    border-radius: 4px; color: var(--texto); padding: 12px 14px;
    font-family: var(--mono); font-size: 14px;
  }
  input[type=text]:focus { outline: none; border-color: var(--vivo); }
  button {
    background: var(--vivo); border: 0; border-radius: 4px; color: #0A0E14;
    padding: 0 22px; font-family: var(--mono); font-weight: 700; font-size: 14px; cursor: pointer;
  }
  button:disabled { opacity: 0.4; cursor: not-allowed; }

  #respuesta {
    margin-top: 10px; padding: 16px; min-height: 56px; white-space: pre-wrap;
    border: 1px solid var(--linea); border-radius: 4px; background: var(--caja);
    color: var(--tenue);
  }
  #respuesta.contestando { color: var(--texto); }
  #respuesta.cargando { color: var(--vivo); }
  #respuesta.sin { color: var(--muerto); }

  #log { border-top: 1px solid var(--linea); padding-top: 8px; font-size: 12px; }
  #log div { padding: 2px 0; color: var(--tenue); }
  #log div.mal { color: var(--muerto); }
  #log div.ok { color: var(--vivo); }
  #log div.tenue { color: var(--tenue); word-break: break-all; }
  #log time { color: #3A4A5F; margin-right: 10px; }
</style>
</head>
<body>
<div class="envoltorio">
  <header>
    <div class="logo">sha<i>/</i>rd</div>
    <div class="lema">One model. Many machines. No server.</div>
    <div class="version" id="version">&nbsp;</div>
  </header>

  <div class="banda muerta" id="banda">CONECTANDO...</div>
  <div class="capas" id="capas"></div>

  <h2>Maquinas que sirven capas</h2>
  <div id="maquinas"></div>

  <h2>Preguntar</h2>
  <form id="form">
    <input type="text" id="pregunta" placeholder="cual es la capital de Argentina?" autocomplete="off">
    <button type="submit" id="enviar">PREGUNTAR</button>
  </form>
  <div id="respuesta">Esperando una pregunta.</div>

  <h2>Log</h2>
  <div id="log"></div>
</div>

<script>
  var $ = function (id) { return document.getElementById(id) }
  var contestando = false
  var primerToken = true

  function pintarBanda (plan) {
    var b = $('banda')
    if (plan.completo) {
      b.className = 'banda viva'
      b.innerHTML = 'MODEL COMPLETE <small>' + plan.capas + ' de ' + plan.capas +
        ' capas servidas por ' + plan.asignaciones.length + ' maquina(s)</small>'
    } else {
      b.className = 'banda muerta'
      var falta = plan.faltan
        ? 'shard ' + plan.faltan.desde + '-' + plan.faltan.hasta + ' missing'
        : 'sin capas'
      b.innerHTML = 'MODEL INCOMPLETE &mdash; ' + falta +
        '<small>' + plan.cubiertas + ' de ' + plan.capas +
        ' capas. El modelo no puede pensar hasta que entre otra maquina.</small>'
    }
  }

  function pintarCapas (plan) {
    var c = $('capas')
    c.innerHTML = ''
    var duenio = []
    plan.asignaciones.forEach(function (a, i) {
      for (var n = a.desde; n <= a.hasta; n++) duenio[n] = i
    })
    for (var i = 0; i < plan.capas; i++) {
      var d = document.createElement('div')
      if (duenio[i] === undefined) d.className = 'capa falta'
      else d.className = 'capa servida' + (duenio[i] % 2 ? ' b' : '')
      d.title = 'capa ' + i
      c.appendChild(d)
    }
  }

  function pintarMaquinas (plan) {
    var m = $('maquinas')
    m.innerHTML = ''
    if (!plan.asignaciones.length) {
      m.innerHTML = '<div class="maquina"><span class="dato">Ninguna maquina esta sirviendo capas.</span></div>'
      return
    }
    plan.asignaciones.forEach(function (a) {
      var d = document.createElement('div')
      d.className = 'maquina'
      d.innerHTML = '<span class="nombre">' + a.etiqueta + '</span>' +
        '<span class="dato">' + a.rpc + '</span>' +
        '<span class="rango">capas ' + a.desde + '-' + a.hasta + '</span>'
      m.appendChild(d)
    })
  }

  function anotar (nivel, texto) {
    var d = document.createElement('div')
    d.className = nivel
    var hora = new Date().toTimeString().slice(0, 8)
    d.innerHTML = '<time>' + hora + '</time>' + texto
    $('log').insertBefore(d, $('log').firstChild)
  }

  function pintar (plan) {
    pintarBanda(plan)
    pintarCapas(plan)
    pintarMaquinas(plan)
  }

  var fuente = new EventSource('/eventos')

  fuente.onmessage = function (e) {
    var m = JSON.parse(e.data)

    if (m.tipo === 'foto') {
      $('version').textContent = 'v' + m.version
      m.log.forEach(function (l) { anotar(l.nivel, l.texto) })
      pintar(m.plan)
      return
    }
    if (m.tipo === 'estado') { pintar(m.plan); return }
    if (m.tipo === 'log') { anotar(m.nivel, m.texto); return }
    if (m.tipo === 'pregunta') {
      contestando = true
      $('enviar').disabled = true
      $('respuesta').className = 'cargando'
      // Entre la pregunta y el primer token el modelo tarda en cargar. Sin esto la
      // pantalla queda igual que antes de preguntar y parece que no paso nada.
      $('respuesta').textContent = 'Cargando el modelo y repartiendo las capas...'
      primerToken = true
      return
    }
    if (m.tipo === 'token') {
      if (primerToken) {
        $('respuesta').className = 'contestando'
        $('respuesta').textContent = ''
        primerToken = false
      }
      $('respuesta').textContent += m.txt
      return
    }
    if (m.tipo === 'sin-respuesta') {
      $('respuesta').className = 'sin'
      $('respuesta').textContent = 'SIN RESPUESTA\\n' + m.motivo
      contestando = false
      $('enviar').disabled = false
      return
    }
    if (m.tipo === 'fin') {
      contestando = false
      $('enviar').disabled = false
    }
  }

  // El navegador reconecta solo, pero que se vea que se corto.
  fuente.onerror = function () {
    $('banda').className = 'banda muerta'
    $('banda').innerHTML = 'SIN CONEXION CON EL NODO<small>Reintentando...</small>'
  }

  function preguntar () {
    var texto = $('pregunta').value.trim()
    if (!texto || contestando) return

    // El candado se cierra aca y no cuando vuelve el evento del nodo: entre el click y la
    // vuelta hay un viaje entero, y en el medio entran dos clicks nerviosos.
    contestando = true
    $('enviar').disabled = true

    fetch('/preguntar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pregunta: texto })
    }).catch(function (err) {
      anotar('mal', 'no se pudo preguntar: ' + err.message)
      contestando = false
      $('enviar').disabled = false
    })
  }

  $('form').onsubmit = function (e) {
    e.preventDefault()
    preguntar()
  }

  // Enter dentro del campo, por si el submit del formulario no llega a dispararse.
  $('pregunta').onkeydown = function (e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      preguntar()
    }
  }
</script>
</body>
</html>
`
