# 🎫 UltraTicket Bot

> **Bot de tickets premium completamente gratuito** con dashboard web, transcripciones HTML, estadísticas, sistema de calificaciones y mucho más.

---

## ✨ Funciones incluidas (todas gratis)

| Función | Descripción |
|---|---|
| 📄 Transcripciones HTML | Archivos HTML con diseño de Discord, adjuntos y avatares |
| 🌐 Dashboard Web | Panel de configuración accesible desde el navegador |
| 📁 Categorías ilimitadas | Cada una con roles, canales y mensajes propios |
| ⭐ Sistema de ratings | Los usuarios califican la atención al cerrar |
| ⚡ Prioridades | Baja, Media, Alta, Crítica |
| 🚫 Lista negra | Bloquea usuarios con razón y expiración |
| 🙋 Reclamar tickets | Staff se asigna tickets |
| ⏰ Auto-cierre | Cierra tickets inactivos automáticamente |
| 📊 Estadísticas | Métricas por categoría, staff y tiempo |
| 📋 Logs detallados | Registro de todos los eventos |
| 🔔 DMs automáticos | Notificaciones al abrir y cerrar |
| ➕ Añadir/quitar usuarios | Gestiona quién ve el ticket |

---

## 🚀 Instalación paso a paso

### Requisitos previos
- **Node.js 18+** → [nodejs.org](https://nodejs.org)
- **Cuenta de Discord Developer** → [discord.com/developers](https://discord.com/developers)

---

### 1. Crear la aplicación de Discord

1. Ve a [discord.com/developers/applications](https://discord.com/developers/applications)
2. Haz clic en **"New Application"** → ponle un nombre (ej: `UltraTicket`)
3. Ve a la sección **"Bot"**:
   - Haz clic en **"Add Bot"**
   - Activa **"Message Content Intent"**, **"Server Members Intent"** y **"Presence Intent"**
   - Copia el **Token** (lo necesitas para `.env`)
4. Ve a **"OAuth2 → General"**:
   - En **"Redirects"** añade: `http://localhost:3000/auth/discord/callback`
   - Copia el **Client ID** y el **Client Secret**

---

### 2. Invitar el bot al servidor

Ve a **"OAuth2 → URL Generator"**, selecciona:
- Scopes: `bot`, `applications.commands`
- Bot Permissions: `Administrator` (o personaliza los permisos que necesites)

Abre el link generado e invita el bot.

---

### 3. Clonar y configurar el proyecto

```bash
# Clonar / descomprimir el proyecto
cd ultraticket-bot

# Instalar dependencias
npm install

# Copiar el archivo de configuración
cp .env.example .env
```

Edita el archivo `.env`:

```env
DISCORD_TOKEN=tu_token_del_bot_aqui
CLIENT_ID=tu_client_id_aqui
CLIENT_SECRET=tu_client_secret_aqui

DASHBOARD_PORT=3000
DASHBOARD_URL=http://localhost:3000

SESSION_SECRET=escribe_aqui_algo_aleatorio_muy_largo_y_seguro

DATABASE_PATH=./data/tickets.db
TRANSCRIPTS_PATH=./data/transcripts
```

---

### 4. Iniciar el bot

```bash
# Inicializar base de datos y arrancar todo
npm start
```

Verás en la consola:
```
🎫 UltraTicket Bot iniciado como UltraTicket#1234
📊 Servidores: 1
🌐 Dashboard: http://localhost:3000
✅ Slash commands registrados
✅ Base de datos inicializada correctamente
```

---

### 5. Configurar desde el Dashboard

1. Abre **http://localhost:3000** en tu navegador
2. Haz clic en **"Iniciar sesión con Discord"**
3. Selecciona tu servidor
4. Ve a **"Categorías"** → crea tus categorías de tickets
5. Ve a **"Configuración"** → ajusta canales de logs y opciones
6. En Discord usa `/panel` para desplegar el panel de tickets

---

## 📝 Comandos de Discord

| Comando | Descripción | Permiso |
|---|---|---|
| `/panel` | Envía el panel de tickets al canal | Administrador |
| `/close [razón]` | Cierra el ticket actual | Staff/Admin |
| `/add @usuario` | Añade un usuario al ticket | Staff/Admin |
| `/remove @usuario` | Quita un usuario del ticket | Staff/Admin |
| `/rename <nombre>` | Renombra el canal del ticket | Staff/Admin |
| `/claim` | Reclama/libera el ticket | Staff/Admin |
| `/transcript` | Genera transcripción del ticket | Staff/Admin |
| `/blacklist add @user` | Añade a lista negra | Administrador |
| `/blacklist remove @user` | Quita de lista negra | Administrador |
| `/blacklist list` | Ver lista negra | Administrador |
| `/stats` | Estadísticas del servidor | Todos |
| `/setup` | Configuración rápida de canales | Administrador |

---

## 🌐 Despliegue en producción

### Con PM2 (recomendado)

```bash
npm install -g pm2
pm2 start src/index.js --name ultraticket
pm2 save
pm2 startup
```

### Variables de entorno para producción

```env
DASHBOARD_URL=https://tudominio.com   # Tu dominio real
NODE_ENV=production
```

### Nginx (proxy reverso)

```nginx
server {
    listen 80;
    server_name tudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

No olvides añadir `https://tudominio.com/auth/discord/callback` en los **Redirects** de tu aplicación de Discord.

---

## 🗂️ Estructura del proyecto

```
ultraticket-bot/
├── src/
│   ├── index.js                    # Entrada principal (bot + dashboard)
│   ├── bot/
│   │   ├── commands/
│   │   │   └── index.js            # Todos los slash commands
│   │   ├── handlers/
│   │   │   ├── ticketHandler.js    # Lógica de abrir/cerrar tickets
│   │   │   └── interactionHandler.js # Botones, modales, menús
│   │   └── utils/
│   │       └── transcript.js       # Generador de transcripciones HTML
│   ├── dashboard/
│   │   ├── server.js               # Servidor Express + OAuth2
│   │   └── public/
│   │       ├── index.html          # Página de inicio
│   │       ├── login.html          # Login con Discord
│   │       ├── dashboard.html      # Selector de servidores
│   │       ├── guild.html          # Panel de configuración del servidor
│   │       └── tickets.html        # Gestión de tickets
│   └── database/
│       ├── db.js                   # Funciones de base de datos
│       └── migrations.js           # Esquema de tablas SQLite
├── data/                           # Creado automáticamente
│   ├── tickets.db                  # Base de datos SQLite
│   └── transcripts/                # Archivos HTML de transcripciones
├── .env.example                    # Plantilla de configuración
├── package.json
└── README.md
```

---

## ❓ Preguntas frecuentes

**¿Es realmente gratis?**
Sí, 100%. Es auto-hospedado, tú pones el servidor.

**¿Cuántos tickets/servidores soporta?**
Ilimitados. SQLite maneja perfectamente hasta millones de registros.

**¿Puedo personalizar el diseño del panel?**
Sí, edita los archivos HTML en `src/dashboard/public/`.

**Los slash commands no aparecen en Discord**
Espera hasta 1 hora para que Discord los propague globalmente, o usa comandos de guild para pruebas inmediatas.

**¿Cómo hago backup de la base de datos?**
Simplemente copia el archivo `data/tickets.db`. Es un archivo SQLite estándar.

---

## 📄 Licencia

MIT — Úsalo libremente, modifícalo como quieras.
