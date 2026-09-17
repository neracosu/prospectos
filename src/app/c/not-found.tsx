// 404 del portal, dentro del diseno del portal (sin esto, Next mostraba el
// 404 generico de fabrica en ingles). Sin datos del cliente ni consultas a
// la base: notFound() se lanza por proyecto ajeno, codigo inexistente o
// limite de 120/min, y en ninguno de esos casos se sabe de que cliente es.
export default function NoEncontradoPortal() {
  return (
    <main className="portal portal--entrar">
      <span className="portal__logo">NERACOSU<i>.</i></span>
      <h1>No encontramos esa página</h1>
      <p className="portal__bajada">Revisa el enlace que te enviaron o escríbenos.</p>
    </main>
  );
}
