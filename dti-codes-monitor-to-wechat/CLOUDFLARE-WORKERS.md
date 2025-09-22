### `CLOUDFLARE_WORKER.md`

# 方案二：使用 Cloudflare Workers 进行监控（最终版）

这是一个高度优化的“无服务器”（Serverless）方案，利用 Cloudflare 的全球边缘网络实现。

### 核心理念

-   **逻辑在边缘**：代码部署在 Cloudflare 的全球网络上，执行速度极快。
-   **专业状态存储**：使用专为高频读写设计的分布式键值存储（KV）来保存页面快照，与代码仓库分离。
-   **事件驱动**：由 Cron 触发器精确唤醒，无闲置资源消耗。

### 核心组件

1.  **Cloudflare Worker**: 运行监控逻辑的 JavaScript 环境。
2.  **Wrangler CLI**: Cloudflare 官方的命令行工具，用于开发、部署和管理 Worker。
3.  **Cloudflare KV**: 用于持久化存储上一次抓取到的页面内容快照。
4.  **Worker Secrets**: 用于安全地存储您的 ServerChan SendKey。

### 实施步骤

**1. 环境准备**

-   确保您已安装 [Node.js](https://nodejs.org/)。
-   在您的终端中，全局安装 Wrangler CLI:
    ```bash
    # 使用 npm
    npm install -g wrangler
    # 或者 pnpm
    pnpm add -g wrangler
    # 或者 bun
    bun install -g wrangler
    ```-   登录您的 Cloudflare 账户 (浏览器会自动打开一个授权页面):
    ```bash
    wrangler login
    ```

**2. 初始化项目**

-   在您的项目目录下 (`.../cloudflare-workers-dti-codes`) 运行初始化命令。
    ```bash
    # Wrangler 会询问一些问题，您可以按默认选项（"Hello World" script, No TypeScript）完成
    wrangler init .
    ```

**3. 配置 KV 和 Secrets**

-   **创建 KV 命名空间**:
    ```bash
    wrangler kv namespace create CODES_KV
    ```

-   **关于 `preview_id` 的重要说明**:
    -   `preview_id` 用于本地测试 (`wrangler dev`) 时的数据隔离沙盒。
    -   对于我们这种直接部署、由 Cron 触发的场景，**`preview_id` 是完全可选的**。
    -   `create` 命令的输出可能不包含 `preview_id`。如果您想查找它，可以使用 `wrangler kv namespace list` 命令。如果列表中依然没有，请放心忽略，我们的项目不需要它。

-   **配置 Secrets**:
    ```bash
    # 这会提示您输入密钥的值，请粘贴您的 ServerChan Key
    wrangler secret put SERVERCHAN_KEY
    ```

-   **如何管理/更新 Secret?**:
    -   **安全原则**: Secret 是“只写不读”的，您无法在 Cloudflare 上查看已设置的 Secret 值。
    -   **正确流程**: 如果您忘记了或想更新 Secret，请：
        1.  前往 **ServerChan 官网** (`sct.ftqq.com`) 登录并复制最新的、正确的 SendKey。
        2.  **再次运行 `wrangler secret put SERVERCHAN_KEY` 命令**，用正确的值覆盖旧值。此操作无需重新部署即可生效。

**4. 配置 `wrangler.jsonc`**

-   用以下内容**完全替换**您项目根目录下的 `wrangler.jsonc` 文件。这个配置是精简且完整的。

```jsonc
{
	"$schema": "node_modules/wrangler/config-schema.json",
	"name": "cloudflare-workers-dti-codes",
	"main": "src/index.js",
	"compatibility_date": "2025-09-22",
	
	// Cron 触发器配置，每8小时的第0分钟执行
	"triggers": {
		"crons": ["0 */8 * * *"]
	},
	
	// 绑定 KV 命名空间，让 Worker 可以通过 CODES_KV 变量访问数据库
	// 请将 id 替换为您自己 `create` 命令输出的真实 id
	"kv_namespaces": [
		{
			"binding": "CODES_KV",
			"id": "282aaaf191424b28bb9834cb285870e0"
		}
	]
}
```

**5. 编写 Worker 代码**

-   用以下内容**完全替换** `src/index.js` 文件的内容：

```javascript
export default {
  // 响应 Cron 触发器的入口点
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(checkForUpdates(env));
  },
  // 允许通过 URL 手动触发测试
  async fetch(request, env, ctx) {
    const result = await checkForUpdates(env);
    return new Response(result, { headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
  }
};

async function checkForUpdates(env) {
  const WIKI_API_URL = "https://dti-dress-to-impress.fandom.com/api.php?action=parse&page=Codes&prop=wikitext&format=json";

  try {
    // 1. 获取最新数据
    const response = await fetch(WIKI_API_URL, {
      headers: { 'User-Agent': 'DTI-Codes-Monitor-Cloudflare-Worker/1.0' }
    });
    if (!response.ok) throw new Error(`Fandom API fetch failed with status ${response.status}`);
    const data = await response.json();
    const wikitext = data.parse.wikitext['*'];

    // 2. 解析并组合内容快照
    const activeCodes = extractSection(wikitext, "== Active Codes ==");
    const expiredCodes = extractSection(wikitext, "== Expired Codes ==");
    const currentContent = `${activeCodes}\n\n${expiredCodes}`;
    if (!currentContent.trim()) throw new Error("Could not parse and extract codes from wikitext.");

    // 3. 获取上次的内容
    const previousContent = await env.CODES_KV.get("LAST_CODES_CONTENT");

    // 4. 比较差异
    if (previousContent === currentContent) {
      console.log("No changes detected.");
      return "No changes detected.";
    }

    // 5. 有变化，发送通知并更新KV
    console.log("Change detected! Sending notification...");
    const serverChanKey = env.SERVERCHAN_KEY;
    if (!serverChanKey) throw new Error("SERVERCHAN_KEY secret is not configured!");

    const title = "DTI Codes 页面有更新！";
    const desp = `检测到 Dress to Impress Fandom 页面上的激活码列表发生变化。\n\n[点击这里查看](https://dti-dress-to-impress.fandom.com/wiki/Codes)`;
    await sendServerChanNotification(serverChanKey, title, desp);

    await env.CODES_KV.put("LAST_CODES_CONTENT", currentContent);
    
    return "Change detected, notification sent, and state updated.";

  } catch (error) {
    console.error(error);
    // 如果监控过程出错，也尝试发送通知告知您
    if (env.SERVERCHAN_KEY) {
        try {
            await sendServerChanNotification(env.SERVERCHAN_KEY, "DTI监控脚本出错", error.message);
        } catch (e) { /* ignore secondary error */ }
    }
    return `An error occurred: ${error.message}`;
  }
}

function extractSection(wikitext, heading) {
  const startIndex = wikitext.indexOf(heading);
  if (startIndex === -1) return "";
  const tableStartIndex = wikitext.indexOf("{|", startIndex);
  if (tableStartIndex === -1) return "";
  const tableEndIndex = wikitext.indexOf("|}", tableStartIndex);
  if (tableEndIndex === -1) return "";
  return wikitext.substring(tableStartIndex, tableEndIndex + 2);
}

async function sendServerChanNotification(key, title, desp) {
  const url = `https://sctapi.ftqq.com/${key}.send`;
  const body = new URLSearchParams({ title, desp });
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    console.error(`ServerChan API error: ${response.status} ${response.statusText}`);
  }
}
```

**6. 部署与验证**

-   **部署**:
    ```bash
    wrangler deploy
    ```

-   **查看实时日志**: (在新终端窗口中运行)
    ```bash
    wrangler tail
    ```

-   **如何在 Cloudflare Dashboard 中验证**:
    1.  登录 Cloudflare 仪表板，进入 **Workers & Pages**。
    2.  点击您的 Worker (`cloudflare-workers-dti-codes`)。
    3.  **检查定时器**: 点击 **Triggers** 标签页，在 "Cron Triggers" 下您应该能看到 `0 */8 * * *` 的调度规则以及下次运行时间。
    4.  **手动测试**: 在 **Triggers** 标签页找到您的 `...workers.dev` URL 并访问它。第一次访问应会收到微信通知，再次访问则不会。
    5.  **检查 KV 存储**: 点击 **Settings** > **KV Namespaces** > 点击 `CODES_KV` 旁边的 **View**。在手动测试后，您应该能看到一个名为 `LAST_CODES_CONTENT` 的条目。