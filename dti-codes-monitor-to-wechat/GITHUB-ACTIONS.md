# 方案一：使用 GitHub Actions 进行监控

该方案将所有逻辑、状态和调度都存放在您的 GitHub 仓库中。

### 核心理念

- **一切皆在 Git 中**：代码、调度配置和页面内容快照都作为文件存储在仓库里。
- **版本化状态**：每一次页面内容的变更都会产生一次 Git Commit，可以清晰地追溯历史变化。
- **环境熟悉**：对于熟悉 GitHub 的开发者来说，学习成本较低。

### 核心组件

1.  **GitHub Actions Runner**：免费的虚拟环境，用于执行我们的工作流。
2.  **Python 脚本**：用于执行抓取、解析、比较和发送通知的核心逻辑。
3.  **GitHub Secrets**：用于安全地存储您的 ServerChan SendKey。
4.  **仓库文件 (`latest_codes.txt`)**：用于存储上一次抓取到的页面内容快照。

### 实施步骤

**1. 设置 Secrets**

-   在您的 GitHub 仓库页面，进入 `Settings` > `Secrets and variables` > `Actions`。
-   点击 `New repository secret`。
-   **Name**: `SERVERCHAN_KEY`
-   **Secret**: 粘贴您的 ServerChan SendKey (`SCT...`)。

**2. 创建 Python 脚本**

-   在您的项目目录下，创建一个文件夹 `scripts`。
-   在 `scripts/` 文件夹下，创建一个新文件 `check_codes.py`，内容如下：

```python
import requests
import os
import sys

# Fandom Wikitext API URL
API_URL = "https://dti-dress-to-impress.fandom.com/api.php?action=parse&page=Codes&prop=wikitext&format=json"
# 存储上一次内容快照的文件
STATE_FILE = "latest_codes.txt"

def extract_section(wikitext, heading):
    """从 Wikitext 中提取指定标题下的第一个表格内容"""
    try:
        start_index = wikitext.index(heading)
        table_start_index = wikitext.index("{|", start_index)
        table_end_index = wikitext.index("|}", table_start_index)
        return wikitext[table_start_index : table_end_index + 2]
    except ValueError:
        return ""

def send_notification(key, title, desp):
    """发送 ServerChan 通知"""
    url = f"https://sctapi.ftqq.com/{key}.send"
    data = {"title": title, "desp": desp}
    try:
        requests.post(url, data=data)
        print("Notification sent successfully.")
    except Exception as e:
        print(f"Failed to send notification: {e}")

def main():
    # 1. 获取最新内容
    response = requests.get(API_URL, headers={'User-Agent': 'GitHub-Action-Monitor/1.0'})
    response.raise_for_status() # 如果请求失败则抛出异常
    wikitext = response.json()["parse"]["wikitext"]["*"]
    
    active_codes = extract_section(wikitext, "== Active Codes ==")
    expired_codes = extract_section(wikitext, "== Expired Codes ==")
    current_content = f"{active_codes}\n\n{expired_codes}"

    if not current_content.strip():
        print("Error: Could not parse content from API response.")
        sys.exit(1)

    # 2. 读取旧内容
    previous_content = ""
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            previous_content = f.read()

    # 3. 比较差异
    if current_content == previous_content:
        print("No changes detected.")
        # 通过 GITHUB_OUTPUT 设置输出变量，告知工作流无需提交
        if "GITHUB_OUTPUT" in os.environ:
            with open(os.environ["GITHUB_OUTPUT"], "a") as f:
                print(f"has_changed=false", file=f)
        return

    print("Change detected!")
    
    # 4. 发送通知
    serverchan_key = os.getenv("SERVERCHAN_KEY")
    if serverchan_key:
        title = "DTI Codes 页面有更新！"
        desp = "检测到 Fandom 页面上的激活码列表发生变化。\n\n[点击这里查看](https://dti-dress-to-impress.fandom.com/wiki/Codes)"
        send_notification(serverchan_key, title, desp)
    else:
        print("SERVERCHAN_KEY not found. Skipping notification.")

    # 5. 更新快照文件
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        f.write(current_content)
    print(f"Updated {STATE_FILE}.")

    # 6. 设置输出变量，告知工作流需要提交
    if "GITHUB_OUTPUT" in os.environ:
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            print(f"has_changed=true", file=f)

if __name__ == "__main__":
    main()