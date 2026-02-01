/**
 * Auto Reply - SillyTavern 自动回复扩展
 * 
 * 功能：在收到 AI 回复后自动发送下一条消息
 */

import { saveSettingsDebounced, substituteParams } from '../../../../script.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../extensions.js';

const extensionName = 'third-party/Auto-Reply';
const extensionFolderPath = `scripts/extensions/${extensionName}`;

// 默认设置
const defaultSettings = {
    mode: 'interval',           // 'interval' | 'cycle'
    intervalTime: 10,           // 间隔模式：收到回复后等待秒数
    cycleTime: 60,              // 周期模式：两次发送最小间隔秒数
    action: 'prompt',           // 'prompt' | 'continue' | 'regenerate' | 'swipe'
    prompt: '*静静地等待着*',    // 提示词
    maxCount: 5,                // 次数上限，0=无限
};

// 运行状态
let isRunning = false;
let sendCount = 0;
let lastSendTime = 0;
let pendingTimeout = null;

/**
 * 加载设置
 */
function loadSettings() {
    if (!extension_settings.autoReply) {
        extension_settings.autoReply = {};
    }

    // 合并默认设置
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (extension_settings.autoReply[key] === undefined) {
            extension_settings.autoReply[key] = value;
        }
    }

    return extension_settings.autoReply;
}

/**
 * 获取设置
 */
function getSettings() {
    return extension_settings.autoReply || defaultSettings;
}

/**
 * 保存设置
 */
function saveSettings() {
    saveSettingsDebounced();
}

/**
 * 从 UI 读取设置
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
 * 将设置应用到 UI
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
 * 更新状态显示
 */
function updateStatusUI() {
    const settings = getSettings();
    const statusBar = $('.auto-reply-status-bar');
    const statusText = $('#auto_reply_status');
    const countText = $('#auto_reply_count');

    if (isRunning) {
        statusBar.removeClass('stopped').addClass('running');
        statusText.text('运行中');
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
        statusText.text('已停止');
        countText.hide();
        $('#auto_reply_start').prop('disabled', false);
        $('#auto_reply_stop').prop('disabled', true);
    }
}

/**
 * 开始自动回复
 */
function start() {
    if (isRunning) return;

    const context = getContext();
    if (!context.characterId && !context.groupId) {
        // @ts-ignore
        toastr.warning('请先选择一个角色或群组', 'Auto Reply');
        return;
    }

    isRunning = true;
    sendCount = 0;
    lastSendTime = 0;

    updateStatusUI();
    // @ts-ignore
    toastr.info('自动回复已开始', 'Auto Reply');
    console.log('[AutoReply] 开始自动回复');

    // 立即发送第一条消息
    send();
}

/**
 * 停止自动回复
 */
function stop() {
    if (!isRunning) return;

    isRunning = false;

    // 清除待执行的发送
    if (pendingTimeout) {
        clearTimeout(pendingTimeout);
        pendingTimeout = null;
    }

    updateStatusUI();
    // @ts-ignore
    toastr.info(`自动回复已停止，共发送 ${sendCount} 条`, 'Auto Reply');
    console.log(`[AutoReply] 停止自动回复，共发送 ${sendCount} 条`);
}

/**
 * 收到消息时的处理
 */
function onMessageReceived() {
    if (!isRunning) return;

    const settings = getSettings();

    // 检查次数上限
    if (settings.maxCount > 0 && sendCount >= settings.maxCount) {
        console.log('[AutoReply] 达到次数上限，自动停止');
        stop();
        return;
    }

    // 根据模式决定发送时机
    if (settings.mode === 'interval') {
        // 间隔模式：等待指定时间后发送
        console.log(`[AutoReply] 间隔模式：${settings.intervalTime} 秒后发送`);
        pendingTimeout = setTimeout(() => {
            if (isRunning) {
                send();
            }
        }, settings.intervalTime * 1000);
    } else {
        // 周期模式：检查距离上次发送的时间
        const elapsed = Date.now() - lastSendTime;
        const remaining = settings.cycleTime * 1000 - elapsed;

        if (remaining <= 0) {
            // 已满足周期条件，立即发送
            send();
        } else {
            // 等待剩余时间后发送
            console.log(`[AutoReply] 周期模式：${Math.ceil(remaining / 1000)} 秒后发送`);
            pendingTimeout = setTimeout(() => {
                if (isRunning) {
                    send();
                }
            }, remaining);
        }
    }
}

/**
 * 执行发送
 */
function send() {
    if (!isRunning) return;

    // 先从 UI 读取最新设置
    readSettingsFromUI();
    const settings = getSettings();

    sendCount++;
    lastSendTime = Date.now();
    updateStatusUI();

    console.log(`[AutoReply] 发送第 ${sendCount} 条，动作: ${settings.action}`);

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
                console.error(`[AutoReply] 未知动作: ${settings.action}`);
        }
    } catch (error) {
        console.error('[AutoReply] 发送时出错:', error);
        // @ts-ignore
        toastr.error('发送出错，自动停止', 'Auto Reply');
        stop();
    }
}

/**
 * 发送提示词
 */
function sendPrompt(prompt) {
    const processedPrompt = substituteParams(prompt);

    // 填入输入框并发送
    $('#send_textarea').val(processedPrompt);
    $('#send_textarea').trigger('input');

    // 模拟点击发送按钮
    setTimeout(() => {
        $('#send_but').trigger('click');
    }, 100);
}

/**
 * 处理生成错误
 */
function onGenerationError() {
    if (isRunning) {
        console.log('[AutoReply] 检测到生成错误，自动停止');
        // @ts-ignore
        toastr.error('检测到错误，自动停止', 'Auto Reply');
        stop();
    }
}

/**
 * 初始化扩展
 */
async function init() {
    console.log('[AutoReply] 初始化中...');

    // 加载设置
    loadSettings();

    // 加载 UI
    try {
        const settingsHtml = await renderExtensionTemplateAsync(extensionName, 'settings');
        const getContainer = () => $(document.getElementById('auto_reply_container') ?? document.getElementById('extensions_settings2'));
        getContainer().append(settingsHtml);
    } catch (error) {
        console.error('[AutoReply] 加载设置面板失败:', error);
        return;
    }

    // 应用设置到 UI
    applySettingsToUI();
    updateStatusUI();

    // 绑定 UI 事件
    $('#auto_reply_start').on('click', start);
    $('#auto_reply_stop').on('click', stop);

    // 设置变更时自动保存
    $('input[name="auto_reply_mode"]').on('change', readSettingsFromUI);
    $('input[name="auto_reply_action"]').on('change', readSettingsFromUI);
    $('#auto_reply_interval_time').on('input', readSettingsFromUI);
    $('#auto_reply_cycle_time').on('input', readSettingsFromUI);
    $('#auto_reply_prompt').on('input', readSettingsFromUI);
    $('#auto_reply_max_count').on('input', readSettingsFromUI);

    // 监听 SillyTavern 事件
    const context = getContext();
    const { eventSource, event_types } = context;

    // 收到消息时
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);

    // 生成错误时
    eventSource.on(event_types.GENERATION_ENDED, (data) => {
        // 检查是否有错误
        if (data && data.error) {
            onGenerationError();
        }
    });

    console.log('[AutoReply] 初始化完成');
}

// 入口
jQuery(async () => {
    const context = getContext();
    context.eventSource.on(context.event_types.APP_READY, init);
});
