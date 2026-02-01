# Auto Reply

**[中文](#chinese) | [English](#english)**

<a name="chinese"></a>

# Auto Reply - SillyTavern 自动回复扩展

在收到 AI 回复后自动发送下一条消息。

## 功能特性

- **间隔模式**：收到 AI 回复后等待指定秒数自动发送
- **周期模式**：两次发送之间保持最小间隔时间
- **多种触发动作**：
  - 发送自定义提示词
  - 使用"继续"功能
  - 使用"重新生成"功能
  - 使用"滑动"功能
- **次数限制**：可设置发送次数上限（0 表示无限）
- **错误停止**：检测到生成错误时自动停止

## 安装方法

1. 进入 SillyTavern 扩展管理页面
2. 点击"Install extension"
3. 输入本仓库地址并安装

或者手动安装：

1. 将此文件夹放入 `SillyTavern/public/scripts/extensions/third-party/` 目录
2. 重启 SillyTavern

## 使用说明

1. 在扩展设置面板中找到 **Auto Reply**
2. 选择发送模式（间隔/周期）并设置时间
3. 选择触发动作（提示词/继续/重新生成/滑动）
4. 设置次数上限（可选）
5. 点击"开始"按钮启动自动回复

## 配置说明

| 选项 | 说明 | 默认值 |
|-----|------|-------|
| 间隔时间 | 间隔模式下收到回复后等待的秒数 | 10 秒 |
| 周期时间 | 周期模式下两次发送的最小间隔 | 60 秒 |
| 提示词 | 发送提示词动作使用的文本内容 | `*静静地等待着*` |
| 次数上限 | 最多发送次数，0 表示无限 | 5 次 |

---

<a name="english"></a>

# Auto Reply - SillyTavern Extension

Automatically sends messages after receiving AI responses.

## Features

- **Interval Mode**: Wait specific seconds after receiving a reply before sending
- **Cycle Mode**: Maintain a minimum interval between sends
- **Multiple Trigger Actions**:
  - Send custom prompt
  - Use "Continue"
  - Use "Regenerate"
  - Use "Swipe"
- **Limit Count**: Set a limit on the number of sends (0 for unlimited)
- **Error Stop**: Automatically stops when a generation error is detected

## Installation

1. Go to SillyTavern Extensions menu
2. Click "Install extension"
3. Enter this repository URL and install

Or manual installation:

1. Place this folder into `SillyTavern/public/scripts/extensions/third-party/` directory
2. Restart SillyTavern

## Usage

1. Find **Auto Reply** in the extensions settings panel
2. Select send mode (Interval/Cycle) and set time
3. Select trigger action (Prompt/Continue/Regenerate/Swipe)
4. Set limit count (optional)
5. Click "Start" button to begin auto-replying

## Configuration

| Option | Description | Default |
|--------|-------------|---------|
| Interval Time | Seconds to wait after reply in Interval Mode | 10s |
| Cycle Time | Minimum interval between sends in Cycle Mode | 60s |
| Prompt | Text sent when using "Send Prompt" action | `*Waiting silently*` |
| Max Count | Maximum number of sends (0 = unlimited) | 5 |

## License

MIT License
