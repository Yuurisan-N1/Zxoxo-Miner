<div align="center">

<img width="100%" alt="header" src="https://capsule-render.vercel.app/api?type=waving&height=210&text=Zxoxo%20Miner%20Bot&fontAlign=50&fontAlignY=36&fontSize=56&desc=Proof-of-Work%20Mining%20%7C%20Auto%20Claim%20%7C%20Multi-Account&descAlign=50&descAlignY=58"/>

<img alt="typing" src="https://readme-typing-svg.demolab.com?font=Inter&size=18&duration=3000&pause=650&center=true&vCenter=true&width=900&lines=Session+Cookie+Login;SHA-256+Proof-of-Work+via+Worker+Threads;Captcha+Handler+%7C+Auto+Claim;Multi-Account+%7C+Proxy+Support"/>

<p>
  <img alt="node" src="https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs&logoColor=white"/>
  <img alt="platform" src="https://img.shields.io/badge/Platform-Zxoxo-111111"/>
  <img alt="multi-account" src="https://img.shields.io/badge/Multi--Account-Supported-111111"/>
  <img alt="proxy" src="https://img.shields.io/badge/Proxy-Supported-111111"/>
  <img alt="author" src="https://img.shields.io/badge/by-Yuurisandesu-111111"/>
</p>

<p>
  <b>Zxoxo Miner Bot</b> is a multi-account proof-of-work mining bot for Zxoxo.<br/>
  It reads session cookies from <code>data.txt</code>, fetches a SHA-256 mining job from the server, solves the nonce using parallel worker threads, submits the proof, handles captcha checks when the server requests them, claims the mined balance at the end of each run, and sleeps until the next cycle, all across multiple accounts with proxy support.<br/>
  Built and distributed by <b>Yuurisandesu</b>.
</p>

</div>

---

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Getting the Session Cookie](#getting-the-session-cookie)
- [Running the Bot](#running-the-bot)
- [Features](#features)
- [File Structure](#file-structure)
- [Disclaimer](#disclaimer)

---

## Requirements

- Node.js 18 or later
- npm
- Git

---

## Installation

### Install Node.js

**Windows:**

1. Download the LTS installer from https://nodejs.org and run it
2. Keep all default options, including the option to add Node.js to PATH
3. Open Command Prompt and verify:

```cmd
node --version
npm --version
```

**Linux (Ubuntu / Debian):**

```bash
sudo apt-get update
sudo apt-get install -y nodejs npm
node --version
```

**macOS:**

```bash
brew install node
node --version
```

> If you do not have Homebrew, install it first from https://brew.sh

**Termux (Android):**

```bash
pkg update && pkg upgrade -y
pkg install nodejs git -y
node --version
```

---

### Clone and Install

**Clone the repository:**

```bash
git clone https://github.com/Yuurisan-N1/Zxoxo-Miner.git
cd Zxoxo-Miner
```

**Install dependencies:**

```bash
npm install
```

---

## Configuration

### 1. Session Cookies (data.txt)

Fill `data.txt` with one session cookie per line. Blank lines and lines starting with `#` are ignored:

```
sessionid=abc123...
sessionid=def456...
```

### 2. Proxy (proxy.txt)

Fill `proxy.txt` with proxies, one per line (optional, leave empty to connect directly):

```
host:port
host:port:user:pass
http://user:pass@host:port
```

Proxies are paired to accounts by index in round-robin order. Proxy credentials are masked in the log.

### 3. Bot Settings (config.json)

`sleep_seconds` controls how many seconds the bot waits between cycles. The value is clamped between 120 and 86400 seconds. The default is 3600 (one hour).

```json
{
  "settings": {
    "sleep_seconds": 3600
  }
}
```

---

## Getting the Session Cookie

1. Open https://zxoxo.xyz in a browser and sign in to your account.
2. Open DevTools with F12 and go to the **Application** tab.
3. Under **Storage**, open **Cookies** and select `https://zxoxo.xyz`.
4. Find the session cookie and copy its full value.
5. Paste it as a line in `data.txt`.

The session cookie expires after a while. If the bot logs `Account on line N holds an invalid session cookie and was skipped`, refresh the cookie from the browser.

---

## Running the Bot

**Linux / macOS:**

```bash
node bot.js
```

**Windows:**

```cmd
node bot.js
```

**Termux (Android):**

```bash
node bot.js
```

You can also use:

```bash
npm start
```

Press `Ctrl+C` once to stop the bot cleanly.

**Run in background with screen (Linux / macOS / Termux):**

```bash
screen -S zxoxo
node bot.js
```

Detach with `Ctrl+A` then `D`. Reattach anytime:

```bash
screen -r zxoxo
```

---

## Features

### Proof-of-Work Mining
The bot fetches a SHA-256 mining job from the server for each account. The job includes a work string and a difficulty target expressed as a required leading zero bit count. Worker threads run in parallel, each searching for a nonce whose hash meets the target. The number of workers scales with the CPU core count. The hash rate is logged when a nonce is found.

### Auto Claim
After the mining window closes, the bot sends a claim request to credit the mined balance to the account. If nothing has accumulated yet, the step is skipped with a note. If the account has not linked a wallet, the claim is skipped and a note is logged.

### Captcha Handler
When the server requests a human check, the bot saves the captcha image to a file named `captcha-N.png` in the project folder and prompts for the answer in the terminal. After the answer is submitted the mining cycle continues. If the check is rejected, the cycle stops for that account.

### Account State Report
At the start of each cycle the bot reads the account state and logs the current mZXO balance and the number of active rigs on the network.

### Multi Account
All accounts in `data.txt` are processed sequentially within every cycle. Each account runs its own mining window and uses its own worker thread and proxy. Accounts with an expired cookie or those under review are skipped automatically.

### Proxy Support
Proxies are loaded from `proxy.txt` and assigned to accounts by position in round-robin order. HTTP proxies are supported via a CONNECT tunnel. Running without proxies is fully supported.

### Auto Countdown
After all accounts complete a cycle, the bot shows a live `HH:MM:SS` countdown until the next cycle starts.

---

## File Structure

```text
Zxoxo-Miner/
├── utils/
│   └── banner.js                        # Banner and terminal title via yuurisan
├── bot.js                               # Main bot, PoW mining loop and claim
├── config.json                          # Sleep duration between cycles
├── data.txt                             # Session cookies, one per line
├── proxy.txt                            # Proxy list (optional)
├── package.json                         # Node.js project manifest and dependencies
├── LICENSE                              # License file
└── README.md                            # This file
```

---

## Disclaimer

This tool is built for educational and technical exploration purposes. Use it wisely and at your own responsibility.

---

<div align="center">
<img width="100%" alt="footer" src="https://capsule-render.vercel.app/api?type=waving&height=120&section=footer"/>
</div>