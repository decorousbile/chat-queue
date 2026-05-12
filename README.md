<![CDATA[<div align="center">

# ⚡ Perplexity Chat Queue

**A powerful Chrome extension to queue and auto-send multiple prompts on [Perplexity AI](https://www.perplexity.ai)**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://www.perplexity.ai)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-22c55e?style=for-the-badge)](https://developer.chrome.com/docs/extensions/mv3/)
[![License: MIT](https://img.shields.io/badge/License-MIT-a5b4fc?style=for-the-badge)](LICENSE)

<br/>

<img src="https://img.shields.io/badge/Built_with-JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black" />
<img src="https://img.shields.io/badge/Platform-Perplexity_AI-6366f1?style=flat-square" />

---

*Stop waiting. Queue your prompts. Let them send automatically.*

</div>

<br/>

## 🎯 What is Chat Queue?

**Chat Queue** is a sleek Chrome extension that lets you queue up multiple prompts and send them one-by-one on Perplexity AI — fully automated. No more copy-pasting, no more waiting around for each response to finish.

Whether you're doing deep research, SEO keyword analysis, or bulk content generation — just load your prompts, hit **Start**, and walk away.

<br/>

## ✨ Features

### Core
| Feature | Description |
|---|---|
| 🚀 **Auto Queue Processing** | Queue unlimited prompts and auto-send them sequentially |
| ⏯️ **Start / Pause / Resume / Stop** | Full control over queue execution at any time |
| ⏱️ **Configurable Delay** | Set custom delay (1–60 seconds) between messages |
| 🔔 **Desktop Notifications** | Get notified when your entire queue finishes |

### Input
| Feature | Description |
|---|---|
| 📝 **Unified Textarea** | Single textarea for all input — no clutter |
| ☑️ **Single Prompt Toggle** | Check "This is a single prompt" to treat all text as one prompt, or leave unchecked for bulk mode (one prompt per line) |
| ↩️ **Inline Newlines** | Use `\\n` to insert newlines within a single prompt |

### Queue Management
| Feature | Description |
|---|---|
| 🔀 **Drag & Drop Reorder** | Drag items to rearrange your queue order |
| 📋 **Duplicate Prompt** | One-click duplicate any queue item |
| ❌ **Remove Items** | Remove individual prompts from the queue |

### Presets & Organization
| Feature | Description |
|---|---|
| 💾 **Save Presets** | Save your current queue as a named preset |
| 📁 **Folder Organization** | Organize presets into folders (create, rename, delete) |
| 🔍 **Search Presets** | Instantly search through saved presets |
| 📥 **Load Presets** | Load a preset — choose to **append** to or **replace** the current queue |
| 📤 **Export / Import JSON** | Export all presets to a JSON file, import & merge from file |

### UI
| Feature | Description |
|---|---|
| 🖥️ **Popup Interface** | Full-featured popup with all controls and preset management |
| 🪟 **Floating Panel** | Draggable in-page panel on Perplexity with live queue status |
| 🎨 **Dark Theme** | Premium dark glassmorphism design that matches Perplexity's aesthetic |
| 📌 **Collapsible Panel** | Minimize the floating panel when not needed |

<br/>

## 📦 Installation

### From Source (Developer Mode)

1. **Clone or download** this repository:
   ```bash
   git clone https://github.com/decorousbile/perplexity-chat-queue.git
   ```

2. Open **Chrome** and go to `chrome://extensions`

3. Enable **Developer mode** (toggle in top-right corner)

4. Click **"Load unpacked"** and select the project folder

5. Open [Perplexity AI](https://www.perplexity.ai) — you'll see the floating Chat Queue panel appear!

<br/>

## 🚀 Usage

### Quick Start

1. **Click the extension icon** to open the popup, or use the **floating panel** on Perplexity
2. **Type your prompts** in the textarea:
   - **Bulk mode** (default): each line = one separate prompt
   - **Single mode**: check ☑️ *"This is a single prompt"* to send everything as one prompt
3. Click **Add** (or press `Ctrl+Enter`)
4. Hit **▶ Start** — sit back and watch the magic!

### Saving & Loading Presets

1. Build your queue → click **💾 Save** → name it and pick a folder
2. Later, click any saved preset → choose **Append** or **Replace**
3. Use **Export** to back up all presets as JSON, **Import** to restore

### Tips

- Use `\\n` in bulk mode to include newlines inside a single prompt
- Drag the ⠿ handle to reorder queue items
- Hover over a queue item to see **Duplicate** and **Remove** buttons
- The floating panel is **draggable** — position it anywhere on the page
- Adjust the **Delay** between messages (default: 3 seconds)

<br/>

## 🗂️ Project Structure

```
chat-queue/
├── manifest.json       # Chrome Extension manifest (MV3)
├── background.js       # Service worker for desktop notifications
├── content.js          # Content script — floating panel & queue engine
├── content.css         # Floating panel styles
├── popup.html          # Extension popup UI
├── popup.js            # Popup logic — presets, controls, drag-reorder
├── popup.css           # Popup styles
├── icons/              # Extension icons (16, 48, 128px)
└── README.md           # You are here
```

<br/>

## 🛡️ Permissions

| Permission | Why |
|---|---|
| `activeTab` | Access the active Perplexity tab to inject messages |
| `storage` | Save presets and settings locally |
| `notifications` | Desktop notification when queue completes |

**No data is collected. No external servers. Everything stays on your machine.**

<br/>

## 🤝 Contributing

Contributions are welcome! Feel free to:

- 🐛 Report bugs via [Issues](https://github.com/decorousbile/perplexity-chat-queue/issues)
- 💡 Suggest features
- 🔧 Submit pull requests

<br/>

## ☕ Support This Project

If Chat Queue saves you time and makes your workflow easier, consider buying me a coffee! Every contribution — no matter how small — helps keep this project alive and growing.

<div align="center">

### 💛 Donate via PayPal

<a href="https://www.paypal.com/paypalme/maiphuongtun">
  <img src="https://img.shields.io/badge/PayPal-Donate_from_$1-00457C?style=for-the-badge&logo=paypal&logoColor=white" alt="Donate with PayPal" />
</a>

**PayPal:** [maiphuongtun@gmail.com](https://paypal.me/maiphuongtun)

*Donations start from just **$1** — every bit counts! 🙏*

</div>

<br/>

## 📄 License

This project is licensed under the [MIT License](LICENSE) — free to use, modify, and distribute.

---

<div align="center">

Made with ❤️ for the Perplexity AI community

**⭐ Star this repo if you find it useful!**

</div>
]]>
