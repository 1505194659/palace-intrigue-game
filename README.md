# 后宫风云 · 双人联机宫斗游戏

一个 HTML5 双人联机的宫斗回合制小游戏。手机浏览器即可游玩，无需安装。

- **前端**：单页 HTML + 原生 CSS/JS（古风 UI，emoji 立绘）
- **后端**：Node.js + Express + Socket.IO
- **联机**：5 位房间号匹配，房主创建后把房号发给朋友即可
- **玩法**：每月双方暗中选择动作，同步揭晓结算；十月内综合分高者胜，先成皇后立刻获胜

---

## 玩法速览

每月可在 8 项动作中选 1 项：

| 图标 | 动作 | 效果 |
|---|---|---|
| 🌹 | 侍寝 | 消耗 25 体力，依美貌+才艺获得圣宠 |
| 📚 | 习才艺 | +才艺 |
| 💄 | 修容貌 | +美貌 |
| 🌐 | 结党羽 | +势力（双方同选互相牵制） |
| 🗡️ | 设陷害 | 心计对决，得手则削对手圣宠，可能令其禁足 |
| 🛡️ | 自保身 | 恢复体力，免疫本月陷害，+心计 |
| 👶 | 求子嗣 | 圣宠≥50 时尝试受孕（3 月待产） |
| 👑 | 争晋位 | 满足圣宠/势力门槛即可晋升一级位分 |

**位分**：答应 → 常在 → 贵人 → 嫔 → 妃 → 贵妃 → 皇贵妃 → 皇后

**胜负**：先晋为皇后立胜；否则 10 月后比较综合分 = `位分×100 + 圣宠 + 势力 + 子嗣×50`。

---

## 本地试跑（Windows / Mac / Linux 通用）

需要 Node.js 16+。

```bash
cd palace-intrigue-game
npm install
npm start
```

然后打开浏览器访问 `http://localhost:3000`。

想两人测试，再开一个浏览器窗口（或手机连同一 WiFi 访问 `http://你电脑的局域网IP:3000`）即可。

---

## 部署到宝塔面板（Linux 服务器）

> 假设服务器已安装宝塔，且您能登录面板。

### 1. 装 Node.js 环境

宝塔面板 → **软件商店** → 搜索 **Node.js 版本管理器** → 安装 → 安装 Node 18 或更高版本。

### 2. 上传代码

把整个 `palace-intrigue-game` 文件夹上传到 `/www/wwwroot/palace-intrigue-game`。

可以用宝塔的"文件"上传整个文件夹，或在服务器 SSH：

```bash
cd /www/wwwroot
# 把代码 zip 包上传后解压
unzip palace-intrigue-game.zip
cd palace-intrigue-game
npm install --production
```

### 3. 用 PM2 守护进程（推荐）

宝塔的 Node.js 项目管理器一般已自带 PM2。在 SSH 里：

```bash
cd /www/wwwroot/palace-intrigue-game
pm2 start server.js --name palace-game
pm2 save
pm2 startup    # 设置开机自启（按提示执行）
```

### 4. 防火墙放行端口

宝塔 → **安全** → 添加端口 `3000`（TCP）。
云厂商安全组（阿里云/腾讯云控制台）也要放行 3000。

此时直接访问 `http://你的服务器IP:3000` 就能玩了。

### 5.（可选）绑定域名 + HTTPS

如果有域名，建议反向代理到 80/443，这样地址好记、还能上 HTTPS（PWA/iOS 浏览器更友好）：

宝塔 → **网站** → 添加站点（输入您的域名，PHP 选纯静态）→ 进入站点设置 → **反向代理**：

- 代理名称：`palace`
- 目标 URL：`http://127.0.0.1:3000`
- 发送域名：`$host`

保存后即可通过域名访问。

> ⚠️ **重要**：Socket.IO 需要 WebSocket 支持。宝塔默认配置基本可用，但如果遇到连接失败，编辑反向代理的 Nginx 配置，确保有这几行：
>
> ```nginx
> proxy_http_version 1.1;
> proxy_set_header Upgrade $http_upgrade;
> proxy_set_header Connection "upgrade";
> proxy_set_header Host $host;
> proxy_set_header X-Real-IP $remote_addr;
> ```

随后在宝塔申请 Let's Encrypt 免费 SSL 证书（站点设置 → SSL → Let's Encrypt → 申请），开启强制 HTTPS。

---

## 把网页"装"到安卓手机首屏

这个游戏没打包成 APK，但安卓 Chrome 支持把网页加到桌面：

1. 安卓 Chrome 打开您的游戏地址
2. 右上角菜单 → **添加到主屏幕**
3. 桌面上就会出现一个图标，点开像 App 一样

如果以后您想要真正的 APK，告诉我一声，我可以再用 Capacitor 把这个项目打包成 Android 安装包。

---

## 安全提示

- **不要把宝塔安全入口（带随机字符的那段 URL）公开！** 那是面板登录路径。
- 发现泄露立刻：面板设置 → 修改安全入口 + 改密码。
- 这个游戏服务**不需要**任何敏感权限，部署完和宝塔面板是隔离的。

---

## 文件结构

```
palace-intrigue-game/
├── package.json        # 依赖声明
├── server.js           # 后端：房间匹配 + 回合结算（权威）
├── public/
│   └── index.html      # 前端单文件（HTML+CSS+JS+ Socket.IO）
└── README.md           # 本文档
```

服务端是游戏的"权威"，所有数值变化都在 `server.js::resolveTurn` 与 `applyAction` 里计算，前端只负责呈现，因此无法通过改前端作弊。

## License

MIT
