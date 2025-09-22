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
    // 如果出错，也尝试发送通知
    try {
        await sendServerChanNotification(env.SERVERCHAN_KEY, "DTI监控脚本出错", error.message);
    } catch (e) {
        // ignore
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