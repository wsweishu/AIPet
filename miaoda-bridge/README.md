# miaoda-bridge：肥鱼的大脑（飞书妙搭应用）

肥鱼桌宠不直接接模型，而是调用你自己飞书租户里的一个**妙搭（Spark）全栈应用**。这个应用的后端调用妙搭内置的 AI 插件（豆包），对外提供：

| 路由 | 鉴权 | 作用 |
| --- | --- | --- |
| `POST /openapi/pet/plan` | API Key（`Authorization: Bearer <key>`） | 判断这句话要不要查飞书，返回 `{ action, date }`（`calendar_agenda` / `task_list` / `none`） |
| `POST /openapi/pet/chat` | API Key | 生成回复；`stream: true` 时以 SSE 返回 |
| `GET /api/pet/me`、`POST /api/pet/plan`、`POST /api/pet/chat` | 飞书登录（Cookie + `X-Suda-Csrf-Token`） | 同上，但能拿到登录用户身份（桌宠默认走这条） |
| `POST /api/pet/claim` | 飞书登录 | 领取肥鱼：记录领取人（写日志），返回下载地址、本应用地址和要申请的 lark-cli 权限 |

应用首页（`client/src/pages/ClaimPage`）就是「领取肥鱼」页：同事打开应用并用飞书登录后，点「领取肥鱼」，页面就会显示下载按钮和安装步骤。

这里只放了我们自己写的文件。妙搭的项目脚手架由平台生成，没有放进本仓库。

## 部署到你自己的飞书

需要：已登录的 [lark-cli](https://github.com/larksuite/cli)、Node.js 22+、你的飞书租户开通了妙搭。

```bash
# 1. 新建全栈应用，记下返回的 app_id
lark-cli apps +create --as user --name "AIPet 肥鱼大脑" --app-type full_stack \
  --description "AIPet 桌宠的对话与意图识别接口"

# 2. 把应用代码拉到本地
lark-cli apps +init --as user --app-id <app_id> --dir ./my-bridge
cd ./my-bridge

# 3. 安装两个 AI 插件
lark-cli apps +plugin-install --name @official-plugins/ai-text-generate
lark-cli apps +plugin-install --name @official-plugins/ai-text-to-json
```

4. 把本目录的文件按相同路径复制进 `./my-bridge`：`server/capabilities/`、`server/modules/pet-chat/`、`shared/api.interface.ts`、`docs/openapi.json`、`client/src/app.tsx`、`client/src/api/index.ts`、`client/src/pages/ClaimPage/`。
5. 在 `server/app.module.ts` 里注册模块（放在 `ViewModule` 之前）：

   ```ts
   import { PetChatModule } from './modules/pet-chat/pet-chat.module';
   // ...
   imports: [PlatformModule.forRoot(), PetChatModule, ViewModule],
   ```

6. 提交并发布：

   ```bash
   npm run type:check:server
   git add -A && git commit -m "feat: AIPet bridge" && git push origin sprint/default
   lark-cli apps +release-create --as user --app-id <app_id> --branch sprint/default \
     --apply-reason "发布 AIPet 桌宠对话接口"
   lark-cli apps +release-get --as user --app-id <app_id> --release-id <release_id>   # 等 status=finished，拿 online_url
   ```

   仓库自带的提交前检查里，eslint 规则 `injectable-should-be-provided` 可能误报（连模板自带的 `ViewController` 都会报），类型检查通过的话可以用 `git commit --no-verify`。

7. 让全公司都能打开领取页（仍然需要飞书登录）：

   ```bash
   lark-cli apps +access-scope-set --as user --app-id <app_id> --scope tenant
   ```

8. 可选：安装包下载地址默认指向本仓库的 GitHub Releases。要换地址，设置环境变量，不用改代码：

   ```bash
   lark-cli apps +env-set --as user --app-id <app_id> --environment online --key PET_DOWNLOAD_URL --value <下载地址>
   ```

9. 可选：调试时如果不想登录，可以给个人发 API Key（在本仓库根目录运行，先把 `online_url` 和 `app_id` 写进 `.aipet/miaoda.env`）：

   ```bash
   node scripts/issue-key.mjs 张三
   ```

## 注意

- **提示词就是人设**：改 `server/capabilities/pet-chat.json` 的 `prompt` 再发布即可。
- **插件不接受空字符串**：空值会被当作缺失参数报错，服务端已改为传「（无）」。
- **模型固定**：`modelID` 固定为插件默认值 `2015`，不能改。
- **网关的流式缓冲**：流式回复经过 `feishu.link` 网关时，有时会被攒成一整块再发出，客户端要兼容这种情况。
- **可见范围**：应用默认只有创建者可见，可以用 `lark-cli apps +access-scope-set` 调整。`tenant` 表示全公司可见，外部公司的人登录不了。API Key 不受可见范围限制，拿到 Key 的人都能调用，而且消耗的是你们企业的 AI 额度。所以 Key 只发给信任的人，不要公开。
- **领取记录**：领取记录写在应用日志里（`pet claimed`），可以用 `lark-cli apps +log-list` 查看。目前没有建数据库表。
