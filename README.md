# AIPet 肥鱼

一只住在桌面上的「蓝色大肥鱼」女仆鲸鱼娘：大脑是**飞书妙搭**里的豆包，手脚是**飞书开放平台 OpenAPI**（用你本人的飞书授权，只读）。点她聊天，她能查你的飞书日程和待办。

```
你的电脑                        妙搭云端（你自己的飞书租户）
┌──────────────┐  HTTPS   ┌─────────────────────────────┐
│ 肥鱼桌宠      │ ───────▶ │ miaoda-bridge 应用后端        │
│ (Electron)   │ ◀─────── │  /plan  ai-text-to-json 选动作 │
│      │        │   SSE    │  /chat  ai-text-generate 回答  │
│      ▼        │          └─────────────────────────────┘
│ OpenAPI ─────┼──▶ 飞书（以你本人的身份，只读日程与待办）
└──────────────┘
```

每轮对话：桌宠把你的话发给妙搭的 `/plan` → 豆包判断要不要查飞书 → 桌宠用你的飞书 token 直接调 OpenAPI 只读查询（只允许白名单里的动作）→ 把精简结果发给 `/chat` → 豆包按结果回答，流式显示在气泡里。

## 目录

| 目录 | 内容 |
| --- | --- |
| [`pet/`](pet/) | Electron 桌宠：透明置顶窗口、鲸鱼娘动画、对话气泡、只读飞书执行器、设置页 |
| [`miaoda-bridge/`](miaoda-bridge/) | 妙搭应用的后端代码与部署步骤（插件实例、接口、OpenAPI 文档） |
| [`scripts/`](scripts/) | `issue-key.mjs` 给每人发妙搭 API Key；`miaoda-chat.mjs` 命令行测试对话；`aily-chat.mjs` 调飞书 aily 智能体（目前飞书未开放该接口，返回 10006） |

## 使用流程

**管理员（每个公司做一次）**：按 [`miaoda-bridge/README.md`](miaoda-bridge/README.md) 在你们的飞书里部署妙搭应用，并把可见范围设为全公司。

**同事**：
1. 打开妙搭应用，用飞书登录，点「领取肥鱼」，拿到下载链接和安装步骤。
2. 下载安装（[Releases](https://github.com/wsweishu/AIPet/releases)，有 Apple 芯片 Mac 和 64 位 Windows 两个版本）。应用没有签名：Mac 第一次打开要右键选「打开」；Windows 弹出「Windows 已保护你的电脑」时点「更多信息 → 仍要运行」，肥鱼在右下角托盘里。
3. 在肥鱼的设置里选「飞书登录」，填入领取页上显示的妙搭地址，完成飞书登录。不需要 API Key。
4. 第一次问「今天有什么会」时，肥鱼会弹出飞书授权页，点「授权」即可（只读日历和待办）。不需要安装 lark-cli。

## 开发

```bash
cd pet
npm install
npm start              # 开发运行
npm run package:mac    # 打包 macOS（Apple 芯片）应用到 pet/dist/
npm run package:win    # 打包 Windows x64 应用到 pet/dist/（在 Mac 上也能打）
```

`pet/pet.defaults.json` 可以填上默认的妙搭地址，自己打包分发时就不用每个人手动输入了。调试时也可以用 API Key：在 `.aipet/miaoda.env`（已被 git 忽略）里写好 `MIAODA_APP_ID` 和 `MIAODA_BASE_URL`，再运行 `node scripts/issue-key.mjs <姓名>`。

## 安全设计

- 豆包只决定做什么；真正执行的是桌宠本机，而且只执行白名单里的两个只读动作（查某天日程、查未完成待办）。日期必须是 `YYYY-MM-DD`。
- 模型输出，以及会被拼进提示词的会议标题、消息内容，都当作不可信输入，所以写操作一律不会执行。
- 飞书应用的密钥只在妙搭服务端；你的飞书 token 用系统钥匙串加密存在本机。发给妙搭的只有你说的话、最近 10 轮对话、精简后的查询结果，以及换取和刷新 token 的请求（妙搭不保存 token）。
- 默认用每个人自己的飞书登录访问妙搭，不发 API Key；全公司共用一个只读飞书应用，但每人的 token 只代表本人，各自授权。

## 许可

- **代码**：[MIT](LICENSE)
- **鲸鱼娘动画**（`pet/assets/whalechan/`）：取自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)。原作者声明允许开源使用、**禁止商用**，二创需注明该地址。角色是社区二创的 DeepSeek「蓝色大肥鱼」：原型为上善无形的「溟月」（CC BY-NC-SA 4.0），女仆版设计来自 ZipZipPipe（禁止商用）。详见 [CREDITS.md](pet/assets/whalechan/CREDITS.md)。

因为美术素材的限制，本项目整体**不能用于商业用途**。要商用，请把形象换成你有权使用的素材。

本项目与 DeepSeek、字节跳动、飞书官方均无关联。
