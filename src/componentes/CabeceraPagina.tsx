import type { ReactNode } from "react";

// Cabecera de cada pantalla: titulo, una cifra o dato clave opcional y la accion principal a la derecha
// (normalmente un <Link className="boton boton--primario">). En escritorio queda pegada arriba.
export function CabeceraPagina({ titulo, cifra, accion, children }: { titulo: string; cifra?: ReactNode; accion?: ReactNode; children?: ReactNode }) {
  return (
    <header className="cabecera-pagina">
      <div className="cabecera-pagina__texto">
        <h1>{titulo}</h1>
        {cifra && <span className="cabecera-pagina__cifra">{cifra}</span>}
      </div>
      {accion && <div className="cabecera-pagina__accion">{accion}</div>}
      {children}
    </header>
  );
}
