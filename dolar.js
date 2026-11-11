// Cotización actual del dólar billete, VENTA, del Banco Nación.
// La página del banco no se puede leer desde el navegador (no lo permite), así que
// se usan servicios públicos que la copian. Se verificó (11/11/2026) que coinciden
// con bna.com.ar. Si el primero falla se prueba el segundo.
//
// Nota: para fechas pasadas NO usar ArgentinaDatos: difería del historial del BNA.

const FUENTES = [
  {
    nombre: 'CriptoYa',
    url: 'https://criptoya.com/api/bancostodos',
    leer: (j) => ({ valor: j?.bna?.ask, fecha: j?.bna?.time ? new Date(j.bna.time * 1000) : null }),
  },
  {
    nombre: 'DolarApi',
    url: 'https://dolarapi.com/v1/dolares/oficial',
    leer: (j) => ({ valor: j?.venta, fecha: j?.fechaActualizacion ? new Date(j.fechaActualizacion) : null }),
  },
];

/** Devuelve { valor, fecha (Date), via } o lanza un error si ninguna fuente responde bien. */
export async function cotizacionBNA() {
  const errores = [];
  for (const f of FUENTES) {
    try {
      const control = new AbortController();
      const corte = setTimeout(() => control.abort(), 8000);
      const r = await fetch(f.url, { signal: control.signal, cache: 'no-store' });
      clearTimeout(corte);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const { valor, fecha } = f.leer(await r.json());
      // Control de cordura: descarta valores absurdos.
      if (typeof valor !== 'number' || !(valor > 100 && valor < 1e6)) throw new Error('valor raro: ' + valor);
      return { valor, fecha: fecha && !isNaN(fecha) ? fecha : new Date(), via: f.nombre };
    } catch (e) {
      errores.push(`${f.nombre}: ${e.message || e}`);
    }
  }
  throw new Error('No se pudo obtener la cotización del Banco Nación (' + errores.join('; ') + ')');
}
