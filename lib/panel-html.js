// La página del panel, en una sola pieza.
//
// Va como string y no como archivo suelto porque bare-pack empaqueta el binario siguiendo
// los require: un .html suelto no viajaría adentro del ejecutable.
//
// Sin fuentes ni librerías remotas a propósito: el panel tiene que pintar igual con la red
// del venue caída. Si una fuente de Google cuelga la carga en cámara, perdimos la escena.
// El sonido, por lo mismo, es sintetizado: no hay un solo archivo que bajar.
//
// En inglés porque el README y los jueces lo están. Los tamaños son más grandes de lo que
// pediría una pantalla: esto se mira en un video, no de cerca.

module.exports = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SHARD — status panel</title>
<style>
  :root {
    --bg: #0B0B0A;
    --caja: #131311;
    --linea: #2A2823;
    --hueso: #E8E4D9;
    --khaki: #8A8778;
    --vivo: #FFB000;
    --muerto: #D8412F;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  }
  /* Un color por máquina. El reparto es la historia entera del proyecto: si las dos
     mitades son del mismo color, en cámara no se ve que son dos. */
  .c0 { --shard: #FFB000; }
  .c1 { --shard: #6FD3C7; }
  .c2 { --shard: #A78BFA; }
  .c3 { --shard: #7CC96B; }

  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    background: var(--bg); color: var(--hueso);
    font-family: var(--mono); font-size: 15px; line-height: 1.6;
    background-image:
      linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
    background-size: 32px 32px;
  }
  .wrap { max-width: 1020px; margin: 0 auto; padding: 0 26px; }

  .clasif {
    text-align: center; font-size: 10px; letter-spacing: 0.4em;
    text-transform: uppercase; color: var(--khaki);
    padding: 7px 0; border-bottom: 1px solid var(--linea); background: rgba(0,0,0,0.45);
  }
  .clasif.pie { border-bottom: 0; border-top: 1px solid var(--linea); margin-top: 30px; }

  .hoja {
    display: flex; flex-wrap: wrap; gap: 16px; align-items: center;
    padding: 10px 0; border-bottom: 1px solid var(--linea);
    font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--khaki);
  }
  .hoja b { color: var(--hueso); font-weight: 400; }
  .hoja .der { margin-left: auto; }

  .audio {
    display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
    border: 1px solid var(--linea); padding: 4px 11px; color: var(--khaki);
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em;
    text-transform: uppercase; background: none;
  }
  .audio:hover { border-color: var(--vivo); color: var(--vivo); }
  /* Apagado, el interruptor late en ámbar: si no se ve, nadie lo prende. */
  .audio:not(.on) { border-color: var(--vivo); color: var(--vivo); animation: llamar 2.4s infinite; }
  @keyframes llamar { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }
  .audio .luz { width: 6px; height: 6px; background: var(--vivo); flex: none; }
  .audio.on { color: var(--vivo); border-color: var(--vivo); }
  .audio.on .luz { background: var(--vivo); animation: latir 1.6s infinite; }
  @keyframes latir { 0%,100% { opacity: 1 } 50% { opacity: 0.25 } }

  header { display: flex; align-items: baseline; gap: 18px; padding: 26px 0 4px; }
  .logo { font-size: 30px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; }
  .logo i { color: var(--vivo); font-style: normal; }
  .lema { color: var(--khaki); font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; }

  h2 {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.24em;
    color: var(--hueso); font-weight: 700; margin: 28px 0 10px;
    display: flex; align-items: center; gap: 13px;
  }
  h2 .num { color: var(--vivo); }
  h2::after { content: ''; flex: 1; height: 1px;
    background: repeating-linear-gradient(90deg, var(--linea) 0 6px, transparent 6px 10px); }

  .lectura { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase;
             color: var(--khaki); margin: 22px 0 8px; }

  .banda {
    padding: 20px 24px; border: 1px solid;
    font-size: 25px; font-weight: 700; letter-spacing: 0.03em;
  }
  .banda.viva { color: var(--vivo); border-color: var(--vivo); background: rgba(255,176,0,0.06); }
  .banda.muerta { color: var(--muerto); border-color: var(--muerto); background: rgba(216,65,47,0.06); }
  .banda small {
    display: block; margin-top: 8px;
    font-size: 12px; font-weight: 400; letter-spacing: 0.05em; opacity: 0.78;
  }

  .tira { display: flex; gap: 2px; margin-top: 12px; }
  .capa { flex: 1; height: 42px; background: var(--shard, var(--linea)); }
  .capa.falta {
    border: 1px solid var(--muerto);
    background: repeating-linear-gradient(-45deg, rgba(216,65,47,0.25) 0 5px, transparent 5px 10px);
  }
  .rangos { display: flex; gap: 2px; margin-top: 6px; }
  .rango {
    min-width: 0; padding: 4px 8px; font-size: 11px; letter-spacing: 0.1em;
    text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    color: var(--shard, var(--muerto)); border-top: 2px solid var(--shard, var(--muerto));
  }
  .regla { display: flex; justify-content: space-between; font-size: 10px;
           letter-spacing: 0.14em; color: var(--khaki); margin-top: 5px; }

  .maquina {
    display: flex; align-items: center; gap: 14px;
    border: 1px solid var(--linea); border-left: 3px solid var(--shard, var(--linea));
    background: var(--caja); padding: 13px 16px; margin-bottom: 6px;
  }
  .maquina .nombre {
    font-weight: 700; color: var(--shard, var(--hueso));
    min-width: 130px; letter-spacing: 0.08em; text-transform: uppercase;
  }
  .maquina .dato { color: var(--khaki); font-size: 13px; }
  .maquina .aca {
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.18em;
    color: var(--khaki); border: 1px solid var(--linea); padding: 3px 8px;
  }
  .maquina .cuantas {
    margin-left: auto; color: var(--shard, var(--hueso)); font-weight: 700;
    font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;
  }

  form { display: flex; gap: 8px; }
  input[type=text] {
    flex: 1; background: var(--caja); border: 1px solid var(--linea);
    color: var(--hueso); padding: 14px 15px;
    font-family: var(--mono); font-size: 15px;
  }
  input[type=text]:focus { outline: none; border-color: var(--vivo); }
  button.enviar {
    background: var(--vivo); border: 0; color: #0B0B0A; padding: 0 26px; cursor: pointer;
    font-family: var(--mono); font-weight: 700; font-size: 12px;
    letter-spacing: 0.18em; text-transform: uppercase;
  }
  button.enviar:disabled { opacity: 0.35; cursor: not-allowed; }

  #respuesta {
    margin-top: 10px; padding: 18px 20px; min-height: 66px; white-space: pre-wrap;
    border: 1px solid var(--linea); border-left: 2px solid var(--linea);
    background: var(--caja); color: var(--khaki); font-size: 15px;
  }
  #respuesta.contestando { color: var(--hueso); border-left-color: var(--vivo); }
  #respuesta.cargando { color: var(--vivo); border-left-color: var(--vivo); }
  #respuesta.sin { color: var(--muerto); border-left-color: var(--muerto); }

  #log { border: 1px solid var(--linea); background: var(--caja); padding: 10px 14px;
         font-size: 12px; max-height: 260px; overflow-y: auto; }
  #log div { padding: 2px 0; color: var(--khaki); }
  #log div.mal { color: var(--muerto); }
  #log div.ok { color: var(--vivo); }
  #log div.tenue { color: var(--khaki); word-break: break-all; }
  #log time { color: #4A473E; margin-right: 10px; }

  .fin { text-align: center; color: var(--linea); letter-spacing: 0.34em;
         font-size: 10px; padding: 24px 0 6px; text-transform: uppercase; }

  @media (max-width: 700px) {
    .rangos { display: none; }
    .banda { font-size: 17px; }
    .maquina { flex-wrap: wrap; }
  }
</style>
</head>
<body>

<div class="clasif">// Shard // Live node // Local network //</div>

<div class="wrap">
  <div class="hoja">
    <span>Doc <b>SHARD-01</b></span>
    <span>Rev <b id="version">—</b></span>
    <span>Node <b id="nodo">—</b></span>
    <button class="audio der" id="audio" aria-pressed="false">
      <span class="luz"></span><span id="audio-txt">Enable audio</span>
    </button>
  </div>

  <header>
    <div class="logo">sha<i>/</i>rd</div>
    <div class="lema">One model. Many machines. No server.</div>
  </header>

  <div class="lectura">Status readout</div>
  <div class="banda muerta" id="banda">CONNECTING...</div>
  <div class="tira" id="capas"></div>
  <div class="rangos" id="rangos"></div>
  <div class="regla"><span id="regla-a">Layer 00</span><span id="regla-b">Layer 27</span></div>

  <h2><span class="num">§ 01</span> Units on network</h2>
  <div id="maquinas"></div>

  <h2><span class="num">§ 02</span> Query</h2>
  <form id="form">
    <input type="text" id="pregunta" placeholder="what is the capital of Argentina?" autocomplete="off">
    <button type="submit" class="enviar" id="enviar">Transmit</button>
  </form>
  <div id="respuesta">Awaiting query.</div>

  <h2><span class="num">§ 03</span> Event log</h2>
  <div id="log"></div>

  <div class="fin">— Live document —</div>
</div>

<div class="clasif pie">// Shard // Live node // Local network //</div>

<script>
  var $ = function (id) { return document.getElementById(id) }
  var contestando = false
  var primerToken = true
  var yo = null
  var completoAntes = null

  function color (i) { return 'c' + (i % 4) }
  function dosDigitos (n) { return (n < 10 ? '0' : '') + n }

  /* ---------- sonido ---------- */
  // Sintetizado, sin archivos: el binario no lleva assets y suena igual sin red.
  var ctx = null
  var audioOn = false

  function tono (freq, dur, tipo, vol, desde) {
    if (!ctx) return
    var t0 = ctx.currentTime + (desde || 0)
    var osc = ctx.createOscillator()
    var g = ctx.createGain()
    var filtro = ctx.createBiquadFilter()
    filtro.type = 'bandpass'
    filtro.frequency.value = freq
    filtro.Q.value = 1.2
    osc.type = tipo || 'square'
    osc.frequency.setValueAtTime(freq, t0)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(filtro); filtro.connect(g); g.connect(ctx.destination)
    osc.start(t0); osc.stop(t0 + dur + 0.02)
  }

  // Ruido filtrado, no melodias: un contacto de rele suena a equipo, un arpegio suena a
  // consola de juegos. Todo por debajo de 60ms salvo la alarma.
  function ruido (dur, tipo, freq, vol, desde) {
    if (!ctx) return
    var t0 = ctx.currentTime + (desde || 0)
    var n = Math.max(1, Math.floor(ctx.sampleRate * dur))
    var buf = ctx.createBuffer(1, n, ctx.sampleRate)
    var datos = buf.getChannelData(0)
    for (var i = 0; i < n; i++) datos[i] = Math.random() * 2 - 1
    var src = ctx.createBufferSource()
    src.buffer = buf
    var f = ctx.createBiquadFilter()
    f.type = tipo
    f.frequency.value = freq
    f.Q.value = 0.7
    var g = ctx.createGain()
    g.gain.setValueAtTime(vol, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(f); f.connect(g); g.connect(ctx.destination)
    src.start(t0); src.stop(t0 + dur)
  }

  var sonidos = {
    pasar: function () { ruido(0.012, 'highpass', 2200, 0.05) },
    click: function () { ruido(0.028, 'bandpass', 850, 0.16); tono(110, 0.05, 'sine', 0.10) },
    // Se completo el modelo: squelch y un tono firme. En el video esto es la escena.
    completo: function () { ruido(0.06, 'bandpass', 1100, 0.11); tono(720, 0.22, 'square', 0.07, 0.055) },
    // Se cayo una maquina: dos pulsos graves y sucios. Alarma, no error de interfaz.
    roto: function () { tono(150, 0.22, 'sawtooth', 0.11); tono(140, 0.24, 'sawtooth', 0.10, 0.26) },
    arranque: function () { ruido(0.07, 'bandpass', 1100, 0.09); tono(640, 0.05, 'square', 0.05, 0.07) }
  }

  function sonar (cual) { if (audioOn && ctx) sonidos[cual]() }

  $('audio').addEventListener('click', function () {
    // El AudioContext sólo puede nacer dentro de un gesto del usuario.
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext
      if (!AC) { $('audio-txt').textContent = 'No audio'; $('audio').disabled = true; return }
      ctx = new AC()
    }
    if (ctx.state === 'suspended') ctx.resume()
    audioOn = !audioOn
    $('audio').classList.toggle('on', audioOn)
    $('audio').setAttribute('aria-pressed', String(audioOn))
    $('audio-txt').textContent = audioOn ? 'Audio on' : 'Enable audio'
    if (audioOn) sonidos.arranque()
  })

  // Solo los dos controles que se tocan. La tira de capas y las filas de maquinas se
  // redibujan a cada evento del nodo: sonarlas al pasar seria un cascabel constante.
  $('enviar').addEventListener('mouseenter', function () { sonar('pasar') })
  $('audio').addEventListener('mouseenter', function () { sonar('pasar') })

  /* ---------- pintado ---------- */
  function pintarBanda (plan) {
    var b = $('banda')
    if (plan.completo) {
      b.className = 'banda viva'
      b.innerHTML = 'MODEL COMPLETE <small>' + plan.capas + ' of ' + plan.capas +
        ' layers served by ' + plan.asignaciones.length + ' machine(s)</small>'
    } else {
      b.className = 'banda muerta'
      var falta = plan.faltan
        ? 'LAYERS ' + plan.faltan.desde + '-' + plan.faltan.hasta + ' MISSING'
        : 'NO LAYERS AT ALL'
      b.innerHTML = 'MODEL INCOMPLETE &mdash; ' + falta +
        '<small>' + plan.cubiertas + ' of ' + plan.capas +
        ' layers. The model cannot think until another machine joins.</small>'
    }

    // El aviso sonoro va sólo cuando el estado cambia, no en cada refresco.
    if (completoAntes !== null && plan.completo !== completoAntes) {
      sonar(plan.completo ? 'completo' : 'roto')
    }
    completoAntes = plan.completo
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
      if (duenio[i] === undefined) {
        d.className = 'capa falta'
        d.title = 'layer ' + i + ' — nobody is serving it'
      } else {
        d.className = 'capa ' + color(duenio[i])
        d.title = 'layer ' + i + ' — ' + plan.asignaciones[duenio[i]].etiqueta
      }
      c.appendChild(d)
    }
    $('regla-b').textContent = 'Layer ' + dosDigitos(plan.capas - 1)
  }

  function pintarRangos (plan) {
    var r = $('rangos')
    r.innerHTML = ''
    plan.asignaciones.forEach(function (a, i) {
      var d = document.createElement('div')
      d.className = 'rango ' + color(i)
      d.style.flexGrow = a.capas
      d.textContent = a.etiqueta + ' · ' + a.desde + '-' + a.hasta
      r.appendChild(d)
    })
    if (!plan.completo && plan.faltan) {
      var f = document.createElement('div')
      f.className = 'rango'
      f.style.flexGrow = plan.faltan.hasta - plan.faltan.desde + 1
      f.textContent = 'missing · ' + plan.faltan.desde + '-' + plan.faltan.hasta
      r.appendChild(f)
    }
  }

  function pintarMaquinas (plan) {
    var m = $('maquinas')
    m.innerHTML = ''
    if (!plan.asignaciones.length) {
      m.innerHTML = '<div class="maquina"><span class="dato">No machine is serving layers.</span></div>'
      return
    }
    plan.asignaciones.forEach(function (a, i) {
      var d = document.createElement('div')
      d.className = 'maquina ' + color(i)
      var aca = a.id === yo ? '<span class="aca">this machine</span>' : ''
      d.innerHTML = '<span class="nombre">' + a.etiqueta + '</span>' + aca +
        '<span class="dato">' + a.rpc + '</span>' +
        '<span class="cuantas">' + a.capas + ' layers</span>'
      m.appendChild(d)
    })
  }

  function anotar (nivel, texto, t) {
    var d = document.createElement('div')
    d.className = nivel
    // La hora viene del nodo. Al reconectar se repinta el log entero, y sin esto todas
    // las lineas quedarian con la hora de la reconexion.
    var hora = new Date(t || Date.now()).toTimeString().slice(0, 8)
    d.innerHTML = '<time>' + hora + '</time>' + texto
    $('log').insertBefore(d, $('log').firstChild)
  }

  function pintar (plan) {
    pintarBanda(plan)
    pintarCapas(plan)
    pintarRangos(plan)
    pintarMaquinas(plan)
  }

  /* ---------- el nodo ---------- */
  var fuente = new EventSource('/eventos')

  fuente.onmessage = function (e) {
    var m = JSON.parse(e.data)

    if (m.tipo === 'foto') {
      $('version').textContent = m.version
      $('nodo').textContent = m.etiqueta || '—'
      yo = m.yo
      m.log.forEach(function (l) { anotar(l.nivel, l.texto, l.t) })
      pintar(m.plan)
      return
    }
    if (m.tipo === 'estado') { pintar(m.plan); return }
    if (m.tipo === 'log') { anotar(m.nivel, m.texto, m.t); return }
    if (m.tipo === 'pregunta') {
      contestando = true
      $('enviar').disabled = true
      $('respuesta').className = 'cargando'
      // Entre la pregunta y el primer token el modelo tarda en cargar. Sin esto la
      // pantalla queda igual que antes de preguntar y parece que no paso nada.
      $('respuesta').textContent = 'Loading the model and splitting the layers across machines...'
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
      $('respuesta').textContent = 'NO ANSWER\\n' + m.motivo
      contestando = false
      $('enviar').disabled = false
      sonar('roto')
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
    $('banda').innerHTML = 'NO CONNECTION TO THE NODE<small>Reconnecting...</small>'
  }

  function preguntar () {
    var texto = $('pregunta').value.trim()
    if (!texto || contestando) return

    // El candado se cierra aca y no cuando vuelve el evento del nodo: entre el click y la
    // vuelta hay un viaje entero, y en el medio entran dos clicks nerviosos.
    contestando = true
    $('enviar').disabled = true
    sonar('click')

    fetch('/preguntar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pregunta: texto })
    }).catch(function (err) {
      anotar('mal', 'could not ask: ' + err.message)
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
