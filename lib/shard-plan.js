// Reparte las capas del modelo entre los peers descubiertos.
//
// Función pura: entran los peers, sale el reparto. Sin red y sin estado, así que el panel
// puede recalcular en cada cambio y los tests corren sin levantar nada.
//
// De acá sale la banda de estado de la demo: si lo que prestan los peers no alcanza para
// todas las capas, el modelo está INCOMPLETO y sabemos exactamente cuáles faltan.

const GB = 1024 * 1024 * 1024

// Llama 3.2 3B Instruct Q4_K_M: 28 capas, 1.9GB de pesos.
const MODELO = {
  capas: 28,
  bytesPorCapa: 68 * 1024 * 1024
}

// Cuántas capas sostiene un peer con la memoria que ofreció prestar. No la estimamos
// nosotros: cada máquina declara cuánto presta en su ficha.
function capacidad(peer, bytesPorCapa) {
  const ofrece = peer.ficha?.ofreceGB
  if (!Number.isFinite(ofrece) || ofrece <= 0) return 0
  return Math.floor((ofrece * GB) / bytesPorCapa)
}

function planificar({ peers, capas = MODELO.capas, bytesPorCapa = MODELO.bytesPorCapa }) {
  // Orden estable por id: el mismo conjunto de peers da siempre el mismo reparto, sin
  // importar en qué orden los fue descubriendo el nodo.
  const ordenados = [...peers].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const asignaciones = []
  let cursor = 0

  for (const peer of ordenados) {
    if (cursor >= capas) break
    const cabe = Math.min(capacidad(peer, bytesPorCapa), capas - cursor)
    if (cabe === 0) continue // no le entra ni una capa entera: no sirve como shard

    asignaciones.push({
      id: peer.id,
      etiqueta: peer.ficha.etiqueta,
      rpc: `${peer.address}:${peer.ficha.rpcPort}`,
      desde: cursor,
      hasta: cursor + cabe - 1,
      capas: cabe
    })
    cursor += cabe
  }

  const completo = cursor === capas

  return {
    completo,
    capas,
    cubiertas: cursor,
    faltan: completo ? null : { desde: cursor, hasta: capas - 1 },
    asignaciones,
    // Lo que consume llama.cpp. tensorSplit fija el reparto para que lo que muestra el
    // panel sea lo que de verdad pasa, en vez de dejarlo al criterio de llama.cpp.
    rpc: asignaciones.map((a) => a.rpc).join(','),
    tensorSplit: asignaciones.map((a) => a.capas).join(',')
  }
}

module.exports = planificar
module.exports.MODELO = MODELO
