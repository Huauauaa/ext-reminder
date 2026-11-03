# HTTP Request Sender

一个轻量的 Chrome 扩展（Manifest V3），用于在弹窗里快速构造并发送 HTTP 请求，功能类似迷你版 Postman：填写 **URL / Method / Headers / Body**，点 **Send** 即可查看状态码、耗时与响应内容。

适合调试本地接口、验证某个 API 返回、临时改一个 header 试效果，不用为了一个请求去开 Postman 或写 curl。

---

## 功能特性

| 功能 | 说明 |
| --- | --- |
| 请求方法 | GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS |
| URL 输入 | 支持任意 http/https 地址 |
| **cURL 导入** | 粘贴 curl 命令一键回填 URL / Method / Headers / Body，无法识别的参数以提示列出 |
| 自定义 Headers | 点「+ 添加」可动态增删任意多行 key/value |
| 请求体 Body | 多行文本域，GET / HEAD 自动不携带 body |
| 一键发送 | Send 按钮，发送中禁用并显示 `Sending...` |
| 响应展示 | 状态码 + 原因短语（2xx/3xx 绿色、4xx/5xx 红色）、耗时（ms）、响应正文 |
| JSON 美化 | 响应能被 `JSON.parse` 时自动格式化缩进，否则原样输出 |
| 深色界面 | 固定的深色主题，和 DevTools 风格一致 |

---

## 目录结构

```
ext-reminder/           # 项目根目录 = 扩展根目录，加载扩展时直接选它
├── manifest.json     # 扩展清单（Manifest V3），声明 popup 与 host 权限
├── popup.html        # 弹窗结构：cURL 导入、方法选择、URL、Header 行容器、Body、响应区
├── popup.css         # 弹窗样式（深色主题，宽度 480px）
├── popup.js          # 弹窗逻辑：cURL 导入回填、Header 行增删、请求收集、fetch、响应渲染
├── curl-parser.js    # cURL 命令解析器（纯函数，浏览器/Node 通用，可单测）
├── icons/            # 扩展图标（16/32/48/128）
├── scripts/
│   ├── make_icons.py       # 图标生成脚本（Pillow，超采样抗锯齿）
│   └── test_curl_parser.js # curl 解析器单元测试（node 运行）
├── package.sh        # 一键打包 zip 脚本，产物输出到 dist/
├── dist/             # 打包产物（执行 package.sh 后生成）
├── .gitignore        # 忽略 dist/、*.pem、*.crx
└── README.md         # 本文档
```

根目录下的 `.workbuddy/`、`.git/` 属于项目元数据，只在本地存在，不会被打包进 zip。

没有 background service worker，也没有 content script —— 所有逻辑都发生在 popup 页面里。

---

## 安装方式

三种安装方式，按用途选：

### 方式一：加载已解压（开发调试用，推荐）

最简单，改代码即改生效：

1. 打开 `chrome://extensions/`
2. 打开右上角 **开发者模式 / Developer mode**
3. 点 **加载已解压的扩展程序 / Load unpacked**，选择本项目**根目录**（`manifest.json` 所在的那一层）

> Edge / Brave / Arc 等 Chromium 内核浏览器同样支持，入口分别为 `edge://extensions/`、`brave://extensions/`、`arc://extensions/`。

### 方式二：安装 zip 包（分发给他人）

先打包（见下文「打包与分发」），然后把 `dist/http-request-sender-v1.0.0.zip` 发给对方：

1. 对方**解压** zip 得到文件夹
2. 按「方式一」加载解压出来的文件夹即可

> 不要直接把 zip 拖进扩展页 —— Chrome 会提示无法安装。zip 里是源码，正确姿势是解压后以「加载已解压」方式安装。

### 方式三：安装 .crx 文件

`chrome://extensions/` 页面在开发者模式开启时有 **打包扩展程序 / Pack extension** 按钮，可打出 `.crx` 安装包。但要注意：

- 正式版 Chrome 默认**禁止安装**非 Web Store 来源的 `.crx`（跨机器分发时会提示「不是来自 Chrome 应用商店」，且可能被自动禁用）
- `.crx` 适合企业内网通过组策略 `ExtensionInstallAllowlist` + 离线部署，不适合普通分享
- 想让任何人一键安装，走 **Chrome Web Store** 发布（见下文）

### 安装后验证

- 工具栏出现蓝色箭头图标（可点图钉固定）
- 点开弹窗，Method/URL/Headers/Body/Send 五个区域齐全
- URL 填 `https://httpbin.org/get`，点 Send，能看到 `200 OK` 与格式化 JSON 即安装成功

---

## 打包与分发

### 一键打包 zip

仓库自带 `package.sh`，按 `manifest.json` 的 name/version 命名产物，只打包运行所需文件：

```bash
./package.sh
# => dist/http-request-sender-v1.0.0.zip
```

打包白名单是 `manifest.json popup.html popup.css popup.js icons/`，README、脚本、dist 自身不会被打进去。Windows 用户可用 WSL 或手动压缩等价文件。

### 升级版本

1. 修改 `manifest.json` 里的 `version`（Chrome 要求严格递增，最多 4 段数字，如 `1.0.1`）
2. 重新执行 `./package.sh`，得到新文件名的 zip

### GitHub Actions 自动打包（CI）

仓库自带 `.github/workflows/package.yml`，在 GitHub 上自动完成打包，无需本地环境：

| 触发方式 | 产出 |
| --- | --- |
| push 到 `main` | Actions 页面生成 Artifact `http-request-sender-zip`，随时可下载 |
| 在 Actions 页面手动 Run workflow | 同上 |
| 推送 `v*` tag（如 `v1.0.1`） | 额外创建一个 GitHub Release，zip 挂在附件里 |

典型发布流程：

```bash
# 1. 改完代码、更新 manifest.json 里的 version
git commit -am "release: v1.0.1"
git tag v1.0.1
git push origin main v1.0.1
# 2. 等 Actions 跑完，仓库 Releases 页即出现带 zip 的 v1.0.1
```

说明：workflow 里 `chmod +x package.sh` 是因为 git 只保留了本地执行位，CI 环境里重新赋权一次最稳妥。

### 打包 .crx（本地/企业场景）

1. `chrome://extensions/` → 打开开发者模式 → 点 **打包扩展程序**
2. 「扩展程序根目录」填本项目根目录的绝对路径
3. 首次打包「私钥文件」留空，Chrome 会自动生成 `.pem` 私钥
4. 产物：同目录下生成 `.crx` 和 `.pem`

**`.pem` 是扩展身份的根私钥，务必妥善备份且不要提交进 git**。以后升级必须用同一把 `.pem` 重签，否则扩展 ID 会变、用户数据丢失、被视为不同扩展。

### 发布到 Chrome Web Store

想给任何人一键安装，这是唯一正路：

1. 注册 [Chrome Web Store 开发者账号](https://chrome.google.com/webstore/devconsole)（一次性 $5 注册费）
2. 准备素材：
   - **图标**：128×128 PNG（本仓库 `icons/icon128.png` 已满足）
   - **商店宣传图**：1280×800 或 640×400 PNG 至少 1 张
   - **截图**：1280×800 或 640×400，1~5 张
3. 上传 `package.sh` 产出的 zip，填写商品详情
4. 权限审核说明：因为声明了 `host_permissions: <all_urls>`，需要在「隐私权规范」里说明用途（本项目：允许用户向任意地址发送调试请求，不收集任何数据），`<all_urls>` 属于宽权限，审核会慢一些（通常数天）
5. 选择发布可见性：**公开 / 不公开（直链）/ 隐私（指定用户）**，个人小工具选「不公开」就很合适
6. 提交审核，通过后拿到商店链接

上架后更新：改代码 → `version` 递增 → 重新 `./package.sh` → 在开发者控制台上传新 zip。

---

## 使用说明

### 1. 发一个简单 GET

1. Method 保持 `GET`
2. URL 填 `https://httpbin.org/get`
3. 点 **Send**

响应区会显示 `200 OK`、耗时，以及格式化后的 JSON。

### 2. 发一个带 Header 的 POST

1. Method 选 `POST`
2. URL 填 `https://httpbin.org/post`
3. Headers 点 **+ 添加**，key 填 `Content-Type`，value 填 `application/json`
4. Body 填：

   ```json
   { "name": "harvey", "hello": "world" }
   ```

5. 点 **Send**，在响应里能看到回显的 headers 与 body

### 3. 从 cURL 一键导入

从浏览器 DevTools（Network → 右键请求 → **Copy as cURL**）、终端历史或文档里复制 curl 命令，然后：

1. 点顶部 **粘贴 cURL** 展开导入面板（再次点可收起）
2. 粘贴命令，点 **填入表单**（或按 `Cmd/Ctrl + Enter`）
3. URL / Method / Headers / Body 自动回填，直接点 **Send** 即可发送

解析器支持绝大多数日常写法：

```bash
curl 'https://api.example.com/users' \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer xxx' \
  --data-raw '{"name": "harvey"}'
```

- 自动推断方法：`-X` 优先，其次 `-I` → HEAD、有 `-d` → POST，否则 GET
- `-u user:pass` 转成 `Authorization: Basic ...`；`-b`/`-A`/`-e` 分别转成 Cookie / User-Agent / Referer 头
- `--json` 自动补 `Content-Type` 与 `Accept`；`-G` 把 `-d` 参数转为 query string
- 支持单双引号、`$'...'`、行尾 `\` 续行、`--flag=value` 写法，管道后面的命令（`| jq .`）自动截断
- `-d @file`、`-F`（multipart）、`-T`（上传）无法支持，会在面板下方以黄色提示列出，不会静默丢数据
- 命令没写协议时自动补全：`localhost` / `127.0.0.1` 补 `http://`，其余补 `https://`

### 4. 删掉某一行 Header

点击该行右侧的红色 **✕**。

### 5. 常见字段速查

- **Headers 的 key 区分大小写吗？** HTTP 头本身不区分大小写，但这里不做归一化，按你输入的原样发送。
- **key 为空的行会被忽略**，value 可以为空。
- **Body 只在非 GET/HEAD 时发送**，方法为 GET/HEAD 时无论 Body 框里写了什么都不会带上。

---

## 开发

### 修改后如何生效

改完代码后，在 `chrome://extensions/` 页面点击本扩展卡片上的 **刷新 ↻** 按钮，然后重新打开弹窗。只改 JS/CSS 时，关掉弹窗再点开有时也能生效，但改动 `manifest.json` 必须刷新扩展。

### 调试 popup

popup 是一个独立页面，可以像普通网页一样调试：

- 右键点击弹窗任意位置 → **检查 / Inspect**，打开专属的 DevTools
- `console.log`、断点、Network 面板都可用（Network 面板能直接看到 fetch 请求）
- 注意：**弹窗一旦失焦自动关闭，DevTools 也会跟着关**。想长时间调试，可以在 DevTools 的 Sources 里对 `popup.js` 打断点，或者临时把逻辑抽到 options 页面 / 独立 tab 中

### 代码地图

`popup.js` 分四块，读起来很快：

1. **cURL 导入** —— 面板开合、`applyCurlImport()` 调解析器、`fillForm()` 把结果写回表单
2. **`addHeaderRow(key, value)`** —— 动态创建一行 Header 输入（两个 input + 一个删除按钮）
3. **`collectHeaders()`** —— 遍历所有行，跳过空 key，收敛成 `{ key: value }` 对象
4. **Send 点击处理** —— 组装 `fetch` 的 `options`，计时、发送、渲染响应；`try/catch` 捕获网络错误并把异常文本写进响应区

`curl-parser.js` 是独立的纯函数模块（不依赖任何扩展 API），被 popup 以 `<script>` 引入后暴露全局 `parseCurl`，同时在 Node 里可以直接 `require` 跑单元测试。

### 测试

```bash
node scripts/test_curl_parser.js
# => 结果：40 通过 / 0 失败
```

改了解析器请跑一遍测试；新增支持写法时先在测试里补一个用例。

### 权限模型

`manifest.json` 里只声明了：

```json
"host_permissions": ["<all_urls>"]
```

这是让 popup 页面能跨域 `fetch` 任意地址的关键 —— 扩展页面拥有该 host 权限时，请求不受页面 CORS 限制。如果要收窄范围，把 `<all_urls>` 换成具体域名（例如 `"https://httpbin.org/*"`）即可，但只能请求白名单内的地址。

`permissions` 为空，不需要 `cookies`、`storage`、`tabs` 等任何额外权限。

---

## 已知限制

- **无法设置受保护请求头**：浏览器保留了一批 header 名（`Host`、`Origin`、`Content-Length`、`Cookie`、`Referer`、`User-Agent` 等），即使填了也会被忽略或由浏览器覆盖。
- **默认不带 Cookie**：跨域请求不会自动携带目标站点 cookie。需要带凭证时，在 `popup.js` 的 `options` 里加 `credentials: "include"`（同时目标站点要允许 CORS 携带凭证）。
- **不记录历史、不能存请求集合**：刷新弹窗即清空，没有持久化。需要的话可以接 `chrome.storage.local`。
- **响应只显示文本**：二进制响应（图片、文件下载）会显示成乱码；没有做 response header 和 cookie 的展示。
- **不支持文件上传 / form-data**：Body 是纯文本，`multipart/form-data` 需要手工拼 boundary，不建议这么用。
- **超时未处理**：`fetch` 没有超时机制，接口长时间无响应时按钮会一直处于 `Sending...`（可用 `AbortController` 补上）。

---

## 可能的后续迭代

- [ ] 用 `chrome.storage.local` 记住上次填写的 URL / Headers / Body
- [ ] 展示响应 headers 与响应耗时拆分（TTFB / 总耗时）
- [ ] 用 `AbortController` 加超时与取消按钮
- [ ] 请求历史 / 收藏列表
- [ ] cURL 导出（把当前表单反向生成 curl 命令）
