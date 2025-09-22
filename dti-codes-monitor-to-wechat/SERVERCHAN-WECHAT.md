### `SERVERCHAN-WECHAT.md`

# ServerChan (方糖) API 文档

ServerChan 提供了将消息推送到微信的简单、免费的 API 服务。核心是通过一个名为 `SendKey` 的个人密钥来认证和发送消息。

## 核心概念：SendKey

`SendKey` 是您的个人推送密钥，是调用 API 的唯一凭证。

-   **获取**: 登录 [ServerChan 官网](https://sct.ftqq.com/) 后，在“发送消息”页面即可找到您的 `SendKey`。
-   **安全**: `SendKey` 非常重要，请妥善保管，不要泄露给他人或提交到公开的代码仓库中。

---

## 1. 发起推送

### API Endpoint

```
https://sctapi.ftqq.com/{Your_SendKey}.send
```

将 `{Your_SendKey}` 替换为您自己的 `SendKey`。

### 请求方法

强烈推荐使用 `POST` 方法，因为它没有内容长度限制，并且更适合发送包含复杂内容（如 Markdown）的数据。`GET` 方法虽然简单，但有 URL 长度限制，且中文字符需要进行 URL 编码。

### 参数说明

| 参数 | 是否必填 | 类型 | 说明 |
| :--- | :--- | :--- | :--- |
| `title` | **是** | String | 消息标题，最大长度为 32 个字符。 |
| `desp` | 否 | String | 消息描述，支持 **Markdown** 语法。最大长度为 32KB。消息卡片会截取前 30 个字符作为预览。 |
| `short` | 否 | String | 消息卡片的简短内容，最大长度为 64 个字符。如果不提供，将自动从 `desp` 中截取。 |
| `noip` | 否 | Integer | 是否隐藏调用者的 IP 地址。`1` 表示隐藏，留空或不传则显示。 |
| `channel`| 否 | String | 动态指定本次推送使用的消息通道。支持多个通道，用 `|` (竖线) 分隔。具体通道代码见下方。 |
| `openid` | 否 | String | 消息抄送给指定用户。多个 `openid` 用 `,` 或 `|` 分隔 (取决于通道)。 |

### 调用示例

#### 示例 1: 最简单的 GET 请求 (仅标题)

```bash
# 直接在浏览器或命令行中访问
curl "https://sctapi.ftqq.com/{Your_SendKey}.send?title=服务器A即将到期"
```

#### 示例 2: POST 请求 (Form-Data, 推荐)

这是最常用和推荐的方式。

```bash
curl --request POST \
  --url https://sctapi.ftqq.com/{Your_SendKey}.send \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'title=监控报告' \
  --data-urlencode 'desp=# DTI Codes 更新了！

> 在Cloudflare Worker中检测到页面内容发生变化。

- **时间**: $(date)
- [点击这里查看](https://dti-dress-to-impress.fandom.com/wiki/Codes)'
```

#### 示例 3: POST 请求 (JSON)

如果您希望以 JSON 格式发送数据，需要指定正确的 `Content-Type`。

```bash
curl --request POST \
  --url https://sctapi.ftqq.com/{Your_SendKey}.send \
  --header 'Content-Type: application/json' \
  --data '{
    "title": "来自JSON的监控报告",
    "desp": "这是一个通过 JSON Body 发送的 **Markdown** 消息。",
    "short": "JSON 消息"
  }'
```

---

## 2. 消息通道 (Channel)

您可以通过 `channel` 参数指定消息的推送渠道。这对于将不同类型的消息发送到不同的设备或应用非常有用。

| 通道名称 | `channel` 值 |
| :--- | :--- |
| 方糖服务号 (默认) | `9` |
| 企业微信应用消息 | `66` |
| 钉钉群机器人 | `1` |
| 飞书群机器人 | `3` |
| 官方 Android 版·β | `98` |
| Bark (iOS) | `8` |
| PushDeer | `18` |
| 测试号 | `0` |
| 自定义 | `88` |

**示例**: 同时推送到方糖服务号和企业微信：`channel=9|66`

---

## 3. 查询推送状态

调用推送接口会返回一个 `pushid` 和 `readkey`，可用于查询消息的实际发送状态。

### API Endpoint

```
https://sctapi.ftqq.com/push?id={pushid}&readkey={readkey}
```

-   将 `{pushid}` 和 `{readkey}` 替换为推送接口返回的实际值。
-   返回值中的 `wxstatus` 即为微信接口的返回信息。如果为空，说明任务可能仍在队列中等待执行。