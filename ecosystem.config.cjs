// PM2 para el panel de prospectos. Arranca Next en produccion en 3013, solo en
// 127.0.0.1: todo el trafico externo entra por Apache (proxy en .htaccess).
// El daemon PM2 es compartido con hotelmarte, adastram, ameb y ocls:
// `pm2 list` antes de cualquier start/restart/stop/delete/save.
module.exports = {
  apps: [
    {
      name: "prospectos",
      cwd: "/home/neracosu/public_html/prospectos.neracosu.com",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3013 -H 127.0.0.1",
      env_file: "/home/neracosu/.config/prospectos/env",
    },
  ],
};
