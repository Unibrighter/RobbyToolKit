## 腾讯云的羊毛,每个月10000分钟,基本上算是6天
32G内存,16G显存,应该可以跑Deepseek R1 - 14b
- https://ide.cloud.tencent.com/dashboard/gpu-workspace
- 以后可以测试一下混元的,看看是不是硬盘空间大些.


## 实质上是ubuntu的一个docker
- https://main.qcloudimg.com/raw/document/product/pdf/1039_33505_cn.pdf
- 只有conda和workspace的内容会持久化.
- apt install 安装的东西第二天重启就没了.
- 似乎/usr/local/bin/ngrok 也被持久化了,但是不放心


## 模版选择
1. 目前流程跑通的有ollama,这个预装了ollama和deepseek R1 - 7b
2. 只需用conda配置python虚拟环境,pip安装open-webui,最后安装ngrok穿透即可.
3. 配置时,有一些坑,后面会详述.

开instance时,tempalte这里我们选ollama.

## 进入之后
1. 查看云服务器信息(可选)
- apt update
- apt install neofetch
- neofetch // 快速看硬件信息

2. 配置python虚拟环境
- conda env list // 我们可以发现现在只有一个base
- 我们这里用清华的源,来配一个pip的环境
- 参考 https://cloud.tencent.com/developer/article/2504526
```
conda clean -i
conda create -n python-3.11.11 python=3.11.11 -y --override-channels --channel https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main
conda activate python-3.11.11
pip install open-webui


env | grep 'OLLAMA' // 发现ollama在cloudstudio是配置在
// OLLAMA_HOST=http://0.0.0.0:6399


export OLLAMA_BASE_URL=http://0.0.0.0:6399 // 让 open-webui也知道哪里去找ollama要索引和api请求

open-webui serve
```

3. 这时会发现,出现open-webui的logo后,在了启动服务的部分,后面就不走了
- 这是因为open-webui还需要去git下载一些文件

4. 科学上网,用腾讯的自己的cache,根据腾讯Docs,他们只配置了git的proxy,但是没有配其他(如hugging face)的proxy
```
git config --global http.proxy http://proxy.cloudstudio.work:8081
git config --global https.proxy http://proxy.cloudstudio.work:8081
export http_proxy=http://proxy.cloudstudio.work:8081
export HTTP_PROXY=http://proxy.cloudstudio.work:8081
export https_proxy=http://proxy.cloudstudio.work:8081
export HTTPS_PROXY=http://proxy.cloudstudio.work:8081

export NO_PROXY=localhost,127.0.0.1,0.0.0.0 // 避免本机open-webui到ollama的请求被squid proxy拦截
```
以上的命令,实质上用的是squid的proxy
如果不加最后一行"NO_PROXY",就会发现open-webui在通过localhost,127.0.0.1,0.0.0.0的时候
都会用403相响应

在bash内(也即腾讯的VSCode IDE里),squid不生效
但是open-webui还是会走squid,导致报错
```
2025-04-09 07:35:57.676 | ERROR    | open_webui.routers.openai:send_get_request:81 - Connection error: Cannot connect to host api.openai.com:443 ssl:default [None] - {}
2025-04-09 07:35:57.676 | INFO     | open_webui.routers.ollama:get_all_models:300 - get_all_models() - {}
2025-04-09 07:35:57.680 | ERROR    | open_webui.routers.ollama:send_get_request:98 - Connection error: 403, message='Attempt to decode JSON with unexpected mimetype: text/html;charset=utf-8', url='http://localhost:6399/api/tags' - {}

// 添加response output后,发现是squid问题
2025-04-10 00:45:46.166 | INFO     | open_webui.routers.ollama:get_all_models:301 - get_all_models() - {}
Raw response: <bound method ClientResponse.text of <ClientResponse(http://0.0.0.0:6399/api/tags) [403 Forbidden]>
<CIMultiDictProxy('Server': 'squid/5.9', 'Mime-Version': '1.0', 'Date': 'Thu, 10 Apr 2025 00:45:46 GMT', 'Content-Type': 'text/html;charset=utf-8', 'Content-Length': '3830', 'X-Squid-Error': 'ERR_TOO_BIG 0', 'Vary': 'Accept-Language', 'Content-Language': 'en', 'X-Cache': 'MISS from VM-2-3-tencentos', 'X-Cache-Lookup': 'MISS from VM-2-3-tencentos:3128', 'Via': '1.1 VM-2-3-tencentos (squid/5.9)', 'Connection': 'keep-alive')>
>
```

request没到ollama的api,就被squid拦截

5. 上述的debug是根据grok的知识来的
首先找到open-webui的源代码
(python-3.11.11) root@VM-6-30-ubuntu:~/miniforge3/envs/python-3.11.11/lib/python3.11/site-packages/open_webui/routers# pwd
/root/miniforge3/envs/python-3.11.11/lib/python3.11/site-packages/open_webui/routers
根据错误指令,让他看看到底输出的是啥

修改
```ollama.py
async def send_get_request(url, key=None, user: UserModel = None):
    timeout = aiohttp.ClientTimeout(total=AIOHTTP_CLIENT_TIMEOUT_MODEL_LIST)
    try:
        async with aiohttp.ClientSession(timeout=timeout, trust_env=True) as session:
            async with session.get(
                url,
                headers={
                    "Content-Type": "application/json",
                    **({"Authorization": f"Bearer {key}"} if key else {}),
                    **(
                        {
                            "X-OpenWebUI-User-Name": user.name,
                            "X-OpenWebUI-User-Id": user.id,
                            "X-OpenWebUI-User-Email": user.email,
                            "X-OpenWebUI-User-Role": user.role,
                        }
                        if ENABLE_FORWARD_USER_INFO_HEADERS and user
                        else {}
                    ),
                },
            ) as response:
                return await response.json()
    except Exception as e:
        # Handle connection error here
        print(f"Raw response: {response.text}")
        log.error(f"Connection error: {e}")
        return None
```

- 这样就可以开启open-webui
- `open-webui serve`


## 配置ngrok,进行内网穿透
pinggy应该也可以,但没试过

先试着下载
- curl --output ngrok.tgz https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
- 参考 https://dashboard.ngrok.com/get-started/setup/linux
- 如果命令下载不下来,就直接选x86_64,linux的,然后上传上去,跳过了curl下载的过程
- `tar -xvzf ./ngrok.tgz -C /usr/local/bin`
- `ngrok config add-authtoken 2vQuQac8fSn6JVY1RuJiWcy1Ltr_ghGPrQ82WTrJsVxJvUSe`
- `ngrok http 8080`

然后根据ngrok控制台输出,就能够在任意地方访问这个instance上的ollama + open-webui了
