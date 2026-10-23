# AIPet 肥鱼

住在桌面上的「蓝色大肥鱼」女仆鲸鱼娘。它的大脑是你飞书租户里的妙搭应用（见 ../miaoda-bridge）调用的豆包（妙搭内置的 `ai-text-generate`），基于 Electron。

## 用法

- **点一下她**：弹出输入框，回车发送，回复显示在气泡里（逐字出现）
- **拖动她**：换位置，下次启动会记住
- **双击她**：打个招呼
- **右键她**：设置、飞书登录、清空记忆、退出
- 角色以外的透明区域不挡鼠标；90 秒没人理会打瞌睡，闲着时偶尔玩魔方、吃白饭、哼歌

肥鱼会记住最近 10 轮对话；清空记忆或退出后忘掉。

## 查飞书（只读）

问「今天有什么会」「明天下午忙不忙」「我还有哪些待办」时，肥鱼会：

1. 请妙搭里的豆包判断要不要查、查什么（`/plan`，输出 `calendar_agenda` / `task_list` / `none` 和日期）
2. 用你本人的飞书授权，直接调飞书 OpenAPI 只读查询（日历 `instance_view`、任务 `GET /task/v2/tasks?completed=false`）
3. 只把标题、时间、地点、是否回复邀请交回豆包，由它按结果回答（`/chat` 的 `toolResult`）

本机只认白名单里的这两个动作，日期必须是 `YYYY-MM-DD`。模型的输出（以及会议标题等被拼进提示词的内容）都当作不可信输入，所以写操作一律不会执行。

**授权**：第一次查飞书时（或右键 →「授权查看飞书…」），肥鱼弹出飞书授权页，你点「授权」即可，不需要安装 lark-cli。授权窗口和「飞书登录」共用登录状态，通常不用再输账号。飞书跳回妙搭时，肥鱼截下授权码交给妙搭，妙搭用管理员配置的飞书应用密钥换成**你本人的** token 交回来。token 用系统钥匙串加密后存在本机 `feishu-token.bin`，过期前自动通过妙搭刷新；退出登录时删除。只有「飞书登录」模式能授权。

## 连接方式

| 方式 | 适合 | 怎么配 |
| --- | --- | --- |
| API Key | 给团队里每人发一把，管理员能在妙搭看到、单独停用 | 管理员在仓库根目录运行 `node scripts/issue-key.mjs <姓名>`，把生成的 `.aipet/keys/<姓名>.env` 发给对方；对方在「设置 → 导入 Key 文件」导入 |
| 飞书登录 | 用自己的飞书身份，肥鱼认识你是谁 | 「设置 → 飞书登录…」，在弹出的窗口里完成飞书登录 |

`node scripts/issue-key.mjs --list` 列出所有 Key（只显示末 4 位）。

## 开发

```bash
npm install
npm start            # 开发运行
npm run package:mac  # 打包为 dist/AIPet 肥鱼-darwin-arm64/AIPet 肥鱼.app（Apple 芯片）
npm run package:win  # 打包为 dist/AIPet 肥鱼-win32-x64/AIPet.exe（64 位 Windows，在 Mac 上也能打）
```

自检（自动发一句话、打印耗时、截图后退出）：

```bash
AIPET_SELFTEST=1 AIPET_USER_DATA=/tmp/aipet-test AIPET_CONFIG_FILE=../.aipet/keys/<姓名>.env AIPET_SELFTEST_SHOT=/tmp/pet.png npm start
```

图标由 `npx electron scripts/make-icon.js` 从 `assets/icon.html` 生成；Windows 用的 `assets/icon.ico` 由 `scripts/make-ico.js` 打包（先用 `sips -z N N` 从 icon.png 缩出 16–256 各尺寸）。

## 结构

- `src/main.js` 透明置顶窗口、拖动、点击穿透、右键菜单、Windows 托盘、设置窗口、自检
- `src/feishu.js` 只读执行器：动作白名单、飞书 OpenAPI 调用、结果精简、授权窗口与 token 加密存储和刷新
- `src/brain.js` 调妙搭：`/plan` 意图识别；`/openapi/pet/chat`（API Key）或 `/api/pet/chat`（飞书登录 + CSRF），解析 SSE；`/api/pet/feishu/*` 换取和刷新飞书 token
- `src/config.js` 本机配置，存在 `~/Library/Application Support/AIPet 肥鱼/config.json`（Windows 是 `%APPDATA%\AIPet 肥鱼\config.json`），权限 600
- `renderer/` 鲸鱼娘动画播放（按状态切换：待机、倾听、思考、查飞书、说话、庆祝、出错、打瞌睡，外加拖拽、双击、睡醒反应和待机小动作）与对话气泡
- `assets/whalechan/` 19 段透明 WebM 动画与出处说明
- `pet.defaults.json` 默认连接的妙搭应用地址

## 已知情况

- 妙搭网关有时会把流式回复攒齐了一次性发出，所以界面统一用打字机效果显示
- 首字大约 3–6 秒
- .app 只做了临时签名（打包脚本里的 `codesign --sign -`），没有 Apple 公证。从网上下载后，第一次双击会提示「无法验证开发者」，点「完成」，再到「系统设置 → 隐私与安全性」底部点「仍要打开」。不做这步签名的话，macOS 会直接报「已损坏」；Windows 会弹「Windows 已保护你的电脑」，点「更多信息 → 仍要运行」
- Windows 上肥鱼不占任务栏，右下角托盘图标右键可以打开设置或退出

## 形象与版权

肥鱼的形象是社区二创的 DeepSeek「蓝色大肥鱼」女仆鲸鱼娘，19 段透明动画取自 DeepSeek Harness 桌宠插件 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（作者 PC2005-cloud，AI 视频生成），文件和对应关系见 `assets/whalechan/CREDITS.md`。

- 代码：MIT
- 动画素材：按原作者声明「允许开源使用，禁止商用」，二创需注明 https://github.com/PC2005-cloud/dsh-pet
- 角色：原型为画师上善无形的「溟月」（CC BY-NC-SA 4.0），女仆版设计来自 ZipZipPipe（禁止商用）。DeepSeek 官方没有吉祥物，本项目与 DeepSeek 无关

所以这个桌宠**不能用于商业用途**。要商用，需要换成自己有权使用的形象。
