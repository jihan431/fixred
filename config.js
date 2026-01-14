const fs = require('fs');

const CONFIG_FILE = './bot-config.json';

let config = {
    TELEGRAM_BOT_TOKEN: '8452243063:AAFq-FDNoVw9NQhL-zrxaFZDxLx6kBC3Z9A',
    EMAIL_CONFIG: {
        service: 'gmail',
        auth: {
            user: 'jerapahhewan02@gmail.com',
            pass: "ghcnzvseatpvahwi"
        }
    },
    SUPPORT_EMAIL: 'support@support.whatsapp.com',
    OWNER_ID: '6726423168',
    COOLDOWN_TIME: 5000,
    ADDITIONAL_OWNERS: ['7179899967'],
    GRUP_ONLY: false,
    MAINTENANCE: false
};

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            config = { ...config, ...savedConfig };
            console.log('✅ Config loaded from file');
        }
    } catch (error) {
        console.log('❌ Error loading config:', error);
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        console.log('✅ Config saved to file');
        return true;
    } catch (error) {
        console.log('❌ Error saving config:', error);
        return false;
    }
}

function updateConfig(newConfig) {
    config = { ...config, ...newConfig };
    return saveConfig();
}

function updateEmailConfig(email, appPassword) {
    config.EMAIL_CONFIG.auth.user = email;
    config.EMAIL_CONFIG.auth.pass = appPassword;
    return saveConfig();
}

function updateBotToken(newToken) {
    config.TELEGRAM_BOT_TOKEN = newToken;
    return saveConfig();
}

loadConfig();

module.exports = {
    config,
    updateConfig,
    updateEmailConfig,
    updateBotToken,
    saveConfig,
    loadConfig
};