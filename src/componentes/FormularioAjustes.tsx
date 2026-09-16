"use client";
import { useState, useTransition } from "react";
import { guardarNicho, guardarUsuario, restablecerPin } from "@/acciones/ajustes";

function useEnvio() {
  const [msj, setMsj] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, empezar] = useTransition();
  const enviar = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) =>
    empezar(async () => {
      const r = await fn();
      setMsj(r.ok ? { ok: true, texto: "Guardado." } : { ok: false, texto: r.mensaje ?? "Error" });
    });
  return { msj, pendiente, enviar };
}

export function FormularioNicho({
  nicho,
}: {
  nicho: { id: number; nombre: string; mensajeInicial: string; mensajeSeguimiento: string; diasSeguimiento: number };
}) {
  const { msj, pendiente, enviar } = useEnvio();
  return (
    <form className="tarjeta" action={(fd) => enviar(() => guardarNicho(fd))}>
      <b>{nicho.nombre}</b>
      <input type="hidden" name="id" value={nicho.id} />
      <label className="campo">
        <span>Mensaje inicial (usa {"{nombre}"} y {"{enlace}"})</span>
        <textarea name="mensajeInicial" rows={5} defaultValue={nicho.mensajeInicial} />
      </label>
      <label className="campo">
        <span>Mensaje de seguimiento</span>
        <textarea name="mensajeSeguimiento" rows={4} defaultValue={nicho.mensajeSeguimiento} />
      </label>
      <label className="campo">
        <span>Días para el seguimiento</span>
        <input name="diasSeguimiento" type="number" min={1} max={30} defaultValue={nicho.diasSeguimiento} />
      </label>
      <button className="boton boton--primario" disabled={pendiente}>Guardar</button>
      {msj && <p className={msj.ok ? "suave" : "error"} role="status">{msj.texto}</p>}
    </form>
  );
}

const PIN_VALIDO_CLIENTE = /^\d{6}$/;

export function FormularioUsuario({
  usuario,
}: {
  usuario?: { id: number; nombre: string; rol: string; activo: boolean; metaDiaria: number };
}) {
  const { msj, pendiente, enviar } = useEnvio();
  // Formulario propio para el PIN, separado del de arriba: si compartieran
  // <form>, Enter en el campo de PIN enviaba guardarUsuario en vez de
  // restablecerPin (y no reseteaba nada).
  const pinReset = useEnvio();
  const [pinNuevo, setPinNuevo] = useState("");
  return (
    <div className="tarjeta">
      <form action={(fd) => enviar(() => guardarUsuario(fd))}>
        <b>{usuario ? usuario.nombre : "Nuevo usuario"}</b>
        {usuario && <input type="hidden" name="id" value={usuario.id} />}
        <label className="campo">
          <span>Nombre</span>
          <input name="nombre" defaultValue={usuario?.nombre ?? ""} required />
        </label>
        <label className="campo">
          <span>Rol</span>
          <select name="rol" defaultValue={usuario?.rol ?? "prospectador"}>
            <option value="dueno">Dueño (ve todo)</option>
            <option value="prospectador">Prospectador (Hoy, Prospectos, Buscar)</option>
          </select>
        </label>
        <label className="campo">
          <span>Meta diaria de envíos</span>
          <input name="metaDiaria" type="number" min={0} max={200} defaultValue={usuario?.metaDiaria ?? 10} />
        </label>
        {usuario ? (
          <label className="campo">
            <span><input type="checkbox" name="activo" defaultChecked={usuario.activo} /> Activo</span>
          </label>
        ) : (
          <label className="campo">
            <span>PIN inicial (6 números)</span>
            <input name="pin" inputMode="numeric" pattern="\d{6}" required />
          </label>
        )}
        <button className="boton boton--primario" disabled={pendiente}>Guardar</button>
        {msj && <p className={msj.ok ? "suave" : "error"} role="status">{msj.texto}</p>}
      </form>
      {usuario && (
        <form
          className="fila-botones"
          action={(fd) => pinReset.enviar(() => restablecerPin(usuario.id, String(fd.get("pin") ?? "")))}
        >
          <input
            className="campo"
            style={{ width: 120 }}
            name="pin"
            placeholder="PIN nuevo"
            inputMode="numeric"
            pattern="\d{6}"
            required
            aria-label="PIN nuevo"
            value={pinNuevo}
            onChange={(e) => setPinNuevo(e.target.value)}
          />
          <button
            className="boton"
            disabled={pinReset.pendiente || !PIN_VALIDO_CLIENTE.test(pinNuevo)}
          >
            Restablecer PIN
          </button>
          {pinReset.msj && <p className={pinReset.msj.ok ? "suave" : "error"} role="status">{pinReset.msj.texto}</p>}
        </form>
      )}
    </div>
  );
}
