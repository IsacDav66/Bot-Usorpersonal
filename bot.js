// --- bot.js (Baileys Version) ---
// vEstadoDirecto + Hot Reload (Attempted Baileys Port)
require('dotenv').config(); // <--- AÑADE ESTA LÍNEA BIEN ARRIBA

// --- ¡¡¡ ADVERTENCIA DE ALTO RIESGO !!! ---
// Misma advertencia: NO OFICIAL, RIESGO DE BLOQUEO, INESTABLE.
// Baileys, como cualquier librería no oficial, conlleva riesgos.

// --- Importaciones CommonJS ---
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
    jidNormalizedUser,
    jidDecode, // <--- VERIFICA QUE ESTÉ AQUÍ
    getContentType,
    isJidGroup,
    Browsers
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const qrcode = require('qrcode-terminal');
// --- Fin Importaciones ---

// --- Códigos de Escape ANSI ---
const color = {
    reset: "\x1b[0m", bold: "\x1b[1m", black: "\x1b[30m", red: "\x1b[31m",
    green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m", magenta: "\x1b[35m",
    cyan: "\x1b[36m", white: "\x1b[37m", brightBlack: "\x1b[90m", brightRed: "\x1b[91m",
    brightGreen: "\x1b[92m", brightYellow: "\x1b[93m", brightBlue: "\x1b[94m",
    brightMagenta: "\x1b[95m", brightCyan: "\x1b[96m", brightWhite: "\x1b[97m",
    bgBlack: "\x1b[40m", bgRed: "\x1b[41m", bgGreen: "\x1b[42m", bgYellow: "\x1b[43m",
    bgBlue: "\x1b[44m", bgMagenta: "\x1b[45m", bgCyan: "\x1b[46m", bgWhite: "\x1b[47m",
    bgBrightBlack: "\x1b[100m", bgBrightRed: "\x1b[101m", bgBrightGreen: "\x1b[102m",
    bgBrightYellow: "\x1b[103m", bgBrightBlue: "\x1b[104m", bgBrightMagenta: "\x1b[105m",
    bgBrightCyan: "\x1b[106m", bgBrightWhite: "\x1b[107m",
};
// --- Fin Códigos ANSI ---

console.log("=======================================");
console.log(color.green + color.bold + "     INICIANDO MI-BOT-WA PERSONAL (Baileys - vHotReload-EstadoDirecto) " + color.reset);
console.log("=======================================");

// --- Carga de Plugins ---
console.log(color.yellow + "\n--- Cargando Plugins ---" + color.reset);
const plugins = new Map();
const commandsList = [];
const pluginsPath = path.join(__dirname, 'plugins');
const IGNORED_BY_HOT_RELOAD = ['shared-economy.js'];
const socketEventListenersToInitialize = []; // Lista para listeners de evento socket

function loadPlugin(filePath) {
    const fileName = path.basename(filePath);
    if (IGNORED_BY_HOT_RELOAD.includes(fileName)) {
        console.log(color.blue + `[Plugin Loader] Archivo ${fileName} ignorado (es una librería compartida).` + color.reset);
        return;
    }
    const pluginKey = fileName.replace('.js', '');
    try {
        delete require.cache[require.resolve(filePath)];
        const plugin = require(filePath);
        console.log(color.cyan + `[HOT RELOAD] Intentando cargar/recargar plugin: ${fileName}` + color.reset);
        plugins.set(pluginKey, plugin);
        let loadedType = 'Desconocido';

        if (plugin.aliases && Array.isArray(plugin.aliases) && plugin.aliases.length > 0 && typeof plugin.execute === 'function') {
            loadedType = 'Comando';
            const existingCmdIndex = commandsList.findIndex(cmd => cmd.pluginKey === pluginKey);
            const commandData = {
                name: plugin.name || pluginKey,
                pluginKey: pluginKey,
                aliases: plugin.aliases,
                description: plugin.description || 'Sin desc.',
                groupOnly: plugin.groupOnly || false,
                category: plugin.category || 'Otros'
            };
            if (existingCmdIndex > -1) {
                commandsList[existingCmdIndex] = commandData;
            } else {
                commandsList.push(commandData);
            }
            commandsList.sort((a, b) => {
                const catCompare = (a.category || 'Otros').localeCompare(b.category || 'Otros');
                if (catCompare !== 0) return catCompare;
                return a.aliases[0].localeCompare(b.aliases[0]);
            });
            plugin.aliases.forEach(alias => {
                const commandName = alias.toLowerCase();
                if (plugins.has(commandName) && plugins.get(commandName) !== plugin) {
                    console.warn(color.yellow + `[WARN HOT RELOAD] Alias '${commandName}' del plugin ${pluginKey} sobreescribe otro.` + color.reset);
                }
                plugins.set(commandName, plugin);
            });
        } else if (typeof plugin.checkMessage === 'function') {
            loadedType = 'Listener (Mensaje)';
        } else if (typeof plugin.initialize === 'function' && plugin.isListener) {
            loadedType = 'Listener (Evento Socket)';
            const existingListener = socketEventListenersToInitialize.find(p => p.pluginKey === pluginKey);
            if (!existingListener) {
                socketEventListenersToInitialize.push({ pluginKey, plugin });
                console.log(color.blue + `[Plugin Loader] Listener de evento socket '${plugin.name || pluginKey}' añadido a la cola de inicialización.` + color.reset);
            } else {
                 console.log(color.blue + `[Plugin Loader] Listener de evento socket '${plugin.name || pluginKey}' ya en cola. Se re-inicializará si 'sock' se reinicia.` + color.reset);
            }
        } else if (typeof plugin.isUserRegistering === 'function' && typeof plugin.processStep === 'function') {
            loadedType = 'Estado (Directo)';
        } else if (typeof plugin.isUserInState === 'function' && typeof plugin.processState === 'function') {
            loadedType = 'Estado (Genérico-Ignorado)';
        }

        if (loadedType !== 'Desconocido') console.log(color.green + `[HOT RELOAD - ${loadedType}] Cargado/Recargado:` + color.reset + ` ${plugin.name || pluginKey}`);
        else if (Object.keys(plugin).length > 0) console.warn(color.yellow + `[WARN HOT RELOAD] ${fileName} es un archivo .js pero no exporta una estructura de plugin reconocida.` + color.reset);

    } catch (error) {
        console.error(color.red + `[ERROR HOT RELOAD] Falló al cargar/recargar ${fileName}:` + color.reset, error);
        if (!IGNORED_BY_HOT_RELOAD.includes(fileName)) {
             unloadPlugin(filePath);
        }
    }
}

function unloadPlugin(filePath) {
    const fileName = path.basename(filePath);
    if (IGNORED_BY_HOT_RELOAD.includes(fileName)) {
        return;
    }
    const pluginKey = fileName.replace('.js', '');
    try {
        const resolvedPath = require.resolve(filePath); // Asegurarse de que existe antes de proceder
        const plugin = plugins.get(pluginKey);

        if (!plugin) {
            if (require.cache[resolvedPath]) {
                delete require.cache[resolvedPath];
            }
            return;
        }

        console.log(color.magenta + `[HOT RELOAD] Descargando plugin: ${pluginKey}` + color.reset);
        if (plugin.aliases) {
            plugin.aliases.forEach(alias => { if (plugins.get(alias.toLowerCase()) === plugin) plugins.delete(alias.toLowerCase()); });
        }
        const cmdIndex = commandsList.findIndex(cmd => cmd.pluginKey === pluginKey);
        if (cmdIndex > -1) commandsList.splice(cmdIndex, 1);
        
        // Remover de la cola de inicialización de listeners de socket
        const listenerIndex = socketEventListenersToInitialize.findIndex(p => p.pluginKey === pluginKey);
        if (listenerIndex > -1) {
            socketEventListenersToInitialize.splice(listenerIndex, 1);
            console.log(color.magenta + `[Plugin Unload] Listener ${pluginKey} removido de la cola de inicialización.` + color.reset);
        }
        // Aquí faltaría una lógica para "des-registrar" el listener del socket si ya fue inicializado.
        // Esto usualmente requiere que el plugin exporte una función `cleanup(sock)`.

        plugins.delete(pluginKey);
        delete require.cache[resolvedPath];
        console.log(color.magenta + `[HOT RELOAD] Plugin ${pluginKey} descargado.` + color.reset);
    } catch (error) {
        if (error.code !== 'MODULE_NOT_FOUND') {
            console.error(color.red + `[ERROR HOT RELOAD] Error al descargar ${pluginKey}:` + color.reset, error.message);
        }
        plugins.delete(pluginKey);
        const cmdIndex = commandsList.findIndex(cmd => cmd.pluginKey === pluginKey);
        if (cmdIndex > -1) commandsList.splice(cmdIndex, 1);
        const listenerIndex = socketEventListenersToInitialize.findIndex(p => p.pluginKey === pluginKey);
        if (listenerIndex > -1) socketEventListenersToInitialize.splice(listenerIndex, 1);
    }
}

try {
    if (!fs.existsSync(pluginsPath)) {
        fs.mkdirSync(pluginsPath, { recursive: true });
        console.warn(color.yellow + `[ADVERTENCIA] Carpeta plugins no encontrada, se ha creado: ${pluginsPath}.` + color.reset);
    }
    const pluginFiles = fs.readdirSync(pluginsPath)
        .filter(file => file.endsWith('.js') && !IGNORED_BY_HOT_RELOAD.includes(file));
    if (pluginFiles.length > 0) {
        console.log(`Cargando ${pluginFiles.length} plugins iniciales...`);
        pluginFiles.forEach(file => {
            console.log(color.blue + `[Carga Inicial] Procesando archivo: ${file}` + color.reset);
            loadPlugin(path.join(pluginsPath, file));
        });
        console.log(color.brightBlue + `\nTotal de ${commandsList.length} comandos registrados inicialmente.` + color.reset);
        console.log(color.brightBlue + `Total de ${plugins.size} entradas en mapa (incluye alias y keys de plugin).` + color.reset);
        console.log(color.brightBlue + `Total de ${socketEventListenersToInitialize.length} listeners de evento socket en cola.` + color.reset);
    } else {
        console.log(color.blue + "No se encontraron plugins para cargar inicialmente." + color.reset);
    }
} catch (error) { console.error(color.brightRed + `[ERROR CRÍTICO] Lectura inicial carpeta plugins:` + color.reset, error); }
console.log(color.yellow + "--- Fin Carga Inicial de Plugins ---\n" + color.reset);
// --- Fin Carga ---

// --- Adaptador de Mensaje Baileys a WWJS (Simplificado) ---
async function baileysMessageToWWJSMessageAdapter(m, sockInstance) {
    if (!m || !m.messages || m.messages.length === 0) return null;
    const baileysMsg = m.messages[0];
    if (!baileysMsg.message) return null;

    const wwjsMsg = {};
    const Jid = baileysMsg.key.remoteJid;
    const isGroup = isJidGroup(Jid);
    
    const type = getContentType(baileysMsg.message);
    if (type === 'conversation') {
        wwjsMsg.body = baileysMsg.message.conversation;
    } else if (type === 'extendedTextMessage') {
        wwjsMsg.body = baileysMsg.message.extendedTextMessage.text;
    } else if (type === 'imageMessage' && baileysMsg.message.imageMessage?.caption) {
        wwjsMsg.body = baileysMsg.message.imageMessage.caption;
    } else if (type === 'videoMessage' && baileysMsg.message.videoMessage?.caption) {
        wwjsMsg.body = baileysMsg.message.videoMessage.caption;
    } else {
        wwjsMsg.body = '';
    }

    wwjsMsg.from = Jid;
    wwjsMsg.author = isGroup ? baileysMsg.key.participant : Jid; // Este es el JID del remitente
    wwjsMsg.fromMe = baileysMsg.key.fromMe;
    wwjsMsg.id = baileysMsg.key.id;

    if (type === 'conversation' || type === 'extendedTextMessage') wwjsMsg.type = 'chat';
    else if (type === 'imageMessage') wwjsMsg.type = 'image';
    else if (type === 'videoMessage') wwjsMsg.type = 'video';
    else if (type === 'stickerMessage') wwjsMsg.type = 'sticker';
    else if (type === 'documentMessage') wwjsMsg.type = 'document';
    else if (type === 'audioMessage') wwjsMsg.type = 'audio';
    else wwjsMsg.type = type;

    wwjsMsg.getChat = async () => {
        // ... (sin cambios aquí) ...
        let chatName = Jid;
        let groupMetadata = null;
        if (isGroup) {
            try {
                groupMetadata = await sockInstance.groupMetadata(Jid);
                chatName = groupMetadata.subject;
            } catch (e) { console.error(color.red + `Error getting group metadata for ${Jid}:` + color.reset, e); }
        }
        return {
            id: { _serialized: Jid },
            isGroup: isGroup,
            name: chatName,
            groupMetadata: groupMetadata
        };
    };

    wwjsMsg.getContact = async () => {
        // ... (sin cambios aquí) ...
        const contactId = wwjsMsg.author; // Usar el JID del autor del mensaje
        const decodedJid = jidDecode(contactId);
        const contactNumber = decodedJid ? decodedJid.user : contactId?.split('@')[0] || 'unknown';

        return {
            id: { _serialized: contactId },
            pushname: baileysMsg.pushName || 'Desconocido',
            name: null, // El nombre oficial del contacto (si está guardado) podría requerir otra llamada
            number: contactNumber,
        };
    };

    // --- NÚMERO DE TELÉFONO DEL REMITENTE ---
    // wwjsMsg.author ya contiene el JID del remitente
    // Si es un grupo, wwjsMsg.author es el JID del participante.
    // Si es un chat privado, wwjsMsg.author es el JID del usuario.
    if (wwjsMsg.author) {
        const decodedAuthorJid = jidDecode(wwjsMsg.author);
        wwjsMsg.senderPhoneNumber = decodedAuthorJid ? decodedAuthorJid.user : null;
    } else {
        wwjsMsg.senderPhoneNumber = null;
    }
    // --- FIN NÚMERO DE TELÉFONO ---

    // --- NUEVA SECCIÓN PARA JIDS MENCIONADOS ---
    // Extraer los JIDs mencionados del mensaje original de Baileys.
    // Se encuentran en extendedTextMessage.contextInfo.mentionedJid
    const contextInfo = baileysMsg.message?.extendedTextMessage?.contextInfo;
    wwjsMsg.mentionedJidList = contextInfo?.mentionedJid || [];
    // --- FIN NUEVA SECCIÓN ---

    wwjsMsg.reply = async (text) => {
        return sockInstance.sendMessage(Jid, { text: text }, { quoted: baileysMsg });
    };

    // ASEGÚRATE DE TENER ESTO:
    if (wwjsMsg.author) {
        const decodedSenderJid = jidDecode(wwjsMsg.author); // Necesitas importar jidDecode de Baileys
        wwjsMsg.senderPhoneNumber = decodedSenderJid ? decodedSenderJid.user : null;
    } else {
        wwjsMsg.senderPhoneNumber = null;
    }
    
    wwjsMsg._baileysMessage = baileysMsg;
    return wwjsMsg;
}
// --- Fin Adaptador ---

// --- Inicialización del Socket Baileys ---
let sock;
let isConnecting = false;
const authPath = path.join(__dirname, '.baileys_auth_info');

async function startBot() {
    const pinoLogger = pino({ level: 'error' });
    if (isConnecting) {
        console.log(color.yellow + "Intento de conexión ya en progreso, omitiendo." + color.reset);
        return;
    }
    isConnecting = true;

    if (sock) {
        console.log(color.blue + "Limpiando instancia de socket anterior antes de reconectar..." + color.reset);
        try {
            sock.ev.removeAllListeners(); // Quita todos los listeners del socket anterior
            if (sock.ws && sock.ws.readyState !== sock.ws.CLOSED && sock.ws.readyState !== sock.ws.CLOSING) {
                 await sock.end(new Error('Reconnecting with new auth state'));
            }
        } catch (e) {
            console.error(color.red + "Error limpiando socket anterior:" + color.reset, e.message);
        }
        sock = null;
    }

    console.log(color.yellow + "--- Inicializando Cliente WhatsApp (Baileys) ---" + color.reset);
    try {
        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(color.cyan + `Usando Baileys v${version.join('.')}, ${isLatest ? 'es la última versión.' : 'hay una nueva versión disponible.'}` + color.reset);
        console.log(color.green + "Directorio de datos de sesión de Baileys:", authPath + color.reset);

        sock = makeWASocket({
            version,
            //logger: pino({ level: 'debug' }),
            auth: state,
            browser: Browsers.macOS('Desktop'),
        });

        // --- INICIALIZAR LISTENERS DE EVENTO SOCKET ---
        if (socketEventListenersToInitialize.length > 0) {
            console.log(color.yellow + "\n--- Inicializando Listeners de Eventos de Socket Pendientes ---" + color.reset);
            for (const { pluginKey, plugin } of socketEventListenersToInitialize) {
                try {
                    console.log(color.cyan + `[Socket Event Init] Inicializando listener: ${plugin.name || pluginKey}` + color.reset);
                    await plugin.initialize(sock);
                } catch (initError) {
                    console.error(color.red + `[ERROR Socket Event Init] Falló al inicializar ${plugin.name || pluginKey}:` + color.reset, initError);
                }
            }
        }
        // --- FIN INICIALIZAR LISTENERS ---

        // --- Eventos del Socket ---
        console.log(color.yellow + "\n--- Configurando Eventos del Socket ---" + color.reset);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log(color.yellow + '\n[QR CODE] Escanea el siguiente código con WhatsApp:' + color.reset);
                qrcode.generate(qr, { small: true });
                isConnecting = false; 
            }

            if (connection === 'close') {
                isConnecting = false; 
                const statusCode = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output.statusCode : (lastDisconnect?.error ? 500 : null);
                
                let shouldReconnect = false;
                if (lastDisconnect?.error) {
                    shouldReconnect = statusCode !== DisconnectReason.loggedOut &&
                                      statusCode !== DisconnectReason.connectionReplaced &&
                                      statusCode !== DisconnectReason.multideviceMismatch &&
                                      statusCode !== DisconnectReason.badSession; 

                    if (statusCode === DisconnectReason.restartRequired || (lastDisconnect.error.message && lastDisconnect.error.message.includes('Stream Errored'))) {
                        shouldReconnect = true; 
                    }
                }

                console.warn(color.yellow + `\n[DESCONECTADO] Conexión cerrada. Razón: ${lastDisconnect?.error || 'Desconocida (código: '+statusCode+')'}. Reintentando con startBot(): ${shouldReconnect}` + color.reset);
                
                if (shouldReconnect) {
                    console.log(color.blue + "Intentando reconectar llamando a startBot() de nuevo en 5 segundos..." + color.reset);
                    setTimeout(() => {
                        startBot().catch(err => {
                            console.error(color.brightRed + "[ERROR RECONEXIÓN startBot]" + color.reset, err);
                        });
                    }, 5000);

                } else {
                    console.error(color.brightRed + "Desconexión no recuperable o no se debe reintentar desde aquí." + color.reset);
                    if (statusCode === DisconnectReason.loggedOut) {
                        console.log(color.yellow + "Motivo: Sesión cerrada (loggedOut). Eliminando credenciales..." + color.reset);
                        try {
                            if (fs.existsSync(authPath)) {
                                fs.rmSync(authPath, { recursive: true, force: true });
                                console.log(color.green + "Carpeta de autenticación eliminada." + color.reset);
                            }
                        } catch (e) {
                            console.error(color.red + "Error eliminando carpeta de autenticación: " + e.message + color.reset);
                        }
                        process.exit(1);
                    } else if (statusCode === DisconnectReason.badSession) {
                         console.error(color.brightRed + "Sesión corrupta (badSession). Elimina la carpeta de autenticación y reinicia." + color.reset);
                         try {
                            if (fs.existsSync(authPath)) {
                                fs.rmSync(authPath, { recursive: true, force: true });
                                console.log(color.green + "Carpeta de autenticación eliminada debido a badSession." + color.reset);
                            }
                        } catch (e) {
                            console.error(color.red + "Error eliminando carpeta de autenticación: " + e.message + color.reset);
                        }
                        process.exit(1);
                    }
                }
            } else if (connection === 'open') {
                isConnecting = false;
                console.log(color.brightGreen + '\n**************** BOT LISTO (Conectado a WhatsApp) ****************\n' + color.reset);
                console.log(color.cyan + `Conectado como: ${sock?.user?.name || sock?.user?.id}` + color.reset);
                
                // ----- ¡LLAMAR A LA INICIALIZACIÓN DE LA BD AQUÍ! -----
                try {
                    console.log("\x1b[36m[DB Init]\x1b[0m Conexión a WhatsApp abierta. Inicializando base de datos de economía...");
                    await initEconomyDB(); // Llama a la función que importamos
                    await initializeAdminWhitelistDB(); // <-- Y llamarlo aquí
                } catch (dbError) {
                    console.error("\x1b[31m[DB Init Error]\x1b[0m Falló la inicialización de la base de datos después de conectar a WhatsApp:", dbError);
                }
                // ---------------------------------------------------
    
            }

            if (connection) {
                console.log(color.blue + '[ESTADO CONEXIÓN]' + color.reset, connection);
            }
        });

        sock.ev.on('messages.upsert', async (m) => {
            if (m.type !== 'notify' || !m.messages || m.messages.length === 0) return;        
            const adaptedMessage = await baileysMessageToWWJSMessageAdapter(m, sock);
            if (!adaptedMessage) return;
            
             // --- Logging ---
    try {
        const chat = await adaptedMessage.getChat();
        const contact = await adaptedMessage.getContact(); // getContact ahora devuelve el número en contact.number
        const senderIdRaw = adaptedMessage.author;
        let senderName = contact.pushname || contact.name || (jidDecode(senderIdRaw)?.user) || '?';
        
        // --- NUEVO: Obtener el número de teléfono para el log ---
        const senderPhoneNumberForLog = adaptedMessage.senderPhoneNumber || 'N/A';
        // --- FIN NUEVO ---
        
        let senderIdForLog = senderIdRaw || 'ID_Err';
        
        const timestamp = new Date().toLocaleTimeString('es-PE',{timeZone:'America/Lima'});
        const isGroup = chat.isGroup;
        const groupName = isGroup ? chat.name : 'Priv';
        const chatIdLog = adaptedMessage.from;
        const msgType = adaptedMessage.type.toUpperCase();
        const msgBody = adaptedMessage.body || `(${adaptedMessage.type})`;

        const clr = color; const icon = clr.cyan+'❖'+clr.reset; const bT=clr.brightBlue+'╭'+'─'.repeat(30)+clr.cyan+'𖡼'+clr.reset; const bB=clr.brightBlue+'╰'+'─'.repeat(30)+clr.cyan+'𖡼'+clr.reset; const bP=clr.brightBlue+'┃ '+clr.reset;
        
        // --- MODIFICADO: Añadir el número de teléfono al log ---
        const logStr = `\n${bT}\n${bP}${icon} ${clr.white+clr.bold}Hora:${clr.reset} ${clr.black+clr.bgGreen} ${timestamp} ${clr.reset}\n${bP}${icon} ${clr.white+clr.bold}Usuario:${clr.reset} ${clr.white}${senderName}${clr.reset}\n${bP}${icon} ${clr.white+clr.bold}Número:${clr.reset} ${clr.cyan}${senderPhoneNumberForLog}${clr.reset}\n${bP}${icon} ${clr.white+clr.bold}ID_privado:${clr.reset}(${senderIdForLog})\n${bP}${icon} ${clr.white+clr.bold}En:${clr.reset} ${clr.yellow}${isGroup?`${groupName}(${chatIdLog})`:`Priv(${chatIdLog})`}${clr.reset}\n${bP}${icon} ${clr.white+clr.bold}Tipo:${clr.reset} ${clr.white+clr.bgBrightBlue+clr.bold} ${msgType} ${clr.reset}\n${bP}${clr.white}${msgBody}${clr.reset}\n${bB}`;
        // --- FIN MODIFICADO ---
        console.log(logStr);

    } catch (logError) { console.log(color.red + `[ERROR LOG] ${adaptedMessage?.from}: ${logError.message}` + color.reset); }
            
            // --- Procesamiento (Prioridades) ---
            let messageProcessed = false;
            const userIdForCheck = adaptedMessage.from;
            const pluginKeysInState = ['rakion_register', 'reporte_kills', 'saldo', 'recargar','levelpoint','inventario']; 

            for (const pluginKeyToCheck of pluginKeysInState) {
                 if (messageProcessed) break; 
                 const currentPlugin = plugins.get(pluginKeyToCheck);
                 if (currentPlugin && typeof currentPlugin.isUserRegistering === 'function' && currentPlugin.isUserRegistering(userIdForCheck)) {
                     messageProcessed = true;
                     console.log(color.magenta + `[PROCESO ESTADO (${pluginKeyToCheck})] Chat ${userIdForCheck} en estado.` + color.reset);
                     const commandPrefix = '!';
                     let allowedCommands = []; 
                     if (currentPlugin.aliases) { allowedCommands = currentPlugin.aliases.map(a => `!${a.toLowerCase()}`); }

                     if (adaptedMessage.body && adaptedMessage.body.startsWith(commandPrefix) && !allowedCommands.includes(adaptedMessage.body.toLowerCase())) {
                          await adaptedMessage.reply("⚠️ Estás en medio de un proceso. Responde la pregunta o escribe 'cancelar'.");
                     } else if (typeof currentPlugin.processStep === 'function') {
                          try {
                               console.log(color.cyan + `[DEBUG BOT.JS] >>> Llamando a processStep de ${pluginKeyToCheck} para chat ${userIdForCheck}...` + color.reset);
                               await currentPlugin.processStep(sock, adaptedMessage);
                               console.log(color.cyan + `[DEBUG BOT.JS] <<< processStep de ${pluginKeyToCheck} completado.` + color.reset);
                          } catch (pluginError) {
                               console.error(color.red + `[ERROR ESTADO (${pluginKeyToCheck})] Error EJECUTANDO processStep para ${userIdForCheck}:` + color.reset, pluginError);
                               await adaptedMessage.reply(`❌ Error procesando tu respuesta (${pluginKeyToCheck}).`);
                          }
                     } else {
                          console.error(color.red + `[ERROR CONFIG] Plugin '${pluginKeyToCheck}' detectado en estado pero falta 'processStep'.` + color.reset);
                     }
                 } 
            } 
            if (messageProcessed) { console.log(`[DEBUG BOT.JS] Mensaje procesado por estado, retornando.`); return; }
            
            for (const [key, plugin] of plugins.entries()) {
                if (!messageProcessed && plugin?.checkMessage) {
                    try {
                        console.log(`[DEBUG BOT.JS - Listener Loop] Verificando plugin: ${plugin.name || key}`);
                        const handled = await plugin.checkMessage(sock, adaptedMessage);
                        if (handled) {
                            console.log(color.blue + `[LISTENER (Mensaje)] ${plugin.name || key}` + color.reset);
                            messageProcessed = true;
                            break;
                        }
                    } catch (e) { console.error(color.red+`[ERR LISTENER (Mensaje)] ${plugin.name||key}`+color.reset, e); }
                }
            }
            // Si ya fue procesado por un listener (como el disparador), no procesar como comando.
            if (messageProcessed) {
                console.log(`[DEBUG BOT.JS] Mensaje procesado por listener, saltando procesamiento de comandos.`);
                return;
            }

            // Ignorar mensajes sin cuerpo de texto.
            if (!adaptedMessage.body) {
                return;
            }

            // *** NUEVA LÓGICA PARA PERMITIR COMANDOS DEL BOT ***
            // La guarda "fromMe" ahora se aplica después de la lógica de comandos, no antes.
            // Esto permite que el bot se procese a sí mismo.

            const allowedPrefixes = ['!', '.', '#', '/', '$', '%'];
            let usedPrefix = null;
            let potentialCommandName = '';
            let args = [];
            let command = null;
// 1. Intentar encontrar un comando con prefijo
for (const pfx of allowedPrefixes) {
    if (adaptedMessage.body.startsWith(pfx)) {
        usedPrefix = pfx;
        break;
    }
}

if (usedPrefix) {
    // Se encontró un prefijo, procesar como un comando normal
    args = adaptedMessage.body.slice(usedPrefix.length).trim().split(/ +/);
    potentialCommandName = args.shift().toLowerCase();
    command = plugins.get(potentialCommandName);
} else {
    // 2. Si NO se encontró prefijo, ver si el texto completo es un alias de comando
    potentialCommandName = adaptedMessage.body.trim().toLowerCase();
    command = plugins.get(potentialCommandName);
    // Si encontramos un comando sin prefijo, los argumentos estarán vacíos
    args = [];
}

// 3. Si después de ambas comprobaciones no encontramos un comando válido, detener.
if (!command || typeof command.execute !== 'function') {
    return;
}

// 4. Ejecutar el comando encontrado
const chatCmd = await adaptedMessage.getChat();
if (command.groupOnly && !chatCmd.isGroup) {
    await adaptedMessage.reply(`⛔ Comando \`${command.aliases[0]}\` solo para grupos.`);
    return;
}

try {
    // Usamos el `usedPrefix` (si existe) o un string vacío para el log
    const displayPrefix = usedPrefix || '';
    console.log(color.cyan + `[CMD] ${displayPrefix}${potentialCommandName} por ${adaptedMessage.author}` + color.reset);
    
    const isHelp = command.aliases.includes('ayuda') || command.aliases.includes('help');
    if (isHelp) {
        await command.execute(sock, adaptedMessage, args, commandsList);
    } else {
        await command.execute(sock, adaptedMessage, args, potentialCommandName);
    }
    // No necesitas `messageProcessed = true` aquí, ya que es la última acción posible.
} catch (e) {
    const displayPrefix = usedPrefix || '';
    console.error(color.red + `[ERR CMD] ${displayPrefix}${potentialCommandName}` + color.reset, e);
    await adaptedMessage.reply(`❌ Error ejecutando \`${displayPrefix}${potentialCommandName}\`.`);
}

// --- FIN DE LA SECCIÓN DE COMANDOS CORREGIDA ---
});

    } catch (error) {
        isConnecting = false;
        console.error(color.brightRed + "[ERROR CRÍTICO EN startBot]" + color.reset, error);
        console.log(color.yellow + "Intentando una reconexión completa después de un error crítico en startBot en 10 segundos..." + color.reset);
        setTimeout(() => {
            startBot().catch(e => {
                console.error(color.brightRed + "Fallo el reintento de startBot después de error crítico. Saliendo." + color.reset, e);
                process.exit(1);
            });
        }, 10000);
    }
} // Fin startBot()

// --- Inicialización y Manejo Errores Globales ---
let watcher;

function initializeWatcher() {
    if (watcher) return;
    console.log(color.blue + "\n--- Iniciando Observador de Plugins (Hot Reload) ---" + color.reset);
    try {
        if (!fs.existsSync(pluginsPath)) {
            console.warn(color.yellow + `[WATCHER] Carpeta plugins no encontrada: ${pluginsPath}. Se creará.` + color.reset);
            fs.mkdirSync(pluginsPath, { recursive: true });
        }

        watcher = chokidar.watch(pluginsPath, { ignored: /(^|[\/\\])\../, persistent: true, ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 } });
        
        watcher
        .on('add', fp => {
            const fileName = path.basename(fp);
            if (fp.endsWith('.js') && !IGNORED_BY_HOT_RELOAD.includes(fileName)) { 
                console.log(color.green + `[WATCHER] Nuevo plugin: ${fileName}` + color.reset);
                loadPlugin(fp);
                const pluginKey = fileName.replace('.js','');
                const newPlugin = plugins.get(pluginKey);
                if (sock && newPlugin && typeof newPlugin.initialize === 'function' && newPlugin.isListener) {
                    console.log(color.cyan + `[Socket Event Init - Hot Add] Inicializando listener: ${newPlugin.name || pluginKey}` + color.reset);
                    newPlugin.initialize(sock).catch(err => console.error(color.red + `Error inicializando ${pluginKey} en hot add:`, err + color.reset));
                }
            } else if (IGNORED_BY_HOT_RELOAD.includes(fileName)) {
                console.log(color.blue + `[WATCHER] Archivo ${fileName} añadido, pero ignorado por Hot Reload.` + color.reset);
            }
        })
        .on('change', fp => {
            const fileName = path.basename(fp);
            if (fp.endsWith('.js') && !IGNORED_BY_HOT_RELOAD.includes(fileName)) { 
                console.log(color.yellow + `[WATCHER] Plugin modificado: ${fileName}. Recargando...` + color.reset);
                unloadPlugin(fp); 
                loadPlugin(fp);
                const pluginKey = fileName.replace('.js','');
                const changedPlugin = plugins.get(pluginKey);
                if (sock && changedPlugin && typeof changedPlugin.initialize === 'function' && changedPlugin.isListener) {
                    console.log(color.cyan + `[Socket Event Init - Hot Change] Re-inicializando listener: ${changedPlugin.name || pluginKey}` + color.reset);
                    changedPlugin.initialize(sock).catch(err => console.error(color.red + `Error re-inicializando ${pluginKey} en hot change:`, err + color.reset));
                }
            } else if (IGNORED_BY_HOT_RELOAD.includes(fileName)) {
                console.log(color.blue + `[WATCHER] Archivo ${fileName} modificado, pero ignorado por Hot Reload. Si es una dependencia crítica, reinicia el bot para aplicar cambios.` + color.reset);
            }
        })
        .on('unlink', fp => {
            const fileName = path.basename(fp);
            if (fp.endsWith('.js') && !IGNORED_BY_HOT_RELOAD.includes(fileName)) { 
                console.log(color.red + `[WATCHER] Plugin eliminado: ${fileName}` + color.reset);
                unloadPlugin(fp);
            } else if (IGNORED_BY_HOT_RELOAD.includes(fileName)){
                console.log(color.blue + `[WATCHER] Archivo ${fileName} eliminado, pero estaba ignorado por Hot Reload.` + color.reset);
            }
        })
        .on('error', error => console.error(color.red + '[WATCHER ERROR]' + color.reset, error));
        console.log(color.blue + `Observando cambios en: ${pluginsPath}` + color.reset);

    } catch (error) {
        console.error(color.brightRed + "[ERROR CRÍTICO INICIALIZANDO WATCHER]" + color.reset, error);
    }
}

// --- Arranque Principal ---
console.log(color.yellow + "\n--- Iniciando Conexión a WhatsApp (Baileys) ---" + color.reset);

initializeWatcher();

startBot().catch(err => {
    console.error(color.brightRed + "[ERROR FATAL INIT BAILEYS]" + color.reset, err);
    if (watcher) watcher.close();
    process.exit(1);
});

process.on('SIGINT', async () => {
    console.log(color.yellow + "\n[PROCESO] SIGINT (Ctrl+C). Cerrando..." + color.reset);
    isConnecting = true; 
    if (watcher) {
        console.log(color.yellow + "[PROCESO] Cerrando watcher..." + color.reset);
        await watcher.close();
        console.log(color.green + "[PROCESO] Watcher cerrado." + color.reset);
    }
    if (sock) {
        console.log(color.yellow + "[PROCESO] Cerrando conexión Baileys..." + color.reset);
        try {
            if (sock.ws && sock.ws.readyState !== sock.ws.CLOSED && sock.ws.readyState !== sock.ws.CLOSING) {
                await sock.logout(); 
                console.log(color.green + "[PROCESO] Logout de Baileys enviado." + color.reset);
            } else {
                console.log(color.blue + "[PROCESO] Socket ya cerrado o cerrándose." + color.reset)
            }
        } catch (e) {
            console.error(color.red + "[ERROR CIERRE BAILEYS]" + color.reset, e.message);
        }
    }
    setTimeout(() => process.exit(0), 1000);
});

process.on('uncaughtException', (err, origin) => {
    console.error(color.brightRed + '\n[ERROR NO CAPTURADO]' + color.reset);
    console.error('Origen:', origin);
    console.error('Error:', err);
    if (watcher) watcher.close();
    if (sock && sock.ws && sock.ws.readyState !== sock.ws.CLOSED && sock.ws.readyState !== sock.ws.CLOSING) {
        sock.end(err);
    }
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(color.brightRed + '\n[RECHAZO PROMESA NO MANEJADO]' + color.reset);
    console.error('Razón:', reason);
});

console.log(color.blue + "\nNúcleo cargado. Esperando conexión e inicialización del watcher..." + color.reset);
// --- Fin Script ---