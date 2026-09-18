import Link from "next/link";

// La pagina que el service worker muestra cuando una navegacion del panel falla por falta de red (fase C).
// Estatica y sin sesion: se guarda en cache al instalar el service worker. No promete trabajo sin conexion:
// todo pasa por el servidor.
export const dynamic = "force-static";
export const metadata = { title: "Sin conexión · Prospectos NERACOSU" };

export default function SinConexion() {
  return (
    <main className="contenedor entrar">
      <section className="tarjeta">
        <h1 className="titulo">Sin conexión</h1>
        <p>No hay señal para llegar al servidor. Todo lo del panel pasa por él, así que aquí no hay nada que hacer hasta que vuelva.</p>
        <p className="suave">Lo que ya tocaste y llegó a enviarse quedó guardado; lo que no, no. Al volver la señal, vuelve a intentarlo.</p>
        <div className="fila-botones"><Link className="boton boton--primario" href="/hoy">Reintentar</Link></div>
      </section>
    </main>
  );
}
