/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║           FIXRED BOT - WhatsApp Appeal System             ║
 * ║              Bot Banding WhatsApp via Email               ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

const TelegramBot = require('node-telegram-bot-api');
const nodemailer = require('nodemailer');
const fs = require('fs');
const configManager = require('./config');

let config = configManager.config;

// ================== STYLING & DEBUG ==================
const DEBUG = true;

const style = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
};

function getTimestamp() {
    return new Date().toLocaleTimeString('id-ID', { hour12: false });
}

function log(type, message, data = null) {
    const timestamp = `${style.dim}[${getTimestamp()}]${style.reset}`;
    
    switch(type) {
        case 'info':
            console.log(`${timestamp} ${style.cyan}ℹ${style.reset} ${message}`);
            break;
        case 'success':
            console.log(`${timestamp} ${style.green}✓${style.reset} ${message}`);
            break;
        case 'error':
            console.log(`${timestamp} ${style.red}✗${style.reset} ${message}`);
            break;
        case 'warn':
            console.log(`${timestamp} ${style.yellow}⚠${style.reset} ${message}`);
            break;
        case 'debug':
            if (DEBUG) {
                console.log(`${timestamp} ${style.magenta}◈${style.reset} ${style.dim}${message}${style.reset}`);
            }
            break;
        case 'email':
            console.log(`${timestamp} ${style.blue}✉${style.reset} ${message}`);
            break;
    }
    
    if (data && DEBUG) {
        console.log(`${style.dim}   └─ ${JSON.stringify(data)}${style.reset}`);
    }
}

function showBanner() {
    console.log(`
${style.cyan}╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ${style.bright}${style.white}███████╗██╗██╗  ██╗██████╗ ███████╗██████╗${style.cyan}          ║
║   ${style.white}██╔════╝██║╚██╗██╔╝██╔══██╗██╔════╝██╔══██╗${style.cyan}         ║
║   ${style.white}█████╗  ██║ ╚███╔╝ ██████╔╝█████╗  ██║  ██║${style.cyan}         ║
║   ${style.white}██╔══╝  ██║ ██╔██╗ ██╔══██╗██╔══╝  ██║  ██║${style.cyan}         ║
║   ${style.white}██║     ██║██╔╝ ██╗██║  ██║███████╗██████╔╝${style.cyan}         ║
║   ${style.white}╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═════╝${style.cyan}          ║
║                                                           ║
║           ${style.yellow}WhatsApp Appeal Bot System${style.cyan}                     ║
║                    ${style.dim}@voidxsh1${style.reset}${style.cyan}                             ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝${style.reset}
`);
}

// ================== BOT SETUP ==================
const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });

const userCooldowns = new Map();
const allUsers = new Map();
const allChats = new Map();

const stats = {
    totalRequests: 0,
    successfulSends: 0,
    failedSends: 0,
    startTime: Date.now()
};

// ===== SISTEM PREMIUM USER =====
const premiumFile = './premium.json';
let premiumUsers = [];

function loadPremium() {
    try {
        if (fs.existsSync(premiumFile)) {
            const raw = fs.readFileSync(premiumFile, 'utf8');
            premiumUsers = raw ? JSON.parse(raw) : [];
            log('debug', `Loaded ${premiumUsers.length} premium users`);
        } else {
            fs.writeFileSync(premiumFile, JSON.stringify([], null, 2));
            premiumUsers = [];
        }
    } catch (e) {
        log('error', `Gagal load premium.json: ${e.message}`);
        premiumUsers = [];
    }
}

function savePremium() {
    try {
        fs.writeFileSync(premiumFile, JSON.stringify(premiumUsers, null, 2));
        log('debug', 'Premium data saved');
    } catch (e) {
        log('error', `Gagal menyimpan premium.json: ${e.message}`);
    }
}

function isPremium(userId) {
    const id = typeof userId === 'number' ? userId : parseInt(userId);
    const user = premiumUsers.find(u => u.id === id);
    if (!user) return false;
    if (Date.now() > user.expired) {
        premiumUsers = premiumUsers.filter(u => u.id !== id);
        savePremium();
        return false;
    }
    return true;
}

function addPremium(userId, days) {
    const id = typeof userId === 'number' ? userId : parseInt(userId);
    const ms = days * 24 * 60 * 60 * 1000;
    const expired = Date.now() + ms;
    const existing = premiumUsers.find(u => u.id === id);
    if (existing) {
        existing.expired = expired;
    } else {
        premiumUsers.push({ id: id, expired: expired });
    }
    savePremium();
    log('info', `Premium added: ${id} for ${days} days`);
    return expired;
}

function removePremium(userId) {
    const id = typeof userId === 'number' ? userId : parseInt(userId);
    const before = premiumUsers.length;
    premiumUsers = premiumUsers.filter(u => u.id !== id);
    if (premiumUsers.length !== before) {
        savePremium();
        log('info', `Premium removed: ${id}`);
    }
}

// Load premium saat startup
loadPremium();

// ================== EMAIL SETUP ==================
let emailTransporter = null;
let emailConfigured = false;

function initializeEmail() {
    log('info', 'Menginisialisasi koneksi email...');
    
    if (!config.EMAIL_CONFIG || !config.EMAIL_CONFIG.auth.user || !config.EMAIL_CONFIG.auth.pass) {
        log('error', 'Email belum dikonfigurasi');
        return false;
    }
    
    log('debug', `Email user: ${config.EMAIL_CONFIG.auth.user}`);
    
    try {
        emailTransporter = nodemailer.createTransport(config.EMAIL_CONFIG);
        emailConfigured = true;
        log('success', 'Email system berhasil diinisialisasi');
        return true;
    } catch (error) {
        log('error', `Gagal inisialisasi email: ${error.message}`);
        emailConfigured = false;
        return false;
    }
}

async function testEmailConfig() {
    if (!emailConfigured) {
        return { success: false, error: 'Email not configured' };
    }

    try {
        const startTime = Date.now();
        await emailTransporter.verify();
        const duration = Date.now() - startTime;
        return { success: true, duration };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function sendAppealEmail(phoneNumber, userId) {
    if (!emailConfigured) {
        log('error', 'Email tidak terkonfigurasi');
        return false;
    }
    
    log('email', `Mengirim banding untuk ${phoneNumber}...`);
    log('debug', `Requested by user: ${userId}`);
    
    const startTime = Date.now();

    try {
        const mailOptions = {
            from: config.EMAIL_CONFIG.auth.user,
            to: config.SUPPORT_EMAIL,
            subject: '',
            text: phoneNumber
        };

        await emailTransporter.sendMail(mailOptions);
        
        const duration = Date.now() - startTime;
        log('success', `Email terkirim dalam ${duration}ms`);
        stats.successfulSends++;
        return true;
    } catch (error) {
        const duration = Date.now() - startTime;
        log('error', `Gagal kirim email setelah ${duration}ms: ${error.message}`);
        stats.failedSends++;
        return false;
    }
}

// ================== UTILITY FUNCTIONS ==================

function isOwner(userId) {
    return userId.toString() === config.OWNER_ID || 
           config.ADDITIONAL_OWNERS.includes(userId.toString());
}

function formatTime(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return { minutes, seconds };
}

function checkCooldown(userId) {
    const userCooldown = userCooldowns.get(userId);
    if (userCooldown && Date.now() < userCooldown) {
        return { 
            onCooldown: true, 
            timeLeft: userCooldown - Date.now() 
        };
    }
    return { onCooldown: false, timeLeft: 0 };
}

function setCooldown(userId) {
    userCooldowns.set(userId, Date.now() + config.COOLDOWN_TIME);
}

function isGroupChat(chatType) {
    return chatType === 'group' || chatType === 'supergroup';
}

function canUseBot(chatType) {
    if (config.MAINTENANCE) return false;
    if (config.GRUP_ONLY && !isGroupChat(chatType)) return false;
    return true;
}

function getUptime() {
    const ms = Date.now() - stats.startTime;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

async function broadcastMessage(message) {
    let sent = 0;
    let failed = 0;
    const total = allChats.size;

    for (const [chatId, chatData] of allChats) {
        try {
            await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
            sent++;
        } catch (error) {
            failed++;
        }
    }

    return { sent, failed, total };
}

// ================== BOT COMMANDS ==================

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.first_name || 'User';
    const chatType = msg.chat.type;

    log('info', `Command /start dari ${msg.from.username || userId}`);

    allUsers.set(userId, {
        name: userName,
        username: msg.from.username || 'N/A',
        firstSeen: new Date()
    });

    allChats.set(chatId, {
        type: chatType,
        title: msg.chat.title || 'Private Chat',
        lastActive: new Date()
    });

    if (config.MAINTENANCE) {
        return bot.sendMessage(chatId, 
            '🔧 <b>BOT SEDANG DALAM MAINTENANCE</b>\n\nMohon maaf, bot sedang dalam perbaikan.',
            { parse_mode: 'HTML' }
        );
    }

    if (config.GRUP_ONLY && !isGroupChat(chatType)) {
        return bot.sendMessage(chatId, 
            '🚫 <b>BOT HANYA BISA DIGUNAKAN DI GRUP</b>',
            { parse_mode: 'HTML' }
        );
    }

    const welcomeText = `
━━━━━━━━━━━━━━━━━━━━
     🔧 <b>FIXRED BOT</b>
━━━━━━━━━━━━━━━━━━━━

Halo, <b>${userName}</b>! 👋

📝 <b>Cara Pakai</b>
<code>/fixred +628123456789</code>

⚠️ <b>Format Nomor</b>
• Awali dengan <code>+62</code>
• Hanya angka, tanpa spasi

📌 <b>Menu</b>
• /fixred — Kirim banding
• /stats — Statistik bot
• /help — Panduan lengkap
• /premium — Cek status${isOwner(userId) ? '\n• /owner — Menu owner' : ''}

🔗 <b>@voidxsh1</b>
    `;

    bot.sendMessage(chatId, welcomeText, {
        parse_mode: 'HTML',
        reply_markup: {
            keyboard: [
                ['� /fixred', '�📊 /stats'],
                ['❓ /help', '⭐ /premium'],
                ...(isOwner(userId) ? [['👑 /owner']] : [])
            ],
            resize_keyboard: true
        }
    });
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    log('info', `Command /help dari ${msg.from.username || msg.from.id}`);

    const helpText = `
━━━━━━━━━━━━━━━━━━━━
     📖 <b>PANDUAN BOT</b>
━━━━━━━━━━━━━━━━━━━━

🔧 <b>Command Utama</b>

<b>/fixred [nomor]</b>
Kirim banding WhatsApp
Ex: <code>/fixred +628123456789</code>

<b>/stats</b> — Statistik bot
<b>/premium</b> — Cek status premium

🔐 <b>Owner Only</b>
• /testemail — Test email
• /addgmail — Ubah Gmail
• /addapp — Ubah App Password

⚙️ <b>Info</b>
• Cooldown: ${config.COOLDOWN_TIME / 1000}s
• Target: ${config.SUPPORT_EMAIL}

🔗 <b>@voidxsh1</b>
    `;

    bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
});

bot.onText(/\/stats/, (msg) => {
    const chatId = msg.chat.id;
    log('info', `Command /stats dari ${msg.from.username || msg.from.id}`);
    
    const successRate = stats.totalRequests > 0 
        ? ((stats.successfulSends / stats.totalRequests) * 100).toFixed(1)
        : '0';

    const statusMessage = `
━━━━━━━━━━━━━━━━━━━━
    📊 <b>STATISTIK BOT</b>
━━━━━━━━━━━━━━━━━━━━

⏱ <b>Uptime:</b> ${getUptime()}

📨 <b>Request</b>
• Total: ${stats.totalRequests}
• Sukses: ${stats.successfulSends}
• Gagal: ${stats.failedSends}
• Rate: ${successRate}%

👥 <b>Users</b>
• Total: ${allUsers.size}
• Chats: ${allChats.size}
• Premium: ${premiumUsers.length}

⚡ <b>Status</b>
• Email: ${emailConfigured ? '🟢 OK' : '🔴 Error'}
• Mode: ${config.GRUP_ONLY ? '🔒 Grup' : '🌐 Public'}
• Bot: ${config.MAINTENANCE ? '🔧 Maint' : '🟢 Aktif'}

🔗 <b>@voidxsh1</b>
    `;

    bot.sendMessage(chatId, statusMessage, { parse_mode: 'HTML' });
});

bot.onText(/\/menu/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const chatType = msg.chat.type;

    if (!canUseBot(chatType)) {
        if (config.MAINTENANCE) {
            return bot.sendMessage(chatId, '🔧 <b>BOT SEDANG MAINTENANCE</b>', { parse_mode: 'HTML' });
        }
        if (config.GRUP_ONLY) {
            return bot.sendMessage(chatId, '🚫 <b>BOT HANYA UNTUK GRUP</b>', { parse_mode: 'HTML' });
        }
    }

    const menuText = `
━━━━━━━━━━━━━━━━━━━━
     🚀 <b>MENU UTAMA</b>
━━━━━━━━━━━━━━━━━━━━

📋 <b>Fitur</b>
• /fixred — Ajukan banding
• /stats — Statistik bot
• /premium — Status premium
• /help — Panduan${isOwner(userId) ? '\n• /owner — Panel owner' : ''}

📱 <b>Status</b>
• Mode: ${config.GRUP_ONLY ? '🔒 Grup Only' : '🌐 Public'}
• Bot: ${config.MAINTENANCE ? '🔧 Maintenance' : '🟢 Aktif'}
• Email: ${emailConfigured ? '🟢 OK' : '🔴 Error'}

📝 <b>Quick Start</b>
<code>/fixred +628xxx</code>

🔗 <b>@voidxsh1</b>
    `;

    bot.sendMessage(chatId, menuText, { parse_mode: 'HTML' });
});

// ================== FIXRED COMMAND ==================

bot.onText(/\/fixred(?:@\w+)?(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.username || msg.from.first_name;
    const chatType = msg.chat.type;
    const phoneNumber = match[1] ? match[1].trim() : null;

    stats.totalRequests++;
    log('info', `Command /fixred dari @${userName} (${userId})`);
    log('debug', `Args: "${phoneNumber}"`);

    // Cek premium/owner
    if (!isPremium(userId) && !isOwner(userId)) {
        log('debug', `User ${userId} bukan premium`);
        return bot.sendMessage(chatId,
            '❌ <b>Akses Ditolak!</b>\n\nFitur ini khusus user premium.\nHubungi owner untuk upgrade.',
            { parse_mode: 'HTML' }
        );
    }

    if (!canUseBot(chatType)) {
        if (config.MAINTENANCE) {
            return bot.sendMessage(chatId, '🔧 <b>BOT SEDANG MAINTENANCE</b>', { parse_mode: 'HTML' });
        }
        if (config.GRUP_ONLY) {
            return bot.sendMessage(chatId, '🚫 <b>BOT HANYA UNTUK GRUP</b>', { parse_mode: 'HTML' });
        }
    }

    // Cek email configuration
    if (!emailConfigured) {
        log('warn', 'Email tidak terkonfigurasi');
        return bot.sendMessage(chatId,
            '❌ <b>EMAIL BELUM DIKONFIGURASI!</b>\n\n' +
            'Owner bot belum mengkonfigurasi email.\n' +
            'Silakan hubungi owner: @voidxsh1',
            { parse_mode: 'HTML' }
        );
    }

    // Cek format nomor
    if (!phoneNumber) {
        return bot.sendMessage(chatId,
`❌ <b>Format salah!</b>

📝 <b>Penggunaan yang benar:</b>
<code>/fixred +628123456789</code>

⚠️ Pastikan nomor dimulai dengan +62`,
            { parse_mode: 'HTML' }
        );
    }

    const phoneRegex = /^\+\d{10,15}$/;
    if (!phoneRegex.test(phoneNumber)) {
        log('debug', `Format nomor tidak valid: ${phoneNumber}`);
        return bot.sendMessage(chatId,
`❌ <b>Format nomor tidak valid!</b>

✅ <b>Contoh yang benar:</b>
<code>/fixred +6281234567890</code>

⚠️ <b>Pastikan:</b>
• Dimulai dengan +
• Hanya berisi angka
• 10-15 digit`,
            { parse_mode: 'HTML' }
        );
    }

    // Cek cooldown (kecuali owner)
    if (!isOwner(userId)) {
        const cooldown = checkCooldown(userId);
        if (cooldown.onCooldown) {
            const time = formatTime(cooldown.timeLeft);
            log('debug', `User ${userId} dalam cooldown`);
            return bot.sendMessage(chatId, 
                `⏰ <b>Cooldown!</b>\n\nTunggu ${time.minutes}m ${time.seconds}s lagi.`, 
                { parse_mode: 'HTML' }
            );
        }
    }

    // Kirim email
    const userMention = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
    const loadingMsg = await bot.sendMessage(chatId, 
        `⏳ ${userMention}, memproses banding untuk <code>${phoneNumber}</code>...`,
        { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
    );

    try {
        const success = await sendAppealEmail(phoneNumber, userId);

        if (success) {
            setCooldown(userId);
            const timeStr = new Date().toLocaleTimeString('id-ID');
            
            bot.editMessageText(
`━━━━━━━━━━━━━━━━━━━━
    ✅ <b>TERKIRIM!</b>
━━━━━━━━━━━━━━━━━━━━

📋 <b>Detail</b>
• User: ${userMention}
• Nomor: <code>${phoneNumber}</code>
• Waktu: ${timeStr}
• Tujuan: WA Support

💡 <i>Tunggu 1-2 menit, cek WA</i>`,
                { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML' }
            );
        } else {
            bot.editMessageText(
`━━━━━━━━━━━━━━━━━━━━
       ❌ <b>GAGAL!</b>
━━━━━━━━━━━━━━━━━━━━

� Nomor: <code>${phoneNumber}</code>

💡 <i>Coba lagi nanti</i>`,
                { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML' }
            );
        }
    } catch (error) {
        log('error', `Error pada fixred: ${error.message}`);
        bot.editMessageText(
`━━━━━━━━━━━━━━━━━━━━
       ❌ <b>ERROR</b>
━━━━━━━━━━━━━━━━━━━━

💡 <i>Kesalahan sistem</i>`,
            { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML' }
        );
    }
});

// ================== PREMIUM COMMANDS ==================

bot.onText(/\/premium$/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (isOwner(userId)) {
        return bot.sendMessage(chatId, '👑 Kamu adalah <b>Owner</b>.', { parse_mode: 'HTML' });
    }

    const id = userId;
    const entry = premiumUsers.find(u => u.id === id);
    if (!entry) {
        return bot.sendMessage(chatId, '🚫 Kamu <b>bukan user premium</b>.', { parse_mode: 'HTML' });
    }

    if (Date.now() > entry.expired) {
        removePremium(id);
        return bot.sendMessage(chatId, '🚫 Status premium kamu sudah <b>kedaluwarsa</b>.', { parse_mode: 'HTML' });
    }

    const remaining = entry.expired - Date.now();
    const daysLeft = Math.ceil(remaining / (1000 * 60 * 60 * 24));
    const expDate = new Date(entry.expired).toLocaleString('id-ID');

    bot.sendMessage(chatId, 
`━━━━━━━━━━━━━━━━━━━━
  ⭐ <b>STATUS PREMIUM</b>
━━━━━━━━━━━━━━━━━━━━

📋 <b>Info</b>
• ID: <code>${userId}</code>
• Expired: ${expDate}
• Sisa: <b>${daysLeft} hari</b>

✅ <i>Status Aktif</i>`,
        { parse_mode: 'HTML' }
    );
});

// ================== OWNER COMMANDS ==================

bot.onText(/\/owner/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) {
        return bot.sendMessage(chatId, '❌ <b>AKSES DITOLAK!</b>', { parse_mode: 'HTML' });
    }

    log('info', `Command /owner dari ${msg.from.username || userId}`);

    const ownerMenu = `
━━━━━━━━━━━━━━━━━━━━
     👑 <b>OWNER PANEL</b>
━━━━━━━━━━━━━━━━━━━━

📧 <b>Email</b>
• /addgmail — Ubah Gmail
• /addapp — Ubah Password
• /testemail — Test koneksi

⭐ <b>Premium</b>
• /addpremium — Tambah user
• /delpremium — Hapus user
• /listpremium — Lihat list

⚙️ <b>Settings</b>
• /grubonly on/off
• /maintanceon
• /maintanceoff
• /broadcast [msg]

📱 <b>Status</b>
• Mode: ${config.GRUP_ONLY ? '🔒 Grup' : '🌐 Public'}
• Bot: ${config.MAINTENANCE ? '🔧 Maint' : '🟢 Normal'}
• Email: ${emailConfigured ? '🟢 OK' : '🔴 Error'}

🔗 <b>@voidxsh1</b>
    `;

    bot.sendMessage(chatId, ownerMenu, {
        parse_mode: 'HTML',
        reply_markup: {
            keyboard: [
                ['📧 /addgmail', '🔑 /addapp'],
                ['🧪 /testemail', '📊 /stats'],
                ['➕ /addpremium', '➖ /delpremium'],
                ['📋 /listpremium', '⚙️ /grubonly on'],
                ['� /maintanceon', '✅ /maintanceoff'],
                ['📢 /broadcast', '🏠 /menu']
            ],
            resize_keyboard: true
        }
    });
});

bot.onText(/\/testemail/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Khusus Owner!');

    log('info', 'Owner menjalankan /testemail');

    if (!emailConfigured) {
        return bot.sendMessage(chatId,
            '❌ <b>EMAIL BELUM DIKONFIGURASI!</b>\n\n' +
            'Gunakan:\n' +
            '<code>/addgmail email_anda@gmail.com</code>\n' +
            '<code>/addapp app_password_anda</code>',
            { parse_mode: 'HTML' }
        );
    }

    const testingMsg = await bot.sendMessage(chatId, '⏳ Testing email connection...');

    const testResult = await testEmailConfig();

    if (testResult.success) {
        log('success', `Email test berhasil dalam ${testResult.duration}ms`);
        bot.editMessageText(
`✅ <b>EMAIL TEST BERHASIL!</b>
━━━━━━━━━━━━━━━━━━━━━
📧 Email: <code>${config.EMAIL_CONFIG.auth.user}</code>
🔒 Service: Gmail
⏱ Response: ${testResult.duration}ms
🟢 Status: Connected`,
            { chat_id: chatId, message_id: testingMsg.message_id, parse_mode: 'HTML' }
        );
    } else {
        log('error', `Email test gagal: ${testResult.error}`);
        bot.editMessageText(
`❌ <b>EMAIL TEST GAGAL!</b>
━━━━━━━━━━━━━━━━
📧 Email: <code>${config.EMAIL_CONFIG.auth.user}</code>
🔴 Error: ${testResult.error}

💡 Cek app password di Google Account`,
            { chat_id: chatId, message_id: testingMsg.message_id, parse_mode: 'HTML' }
        );
    }
});

bot.onText(/\/addgmail(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Khusus Owner!');

    const newEmail = match[1] ? match[1].trim() : null;

    if (!newEmail) {
        return bot.sendMessage(chatId, 
            '❌ <b>Format:</b> <code>/addgmail email@gmail.com</code>', 
            { parse_mode: 'HTML' }
        );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
        return bot.sendMessage(chatId, '❌ Format email salah!', { parse_mode: 'HTML' });
    }

    log('info', `Owner mengubah email ke: ${newEmail}`);

    const success = configManager.updateEmailConfig(newEmail, config.EMAIL_CONFIG.auth.pass);

    if (success) {
        config = configManager.config;
        initializeEmail();

        bot.sendMessage(chatId,
`✅ <b>Email Berhasil Diubah!</b>

📧 Email: <code>${newEmail}</code>
🔄 Status: ${emailConfigured ? '🟢 Connected' : '🔴 Error'}

⚠️ <b>Langkah selanjutnya:</b>
Gunakan /addapp untuk set App Password

Contoh: <code>/addapp xxxx xxxx xxxx xxxx</code>`,
            { parse_mode: 'HTML' }
        );
    } else {
        bot.sendMessage(chatId, '❌ Gagal menyimpan email!', { parse_mode: 'HTML' });
    }
});

bot.onText(/\/addapp(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Khusus Owner!');

    const newPassword = match[1] ? match[1].trim().replace(/\s/g, '') : null;

    if (!newPassword) {
        return bot.sendMessage(chatId, 
            '❌ <b>Format:</b> <code>/addapp apppassword</code>\n\nContoh: <code>/addapp xxxx xxxx xxxx xxxx</code>', 
            { parse_mode: 'HTML' }
        );
    }

    if (newPassword.length < 10) {
        return bot.sendMessage(chatId, '❌ Password terlalu pendek!', { parse_mode: 'HTML' });
    }

    log('info', 'Owner mengubah app password');

    const success = configManager.updateEmailConfig(config.EMAIL_CONFIG.auth.user, newPassword);

    if (success) {
        config = configManager.config;
        initializeEmail();

        const testResult = await testEmailConfig();

        if (testResult.success) {
            bot.sendMessage(chatId,
`✅ <b>App Password Berhasil Diubah!</b>

🔑 Password: <code>${newPassword.substring(0, 4)}****${newPassword.substring(newPassword.length - 4)}</code>
📧 Email: <code>${config.EMAIL_CONFIG.auth.user}</code>
🔄 Status: 🟢 Connected

💡 Gunakan /testemail untuk verifikasi`,
                { parse_mode: 'HTML' }
            );
        } else {
            bot.sendMessage(chatId,
`⚠️ <b>PASSWORD DISIMPAN TAPI TEST GAGAL</b>

Error: ${testResult.error}

Periksa App Password dan 2FA setting di Gmail.`,
                { parse_mode: 'HTML' }
            );
        }
    } else {
        bot.sendMessage(chatId, '❌ Gagal menyimpan password!', { parse_mode: 'HTML' });
    }
});

// ================== PREMIUM MANAGEMENT ==================

bot.onText(/^\/addpremium(?:@\w+)?$/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Akses ditolak!', { parse_mode: 'HTML' });

    bot.sendMessage(chatId, 
`📖 <b>PANDUAN ADDPREMIUM</b>
━━━━━━━━━━━━━━━━━━━

<b>Format:</b> <code>/addpremium &lt;user_id&gt; &lt;hari&gt;</code>

<b>Contoh:</b>
• <code>/addpremium 123456789 30</code> → 30 hari
• <code>/addpremium 123456789 7</code> → 7 hari

💡 <b>Cara dapat User ID:</b>
User bisa kirim /premium lalu lihat ID mereka`,
        { parse_mode: 'HTML' }
    );
});

bot.onText(/\/addpremium(?:@\w+)?\s+(\d+)\s+(\d+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Akses ditolak!', { parse_mode: 'HTML' });

    const targetId = parseInt(match[1]);
    const days = parseInt(match[2]);

    if (isNaN(targetId) || isNaN(days) || days <= 0) {
        return bot.sendMessage(chatId, '❌ Format salah. Gunakan: <code>/addpremium &lt;id&gt; &lt;hari&gt;</code>', { parse_mode: 'HTML' });
    }

    const expired = addPremium(targetId, days);
    const expiredDate = new Date(expired).toLocaleString('id-ID');

    bot.sendMessage(chatId, 
`✅ <b>Premium Ditambahkan!</b>
━━━━━━━━━━━━━━━━━━━━━━━━

👤 User ID: <code>${targetId}</code>
📅 Hari: ${days}
⏰ Expired: ${expiredDate}`,
        { parse_mode: 'HTML' }
    );
});

bot.onText(/^\/delpremium(?:@\w+)?$/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Akses ditolak!', { parse_mode: 'HTML' });

    bot.sendMessage(chatId, 
`📖 <b>PANDUAN DELPREMIUM</b>
━━━━━━━━━━━━━━━━━━━━━━━━

<b>Format:</b> <code>/delpremium &lt;user_id&gt;</code>

<b>Contoh:</b>
• <code>/delpremium 123456789</code>`,
        { parse_mode: 'HTML' }
    );
});

bot.onText(/\/delpremium(?:@\w+)?\s+(\d+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Akses ditolak!', { parse_mode: 'HTML' });

    const targetId = parseInt(match[1]);
    if (isNaN(targetId)) {
        return bot.sendMessage(chatId, '❌ Format salah. Gunakan: <code>/delpremium &lt;id&gt;</code>', { parse_mode: 'HTML' });
    }

    removePremium(targetId);

    bot.sendMessage(chatId, 
`✅ <b>Premium Dihapus!</b>
━━━━━━━━━━━━━━━━━━━━━━━━

👤 User ID: <code>${targetId}</code>`,
        { parse_mode: 'HTML' }
    );
});

bot.onText(/\/listpremium/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Akses ditolak!', { parse_mode: 'HTML' });

    if (premiumUsers.length === 0) {
        return bot.sendMessage(chatId, '📋 Belum ada user premium.');
    }

    let list = '';
    premiumUsers.forEach((user, i) => {
        const expDate = new Date(user.expired).toLocaleDateString('id-ID');
        const isExpired = Date.now() > user.expired;
        list += `${i+1}. <code>${user.id}</code> - ${expDate} ${isExpired ? '❌' : '✅'}\n`;
    });

    bot.sendMessage(chatId, 
`📋 <b>Daftar Premium</b>
━━━━━━━━━━━━━━━━━━━━━━━━

${list}
Total: <b>${premiumUsers.length}</b> users`,
        { parse_mode: 'HTML' }
    );
});

// ================== BOT SETTINGS ==================

bot.onText(/\/grubonly (on|off)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Akses ditolak!');

    const mode = match[1] === 'on';
    const success = configManager.updateConfig({ GRUP_ONLY: mode });

    if (success) {
        config = configManager.config;
        const message = mode ? '🚫 <b>MODE GRUP ONLY AKTIF!</b>' : '🌐 <b>MODE BEBAS AKTIF!</b>';
        log('info', `Grup only mode: ${mode}`);
        bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    }
});

bot.onText(/\/maintance(on|off)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Akses ditolak!');

    const mode = match[1] === 'on';
    const success = configManager.updateConfig({ MAINTENANCE: mode });

    if (success) {
        config = configManager.config;
        const message = mode ? '🔧 <b>MAINTENANCE MODE AKTIF!</b>' : '✅ <b>MAINTENANCE SELESAI!</b>';
        log('info', `Maintenance mode: ${mode}`);
        bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    }
});

bot.onText(/\/broadcast(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isOwner(userId)) return bot.sendMessage(chatId, '❌ Akses ditolak!');

    const message = match[1] ? match[1].trim() : null;

    if (!message) {
        return bot.sendMessage(chatId, '❌ <b>Format:</b> <code>/broadcast pesan</code>', { parse_mode: 'HTML' });
    }

    log('info', `Broadcasting message to ${allChats.size} chats`);
    const result = await broadcastMessage(`📢 <b>BROADCAST</b>\n\n${message}`);
    bot.sendMessage(chatId, `✅ Broadcast: ${result.sent}/${result.total} chats`, { parse_mode: 'HTML' });
});

// ================== ERROR HANDLING ==================
bot.on('error', (error) => log('error', `Bot Error: ${error.message}`));
bot.on('polling_error', (error) => log('error', `Polling Error: ${error.message}`));

// ================== START BOT ==================
showBanner();

log('info', 'Memulai FIXRED BOT...');
log('debug', `Debug mode: ${DEBUG ? 'ENABLED' : 'DISABLED'}`);
log('debug', `Owner ID: ${config.OWNER_ID}`);
log('debug', `Cooldown: ${config.COOLDOWN_TIME}ms`);

initializeEmail();

// Register commands untuk suggestion saat ketik /
bot.setMyCommands([
    { command: 'start', description: '🏠 Menu utama' },
    { command: 'fixred', description: '🔧 Kirim banding WA (+62xxx)' },
    { command: 'menu', description: '📋 Lihat menu' },
    { command: 'stats', description: '📊 Lihat statistik bot' },
    { command: 'help', description: '❓ Panduan penggunaan' },
    { command: 'premium', description: '⭐ Cek status premium' },
    { command: 'addpremium', description: '➕ Tambah premium (Owner)' },
    { command: 'delpremium', description: '➖ Hapus premium (Owner)' },
    { command: 'listpremium', description: '📋 List premium (Owner)' },
    { command: 'owner', description: '👑 Menu owner' },
    { command: 'testemail', description: '🔌 Test email (Owner)' },
    { command: 'addgmail', description: '📧 Ganti email (Owner)' },
    { command: 'addapp', description: '🔑 Ganti password (Owner)' }
]).then(() => {
    log('success', 'Commands berhasil didaftarkan ke Telegram');
}).catch((err) => {
    log('warn', `Gagal daftarkan commands: ${err.message}`);
});

console.log(`
${style.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${style.reset}
  ${style.bright}Bot Status: ONLINE${style.reset}
  📧 Email: ${emailConfigured ? `${style.green}Connected${style.reset}` : `${style.red}Disconnected${style.reset}`}
  👑 Owner: ${config.OWNER_ID}
  ⏱ Started: ${new Date().toLocaleString('id-ID')}
${style.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${style.reset}
`);

log('success', 'Bot berhasil dijalankan!');
