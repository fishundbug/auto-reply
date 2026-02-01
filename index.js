/**
 * Auto Reply - SillyTavern Auto Reply Extension
 * 
 * Automatically sends messages after receiving AI responses
 */

import { saveSettingsDebounced, substituteParams } from '../../../../script.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../extensions.js';

const extensionName = 'third-party/auto-reply';
const extensionFolderPath = `scripts/extensions/${extensionName}`;

// i18n functions (will be loaded dynamically)
let i18nFunctions = {
    addLocaleData: null,
    getCurrentLocale: () => navigator.language || 'en',
    translate: (text, _key) => text,
};

// Default settings
const defaultSettings = {
    mode: 'interval',
    intervalTime: 10,
    cycleTime: 60,
    action: 'prompt',
    prompt: '*Waiting silently*',
    maxCount: 5,
};

// Locale data cache
let localeData = {};

// Runtime state
let isRunning = false;
let sendCount = 0;
let lastSendTime = 0;
let pendingTimeout = null;

/**
 * Try to load i18n module
 */
async function loadI18nModule() {
    try {
        const i18n = await import('../../../i18n.js');
        if (i18n.addLocaleData) i18nFunctions.addLocaleData = i18n.addLocaleData;
        if (i18n.getCurrentLocale) i18nFunctions.getCurrentLocale = i18n.getCurrentLocale;
        if (i18n.translate) i18nFunctions.translate = i18n.translate;
        console.log('[AutoReply] i18n module loaded');
        return true;
    } catch (error) {
        console.log('[AutoReply] i18n module not available, using fallback');
        return false;
    }
}

/**
 * Load locale data for the extension
 */
async function loadLocaleData() {
    const locale = i18nFunctions.getCurrentLocale();
    const localeFile = locale.startsWith('zh') ? 'zh-cn' : 'en';

    try {
        const response = await fetch(`/${extensionFolderPath}/locales/${localeFile}.json`);
        if (response.ok) {
            localeData = await response.json();
            // Try to add to SillyTavern's locale system
            if (i18nFunctions.addLocaleData) {
                i18nFunctions.addLocaleData(locale, localeData);
            }
            console.log(`[AutoReply] Loaded locale: ${localeFile}`);
        }
    } catch (error) {
        console.warn('[AutoReply] Failed to load locale data:', error);
    }
}

/**
 * Helper function for translation with fallback
 * @param {string} key Translation key
 * @param {string} fallback Fallback text
 * @param {...any} args Arguments for placeholder replacement
 * @returns {string} Translated text
 */
function t(key, fallback, ...args) {
    // Try local cache first, then i18n module
    let text = localeData[key] || i18nFunctions.translate(fallback, key) || fallback;
    // Replace ${0}, ${1}, etc. with args
    args.forEach((arg, i) => {
        text = text.replace(`\${${i}}`, String(arg));
    });
    return text;
}

/**
 * Load settings
 */
function loadSettings() {
    if (!extension_settings.autoReply) {
        extension_settings.autoReply = {};
    }

    for (const [key, value] of Object.entries(defaultSettings)) {
        if (extension_settings.autoReply[key] === undefined) {
            extension_settings.autoReply[key] = value;
        }
    }

    return extension_settings.autoReply;
}

/**
 * Get settings
 */
function getSettings() {
    return extension_settings.autoReply || defaultSettings;
}

/**
 * Save settings
 */
function saveSettings() {
    saveSettingsDebounced();
}

/**
 * Read settings from UI
 */
function readSettingsFromUI() {
    const settings = getSettings();

    settings.mode = String($('input[name="auto_reply_mode"]:checked').val() || 'interval');
    settings.intervalTime = parseInt(String($('#auto_reply_interval_time').val())) || 10;
    settings.cycleTime = parseInt(String($('#auto_reply_cycle_time').val())) || 60;
    settings.action = String($('input[name="auto_reply_action"]:checked').val() || 'prompt');
    settings.prompt = String($('#auto_reply_prompt').val() || '');
    settings.maxCount = parseInt(String($('#auto_reply_max_count').val())) || 0;

    saveSettings();
}

/**
 * Apply settings to UI
 */
function applySettingsToUI() {
    const settings = getSettings();

    $(`input[name="auto_reply_mode"][value="${settings.mode}"]`).prop('checked', true);
    $('#auto_reply_interval_time').val(settings.intervalTime);
    $('#auto_reply_cycle_time').val(settings.cycleTime);
    $(`input[name="auto_reply_action"][value="${settings.action}"]`).prop('checked', true);
    $('#auto_reply_prompt').val(settings.prompt);
    $('#auto_reply_max_count').val(settings.maxCount);
}

/**
 * Update status UI
 */
function updateStatusUI() {
    const settings = getSettings();
    const statusBar = $('.auto-reply-status-bar');
    const statusText = $('#auto_reply_status');
    const countText = $('#auto_reply_count');

    if (isRunning) {
        statusBar.removeClass('stopped').addClass('running');
        statusText.text(t('auto_reply_running', 'Running'));
        countText.show();
        if (settings.maxCount > 0) {
            countText.text(`(${sendCount}/${settings.maxCount})`);
        } else {
            countText.text(`(${sendCount})`);
        }
        $('#auto_reply_start').prop('disabled', true);
        $('#auto_reply_stop').prop('disabled', false);
    } else {
        statusBar.removeClass('running').addClass('stopped');
        statusText.text(t('auto_reply_stopped', 'Stopped'));
        countText.hide();
        $('#auto_reply_start').prop('disabled', false);
        $('#auto_reply_stop').prop('disabled', true);
    }
}

/**
 * Start auto reply
 */
function start() {
    if (isRunning) return;

    const context = getContext();
    if (!context.characterId && !context.groupId) {
        // @ts-ignore
        toastr.warning(t('auto_reply_no_character', 'Please select a character or group first'), 'Auto Reply');
        return;
    }

    isRunning = true;
    sendCount = 0;
    lastSendTime = 0;

    updateStatusUI();
    // @ts-ignore
    toastr.info(t('auto_reply_started_toast', 'Auto Reply started'), 'Auto Reply');
    console.log('[AutoReply] Started');

    // Send first message immediately
    send();
}

/**
 * Stop auto reply
 */
function stop() {
    if (!isRunning) return;

    isRunning = false;

    if (pendingTimeout) {
        clearTimeout(pendingTimeout);
        pendingTimeout = null;
    }

    updateStatusUI();
    // @ts-ignore
    toastr.info(t('auto_reply_stopped_toast', 'Auto Reply stopped, sent ${0} messages', sendCount), 'Auto Reply');
    console.log(`[AutoReply] Stopped, sent ${sendCount} messages`);
}

/**
 * Handle message received
 */
function onMessageReceived() {
    if (!isRunning) return;

    const settings = getSettings();

    if (settings.maxCount > 0 && sendCount >= settings.maxCount) {
        console.log('[AutoReply] Max count reached, stopping');
        stop();
        return;
    }

    if (settings.mode === 'interval') {
        console.log(`[AutoReply] Interval mode: sending in ${settings.intervalTime} seconds`);
        pendingTimeout = setTimeout(() => {
            if (isRunning) {
                send();
            }
        }, settings.intervalTime * 1000);
    } else {
        const elapsed = Date.now() - lastSendTime;
        const remaining = settings.cycleTime * 1000 - elapsed;

        if (remaining <= 0) {
            send();
        } else {
            console.log(`[AutoReply] Cycle mode: sending in ${Math.ceil(remaining / 1000)} seconds`);
            pendingTimeout = setTimeout(() => {
                if (isRunning) {
                    send();
                }
            }, remaining);
        }
    }
}

/**
 * Send message
 */
function send() {
    if (!isRunning) return;

    readSettingsFromUI();
    const settings = getSettings();

    sendCount++;
    lastSendTime = Date.now();
    updateStatusUI();

    console.log(`[AutoReply] Sending #${sendCount}, action: ${settings.action}`);

    try {
        switch (settings.action) {
            case 'prompt':
                sendPrompt(settings.prompt);
                break;
            case 'continue':
                $('#option_continue').trigger('click');
                break;
            case 'regenerate':
                $('#option_regenerate').trigger('click');
                break;
            case 'swipe':
                $('.last_mes .swipe_right').click();
                break;
            default:
                console.error(`[AutoReply] Unknown action: ${settings.action}`);
        }
    } catch (error) {
        console.error('[AutoReply] Send error:', error);
        // @ts-ignore
        toastr.error(t('auto_reply_send_error', 'Send error, stopped'), 'Auto Reply');
        stop();
    }
}

/**
 * Send prompt
 */
function sendPrompt(prompt) {
    const processedPrompt = substituteParams(prompt);

    $('#send_textarea').val(processedPrompt);
    $('#send_textarea').trigger('input');

    setTimeout(() => {
        $('#send_but').trigger('click');
    }, 100);
}

/**
 * Handle generation error
 */
function onGenerationError() {
    if (isRunning) {
        console.log('[AutoReply] Generation error detected, stopping');
        // @ts-ignore
        toastr.error(t('auto_reply_error_stopped', 'Error detected, stopped'), 'Auto Reply');
        stop();
    }
}

/**
 * Initialize extension
 */
async function init() {
    console.log('[AutoReply] Initializing...');

    // Try to load i18n module
    await loadI18nModule();

    // Load locale data
    await loadLocaleData();

    // Load settings
    loadSettings();

    // Load UI
    try {
        const settingsHtml = await renderExtensionTemplateAsync(extensionName, 'settings');
        const getContainer = () => $(document.getElementById('auto_reply_container') ?? document.getElementById('extensions_settings2'));
        getContainer().append(settingsHtml);
    } catch (error) {
        console.error('[AutoReply] Failed to load settings panel:', error);
        return;
    }

    // Apply settings to UI
    applySettingsToUI();
    updateStatusUI();

    // Bind UI events
    $('#auto_reply_start').on('click', start);
    $('#auto_reply_stop').on('click', stop);

    // Auto-save on setting change
    $('input[name="auto_reply_mode"]').on('change', readSettingsFromUI);
    $('input[name="auto_reply_action"]').on('change', readSettingsFromUI);
    $('#auto_reply_interval_time').on('input', readSettingsFromUI);
    $('#auto_reply_cycle_time').on('input', readSettingsFromUI);
    $('#auto_reply_prompt').on('input', readSettingsFromUI);
    $('#auto_reply_max_count').on('input', readSettingsFromUI);

    // Listen to SillyTavern events
    const context = getContext();
    const { eventSource, event_types } = context;

    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);

    eventSource.on(event_types.GENERATION_ENDED, (data) => {
        if (data && data.error) {
            onGenerationError();
        }
    });

    console.log('[AutoReply] Initialized');
}

// Entry point
jQuery(async () => {
    const context = getContext();
    context.eventSource.on(context.event_types.APP_READY, init);
});
