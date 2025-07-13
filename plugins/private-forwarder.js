// plugins/forwarder.js (Modo: Comando sin Prefijo, con Palabras Clave)

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

// --- CONFIGURACIÓN ---
const TARGET_GROUP_JID = '120363418624263010@g.us';
const FORWARDED_MEDIA_CAPTION_NORMAL = 'Media recibida en privado.';
const FORWARDED_MEDIA_CAPTION_VIEWONCE = 'Media recibida en privado (capturada de "Ver Una Vez").';
const FORWARDED_AUDIO_TEXT_MESSAGE = '▶️ Audio recibido en privado.';
// --------------------

// --- INICIO DE LA MODIFICACIÓN ---
// Lista de palabras clave que activarán el reenvío (en minúsculas).
// --- INICIO DE LA NUEVA LISTA ---
// Lista de palabras clave que activarán el reenvío (en minúsculas).
const triggerWords = [
    // --- Comandos Directos ---
    'priv', 'privado', 'reenviar', 'enviar', 'guardar', 'forward', 'send', 'save', 'mandar', 'comparte', 'compartir', 'respalda', 'respaldar', 'copia', 'copiar', 'archivar', 'archivo', 'subir', 'sube',
    // --- Palabras Cortas y Comunes ---
    'p', 'g', 'a', 'esta', 'este', 'esto', 'esa', 'ese', 'eso', 'ok', 'dale', 'va', 'listo', 'ya', 'ahora', 'bien', 'bueno', 'si', 'claro', 'afirmativo', 'ahi', 'ahí', 'aca', 'acá', 'aquí', 'aqui', 'vale',
    // --- Jerga y Coloquialismos (Varios Países) ---
    'buenoc','chido','Que rico','Que rico esta','Que delicioso','Ahhh','Uy','Uyy', 'Bueno', 'Entiendo', 'Ok','ok','okeis', 'Esta bien', 'Bueno','Me encanta','A ver','Un momento','Ohhh','Ohh','Oh','XD','xd','🤤','chale', 'orale', 'arre', 'camara', 'bacán', 'bacano', 'chevere', 'chévere', 'fino', 'epale', 'piola', 'joya', 'deuna', 'mostro', 'causa', 'habla', 'yala', 'guay', 'mola', 'flipas', 'alucina', 'flama',
    // --- Jerga de Internet / Gaming ---
    'gg', 'pog', 'nice', 'based', 'basado', 'god', 'épico', 'epico', 'ez', 'izi', 'clave', 'let', 'go', 'dale gas',
    // --- Expresiones de Confirmación ---
    'procede', 'proceder', 'confirmo', 'confirmado', 'afirmativo', 'entendido', 'recibido', 'anotado', 'check', 'listo calisto', 'a la orden', 'entendido y anotado', 'simón', 'simon'
];
// --- FIN DE LA NUEVA LISTA ---

module.exports = {
    name: 'Reenviador por Palabra Clave',
    // Usamos nuestra nueva lista de palabras como los alias del comando.
    aliases: triggerWords, 
    description: 'Responde a una imagen, video o audio con una palabra clave para reenviarlo a un grupo.',
    category: 'Interno',

    async execute(sock, msg, args) {
        const { _baileysMessage: baileysMsg } = msg;

        // 1. Verificar si es una respuesta a un mensaje.
        const quotedMsgInfo = baileysMsg.message?.extendedTextMessage?.contextInfo;
        const quotedMsgContent = quotedMsgInfo?.quotedMessage;
        if (!quotedMsgContent) {
            // Este caso ahora es menos probable que ocurra, ya que el handler solo
            // nos llamará si el cuerpo del mensaje coincide con un alias.
            // Pero lo dejamos como una guarda de seguridad.
            return;
        }

        // 2. Verificar que el mensaje citado sea una imagen, video o audio.
        let mediaMessageObject = null;
        let mediaType = null;

        if (quotedMsgContent.imageMessage) {
            mediaMessageObject = quotedMsgContent.imageMessage;
            mediaType = 'image';
        } else if (quotedMsgContent.videoMessage) {
            mediaMessageObject = quotedMsgContent.videoMessage;
            mediaType = 'video';
        } else if (quotedMsgContent.audioMessage) {
            mediaMessageObject = quotedMsgContent.audioMessage;
            mediaType = 'audio';
        }

        if (!mediaMessageObject) {
            // El usuario respondió con una palabra clave, pero no a un medio soportado.
            // Simplemente nos detenemos sin enviar ningún mensaje.
            return; 
        }
        console.log(`\x1b[36m[Forwarder Command]\x1b[0m Palabra clave sin prefijo detectada. Procesando ${mediaType} citado silenciosamente...`);
        
        const isViewOnce = quotedMsgInfo?.stanzaId?.startsWith('3EB0');

        try {
            const stream = await downloadContentFromMessage(mediaMessageObject, mediaType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            const captionForGroup = isViewOnce ? FORWARDED_MEDIA_CAPTION_VIEWONCE : FORWARDED_MEDIA_CAPTION_NORMAL;

            let messageToSend = {};
            if (mediaType === 'image' || mediaType === 'video') {
                messageToSend[mediaType] = buffer;
                messageToSend.caption = captionForGroup;
            } else if (mediaType === 'audio') {
                messageToSend.audio = buffer;
                messageToSend.mimetype = 'audio/ogg; codecs=opus';
                messageToSend.ptt = true;
            }
            
            await sock.sendMessage(TARGET_GROUP_JID, messageToSend);

            if (mediaType === 'audio') {
                const audioText = isViewOnce ? FORWARDED_MEDIA_CAPTION_VIEWONCE : FORWARDED_MEDIA_CAPTION_NORMAL;
                await sock.sendMessage(TARGET_GROUP_JID, { text: audioText });
            }
            
            console.log(`\x1b[32m[Forwarder Command]\x1b[0m ${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} reenviado exitosamente al grupo.`);
            
        } catch (error) {
            console.error(`\x1b[31m[Forwarder Command Error]\x1b[0m Falló el reenvío silencioso:`, error.message);
        }
    }
};