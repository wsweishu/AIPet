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
2. 在本机用 lark-cli 以你的飞书身份只读查询（`calendar +agenda` / `task +get-my-tasks --complete=false`）
3. 只把标题、时间、地点、是否回复邀请交回豆包，由它按结果回答（`/chat` 的 `toolResult`）

本机只认白名单里的这两个动作，日期必须是 `YYYY-MM-DD`，命令不经过 shell。模型的输出（以及会议标题等被拼进提示词的内容）都当作不可信输入，所以写操作和其他命令一律不会执行。缺飞书权限时肥鱼会自动打开授权页。需要本机已安装并登录 lark-cli。

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
npm run package      # 打包为 dist/AIPet 肥鱼-darwin-arm64/AIPet 肥鱼.app
```

自检（自动发一句话、打印耗时、截图后退出）：

```bash
AIPET_SELFTEST=1 AIPET_USER_DATA=/tmp/aipet-test AIPET_CONFIG_FILE=../.aipet/keys/<姓名>.env AIPET_SELFTEST_SHOT=/tmp/pet.png npm start
```

图标由 `npx electron scripts/make-icon.js` 从 `assets/icon.html` 生成。

## 结构

- `src/main.js` 透明置顶窗口、拖动、点击穿透、右键菜单、设置窗口、自检
- `src/feishu.js` 只读执行器：动作白名单、lark-cli 调用、结果精简、缺权限时的设备授权
- `src/brain.js` 调妙搭：`/plan` 意图识别；`/openapi/pet/chat`（API Key）或 `/api/pet/chat`（飞书登录 + CSRF），解析 SSE
- `src/config.js` 本机配置，存在 `~/Library/Application Support/AIPet 肥鱼/config.json`（权限 600）
- `renderer/` 鲸鱼娘动画播放（按状态切换：待机、倾听、思考、查飞书、说话、庆祝、出错、打瞌睡，外加拖拽、双击、睡醒反应和待机小动作）与对话气泡
- `assets/whalechan/` 19 段透明 WebM 动画与出处说明
- `pet.defaults.json` 默认连接的妙搭应用地址

## 已知情况

- 妙搭网关有时会把流式回复攒齐了一次性发出，所以界面统一用打字机效果显示
- 首字大约 3–6 秒
- 未签名的 .app 拷到别的电脑上会被 macOS 拦，需要右键「打开」一次

## 形象与版权

肥鱼的形象是社区二创的 DeepSeek「蓝色大肥鱼」女仆鲸鱼娘，19 段透明动画取自 DeepSeek Harness 桌宠插件 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（作者 PC2005-cloud，AI 视频生成），文件和对应关系见 `assets/whalechan/CREDITS.md`。

- 代码：MIT
- 动画素材：按原作者声明「允许开源使用，禁止商用」，二创需注明 https://github.com/PC2005-cloud/dsh-pet
- 角色：原型为画师上善无形的「溟月」（CC BY-NC-SA 4.0），女仆版设计来自 ZipZipPipe（禁止商用）。DeepSeek 官方没有吉祥物，本项目与 DeepSeek 无关

所以这个桌宠**不能用于商业用途**。要商用，需要换成自己有权使用的形象。
