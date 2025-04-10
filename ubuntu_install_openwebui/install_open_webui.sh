
#!/bin/bash

# 遇到错误时退出脚本
set -e

# 检查并设置 Conda
setup_conda() {
    # 如果 conda 命令不可用，但目录存在
    if [ -d "$HOME/miniconda" ]; then
        echo "检测到已存在的 Miniconda 安装，正在配置..."
        # 添加到 PATH
        export PATH="$HOME/miniconda/bin:$PATH"
        
        # 初始化 bash 和 conda
        if [ ! -f "$HOME/.bashrc" ] || ! grep -q "conda initialize" "$HOME/.bashrc"; then
            "$HOME/miniconda/bin/conda" init bash
            source "$HOME/.bashrc"
        fi
    else
        echo "正在安装 Miniconda..."
        # 下载 Miniconda 安装脚本
        wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O miniconda.sh
        # 安装 Miniconda
        bash miniconda.sh -b -p "$HOME/miniconda"
        
        # 初始化 bash 和 conda
        export PATH="$HOME/miniconda/bin:$PATH"
        "$HOME/miniconda/bin/conda" init bash
        source "$HOME/.bashrc"
    fi
}

# 生成随机密钥的函数
generate_secret_key() {
    python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
}

# 显示脚本用法
usage() {
    echo "用法: $0 [--no-ollama] [--no-download]"
    echo "  --no-ollama: 跳过 Ollama 安装"
    echo "  --no-download: 跳过下载 Open WebUI 代码（如果已经下载）"
    exit 1
}

# 解析参数
SKIP_OLLAMA=false
SKIP_DOWNLOAD=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-ollama)
            SKIP_OLLAMA=true
            shift
            ;;
        --no-download)
            SKIP_DOWNLOAD=true
            shift
            ;;
        *)
            usage
            ;;
    esac
done

echo "开始安装 Open WebUI..."

# 更新系统包
echo "更新系统包..."
if command -v apt-get &> /dev/null; then
    apt-get update
    apt-get upgrade -y
fi

# 安装基本依赖
echo "安装基本依赖..."
apt-get install -y python3 python3-pip git curl python3-venv build-essential || { echo "安装依赖失败"; exit 1; }

# 安装 Node.js
echo "安装 Node.js..."
if ! command -v node &> /dev/null; then
    echo "安装 Node.js 20 LTS..."
    # 添加 NodeSource 仓库
    if [ ! -f "/etc/apt/sources.list.d/nodesource.list" ]; then
        echo "添加 NodeSource 仓库..."
        curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /usr/share/keyrings/nodesource.gpg
        echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
        apt-get update
    fi
    
    # 安装 Node.js
    apt-get install -y nodejs

    # 验证安装
    if ! command -v node &> /dev/null; then
        echo "Node.js 安装失败"
        exit 1
    fi
fi

# 显示 Node.js 版本
echo "Node.js 版本："
node --version
echo "npm 版本："
npm --version

# 安装 Ollama（如果不跳过）
if [[ "$SKIP_OLLAMA" = false ]]; then
    echo "安装 Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh || { echo "Ollama 安装失败"; exit 1; }
    systemctl enable ollama
    systemctl start ollama
else
    echo "跳过 Ollama 安装。"
fi

# 检查 CUDA 环境
check_cuda() {
    echo "检查 CUDA 环境..."
    if ! command -v nvidia-smi &> /dev/null; then
        echo "警告: 未检测到 NVIDIA GPU 驱动"
        return 1
    else
        echo "GPU 信息:"
        nvidia-smi --query-gpu=gpu_name,driver_version,memory.total,memory.free,memory.used,temperature.gpu --format=csv,noheader
        return 0
    fi
}


# 检查是否已经在虚拟环境中
if [ -z "$VIRTUAL_ENV" ]; then
    # 如果不在虚拟环境中，则检查并设置 Conda
    if ! command -v conda &> /dev/null; then
        echo "Conda 未安装或不在 PATH 中，正在设置..."
        setup_conda
    fi

    # 再次检查 conda 是否可用
    if ! command -v conda &> /dev/null; then
        echo "Conda 安装失败，请手动安装 Conda 后重试"
        exit 1
    fi

    # 确保 conda 命令可用
    source "$HOME/.bashrc"
    eval "$(conda shell.bash hook)"

    检查并删除已存在的环境
    if conda env list | grep -q "^open-webui "; then
        echo "删除已存在的 open-webui 环境..."
        conda deactivate
        conda env remove open-webui -y
    fi

    # 创建并激活 Python 3.11 环境
    echo "创建 Python 3.11 环境..."
    conda create -n open-webui python=3.11
    source activate open-webui || conda activate open-webui
else
    echo "检测到已存在的虚拟环境: $VIRTUAL_ENV"
    echo "跳过创建新环境..."
fi

# 验证 Python 环境
echo "验证 Python 环境..."
which python
python --version

# 创建安装目录
echo "设置 Open WebUI 安装目录..."
INSTALL_DIR="/opt/open-webui"
mkdir -p "$INSTALL_DIR"

# 下载或更新 Open WebUI
if [[ "$SKIP_DOWNLOAD" = false ]]; then
    echo "下载 Open WebUI..."
    if [ -d "$INSTALL_DIR/open-webui" ]; then
        echo "更新 Open WebUI..."
        cd "$INSTALL_DIR/open-webui"
        git pull
    else
        echo "克隆 Open WebUI..."
        cd "$INSTALL_DIR"
        git clone https://github.com/open-webui/open-webui.git
    fi
else
    echo "跳过下载 Open WebUI..."
    if [ ! -d "$INSTALL_DIR/open-webui" ]; then
        echo "错误：Open WebUI 目录不存在于 $INSTALL_DIR/open-webui"
        echo "请确保目录存在或移除 --no-download 选项"
        exit 1
    fi
fi

# 设置权限
echo "设置目录权限..."
chown -R $USER:$USER "$INSTALL_DIR"

# 进入项目目录
cd "$INSTALL_DIR/open-webui"

# 安装系统依赖
echo "安装系统依赖..."
if command -v apt-get &> /dev/null; then
    apt-get update
    apt-get install -y ffmpeg
elif command -v yum &> /dev/null; then
    yum install -y ffmpeg
elif command -v pacman &> /dev/null; then
    pacman -S --noconfirm ffmpeg
elif command -v apk &> /dev/null; then
    apk add --no-cache ffmpeg
else
    echo "警告: 无法识别的包管理器，请手动安装 ffmpeg"
fi

# 构建前端
echo "构建前端..."
cd /opt/open-webui/open-webui

echo "清理旧的构建文件..."
rm -rf node_modules package-lock.json

echo "配置 npm..."
npm config set registry https://registry.npmmirror.com
npm config set fetch-retries 5
npm config set fetch-timeout 60000
npm config set progress true
npm config set loglevel info

echo "安装前端依赖..."
# 使用 pnpm 或 npm 安装依赖
if command -v pnpm &> /dev/null; then
    echo "使用 pnpm 安装依赖..."
    # 配置 pnpm 使用淘宝镜像
    pnpm config set registry https://registry.npmmirror.com
    pnpm install --reporter=default
else
    echo "使用 npm 安装依赖..."
    npm install --verbose
fi

# 构建前端
echo "构建前端..."
if command -v pnpm &> /dev/null; then
    pnpm run build --reporter=default
else
    npm run build --verbose
fi

# 检查构建结果
if [ -d "build" ]; then
    echo "前端构建成功！"
else
    echo "前端构建失败，请检查错误信息"
    exit 1
fi

# 初始化数据库
echo "初始化数据库..."
cd backend
export PYTHONPATH=/opt/open-webui/open-webui/backend

# 运行数据库迁移
echo "运行数据库迁移..."
if [ -f "open_webui/alembic.ini" ]; then
    cd open_webui
    echo "当前目录: $(pwd)"
    echo "运行迁移..."
    alembic upgrade head
    cd ..
else
    echo "在以下位置搜索 alembic.ini:"
    find . -name "alembic.ini" -type f
    echo "错误: 找不到 alembic.ini"
    exit 1
fi

# 确保 .webui_secret_key 存在
if [ ! -f ".webui_secret_key" ]; then
    echo "生成 secret key..."
    head -c 12 /dev/random | base64 > .webui_secret_key
fi

# 设置环境变量
export WEBUI_SECRET_KEY=$(cat .webui_secret_key)
export PORT=8111
export HOST=0.0.0.0

# 启动服务
if command -v gunicorn &> /dev/null; then
    echo "使用 gunicorn 启动..."
    gunicorn -w 1 -k uvicorn.workers.UvicornWorker "open_webui.main:app" \
        --bind 0.0.0.0:8111 \
        --timeout 300 \
        --log-level debug \
        --error-logfile - \
        --capture-output &
    
    # 保存进程 ID
    GUNICORN_PID=$!
    echo "Gunicorn PID: $GUNICORN_PID"
else
    echo "使用 uvicorn 启动..."
    python -m uvicorn "open_webui.main:app" \
        --host 0.0.0.0 \
        --port 8111 \
        --log-level debug &
    
    # 保存进程 ID
    UVICORN_PID=$!
    echo "Uvicorn PID: $UVICORN_PID"
fi

# 等待后端启动
echo "等待服务启动..."
for i in {1..30}; do
    if curl -s http://localhost:8111/health > /dev/null; then
        echo "服务已启动成功！"
        echo "请访问 http://localhost:8111"
        break
    fi
    
    # 检查进程是否还在运行
    if [ ! -z "$GUNICORN_PID" ] && ! ps -p $GUNICORN_PID > /dev/null; then
        echo "错误: Gunicorn 进程已退出"
        break
    fi
    if [ ! -z "$UVICORN_PID" ] && ! ps -p $UVICORN_PID > /dev/null; then
        echo "错误: Uvicorn 进程已退出"
        break
    fi
    
    echo "尝试 $i/30..."
    sleep 1
done

# 如果服务没有启动，显示调试信息
if ! curl -s http://localhost:8111/health > /dev/null; then
    echo "服务启动失败，显示调试信息:"
    echo "Python 路径: $PYTHONPATH"
    echo "当前目录: $(pwd)"
    echo "Python 版本: $(python --version)"
    echo "已安装的包:"
    pip list
    echo "目录内容:"
    ls -la
    echo "open_webui 目录内容:"
    ls -la open_webui/
    echo "进程状态:"
    ps aux | grep -E "gunicorn|uvicorn"
    echo "端口状态:"
    netstat -tuln | grep 8111
    echo "日志内容:"
    tail 50 /var/log/syslog | grep -E "gunicorn|uvicorn|open_webui"
fi

# 创建系统服务
echo "创建系统服务..."
tee /etc/systemd/system/open-webui-backend.service << EOL
[Unit]
Description=Open WebUI Backend
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/open-webui/open-webui/backend
ExecStart=/opt/open-webui/open-webui/venv/bin/gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:8111
Environment="PATH=/opt/open-webui/open-webui/venv/bin"
Restart=on-failure
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=open-webui-backend

[Install]
WantedBy=multi-user.target
EOL

# 启动并启用服务
echo "启动 Open WebUI 服务..."
systemctl daemon-reload
systemctl enable open-webui-backend
systemctl start open-webui-backend

# 配置防火墙
echo "配置防火墙..."
ufw allow 8111/tcp

echo "安装成功完成！"
echo "您现在可以通过 http://localhost:8111 访问 Open WebUI。"
echo "首次访问时，请创建一个管理员账户。"

