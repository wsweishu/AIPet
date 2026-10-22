# AIPet 肥鱼

一只住在桌面上的「蓝色大肥鱼」女仆鲸鱼娘：大脑是**飞书妙搭**里的豆包，手脚是**飞书官方命令行 lark-cli**。点她聊天，她能查你的飞书日程和待办。

```
你的 Mac                         妙搭云端（你自己的飞书租户）
┌──────────────┐  HTTPS   ┌─────────────────────────────┐
│ 肥鱼桌宠      │ ───────▶ │ miaoda-bridge 应用后端        │
│ (Electron)   │ ◀─────── │  /plan  ai-text-to-json 选动作 │
│      │        │   SSE    │  /chat  ai-text-generate 回答  │
│      ▼        │          └─────────────────────────────┘
│ lark-cli ────┼──▶ 飞书（以你本人的身份，只读日程与待办）
└──────────────┘
```

每轮对话：桌宠把你的话发给妙搭的 `/plan` → 豆包判断要不要查飞书 → 桌宠在本机用 lark-cli 只读查询（只允许白名单里的动作）→ 把精简结果发给 `/chat` → 豆包按结果回答，流式显示在气泡里。

## 目录

| 目录 | 内容 |
| --- | --- |
| [`pet/`](pet/) | Electron 桌宠：透明置顶窗口、鲸鱼娘动画、对话气泡、只读飞书执行器、设置页 |
| [`miaoda-bridge/`](miaoda-bridge/) | 妙搭应用的后端代码与部署步骤（插件实例、接口、OpenAPI 文档） |
| [`scripts/`](scripts/) | `issue-key.mjs` 给每人发妙搭 API Key；`miaoda-chat.mjs` 命令行测试对话；`aily-chat.mjs` 调飞书 aily 智能体（目前飞书未开放该接口，返回 10006） |

## 快速开始

1. **部署大脑**：按 [`miaoda-bridge/README.md`](miaoda-bridge/README.md) 在你的飞书租户里建一个妙搭全栈应用并发布。
2. **准备 lark-cli**：安装 [lark-cli](https://github.com/larksuite/cli) 并完成 `lark-cli config init` 与 `lark-cli auth login`。第一次问日程或待办时，桌宠会自动打开授权页，申请 `calendar:calendar.event:read`、`task:task:read`。
3. **发 Key**：新建 `.aipet/miaoda.env`（已被 git 忽略），然后运行 `node scripts/issue-key.mjs <姓名>`，会生成 `.aipet/keys/<姓名>.env`：

   ```
   MIAODA_APP_ID=app_xxxx
   MIAODA_BASE_URL=https://<你的租户>.feishu.link/app/app_xxxx
   ```

4. **跑桌宠**：

   ```bash
   cd pet
   npm install
   npm start              # 首次会打开设置：导入 Key 文件，或选「飞书登录」
   npm run package        # 打包 macOS（Apple 芯片）应用到 pet/dist/
   ```

`pet/pet.defaults.json` 可以填上默认的妙搭地址，省掉每个人手动输入。

## 安全设计

- 豆包只决定做什么；真正执行的是本机的 lark-cli，而且只执行白名单里的两个只读动作（查某天日程、查未完成待办）。日期必须是 `YYYY-MM-DD`，命令不经过 shell。
- 模型输出，以及会被拼进提示词的会议标题、消息内容，都当作不可信输入，所以写操作一律不会执行。
- 你的飞书凭证只留在本机钥匙串里。发给妙搭的只有你说的话、最近 10 轮对话和精简后的查询结果。
- API Key 每人一把，只能调对话相关的两个接口，可以在妙搭里单独停用。

## 许可

- **代码**：[MIT](LICENSE)
- **鲸鱼娘动画**（`pet/assets/whalechan/`）：取自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)。原作者声明允许开源使用、**禁止商用**，二创需注明该地址。角色是社区二创的 DeepSeek「蓝色大肥鱼」：原型为上善无形的「溟月」（CC BY-NC-SA 4.0），女仆版设计来自 ZipZipPipe（禁止商用）。详见 [CREDITS.md](pet/assets/whalechan/CREDITS.md)。

因为美术素材的限制，本项目整体**不能用于商业用途**。要商用，请把形象换成你有权使用的素材。

本项目与 DeepSeek、字节跳动、飞书官方均无关联。
