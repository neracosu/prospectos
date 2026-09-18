// Esqueleto de carga del panel (pasada de UX, fase C): bloques quietos del color de las tarjetas mientras llega la
// pantalla, en vez de una rueda o un blanco. Es decorativo (aria-hidden); a los lectores les basta «Cargando…».
// Cambiar de pestana con ?t= dentro de un proyecto NO pasa por aca: React conserva lo viejo durante la transicion.
export default function Cargando() {
  return (
    <>
      <p className="solo-lector" role="status">Cargando…</p>
      <div className="esqueleto" aria-hidden="true">
        <div className="tarjeta esqueleto__tarjeta">
          <i className="esqueleto__bloque esqueleto__bloque--grande" />
          <i className="esqueleto__bloque esqueleto__bloque--barra" />
          <i className="esqueleto__bloque esqueleto__bloque--fila" />
        </div>
        <i className="esqueleto__bloque esqueleto__bloque--titulo" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="tarjeta esqueleto__tarjeta">
            <i className="esqueleto__bloque esqueleto__bloque--linea" style={{ width: `${62 - i * 9}%` }} />
            <i className="esqueleto__bloque esqueleto__bloque--linea esqueleto__bloque--suave" style={{ width: `${44 + i * 7}%` }} />
            <div className="esqueleto__botones"><i className="esqueleto__bloque esqueleto__bloque--boton esqueleto__bloque--principal" /><i className="esqueleto__bloque esqueleto__bloque--boton" /></div>
          </div>
        ))}
      </div>
    </>
  );
}
