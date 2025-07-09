# CSV 导入 MoneyManager 项目概览

平时记账时,都是在Internet Banking查阅账单.
再手工一条条导入Money Mgr.这个iOS App,非常痛苦.

## 自动化解决方案
1. Money Mgr. 这个iOS应用有一个Desktop Manager功能.启用后会创建一个HTTP服务.
2. 访问这个http服务,就能够通过web UI进行transaction item条目的增删改查.
3. 通过browser的network traffic log,我们能够抓取并构造自己的http请求.
4. 遍历从银行导出的流水CSV文件,根据步骤3.中获取的http请求.将csv中每一行数据对应成payload,并构造http请求.
5. 简单来说,流程是: csv遍历 -> 构造payload -> 构造http request -> 发送请求至Money Mgr. 后台服务 -> 数据入库.

## 需求分析

### 输入数据格式 (CSV)
```
Date,Amount,Account Number,,Transaction Type,Transaction Details,Balance,Category,Merchant Name
08 Jul 25,-14.55,Card ending 0299, ,PURCHASE AUTHORISATION,Subway King St Melbourne,-4790.73,Restaurants & takeaway,Subway (King Street Melbourne)
```

### 输出API格式 (Money Manager)
```
POST http://IP:8888/moneyBook/create
Content-Type: application/x-www-form-urlencoded

mbDate=2025-07-09T00:00:00&mbCash=99.99&inOutType=Expense&inOutCode=1&payType=Credit%20Cards&mbCategory=%E5%85%AC%E5%85%B1%20%7C%20%E7%BD%9A%E5%8D%95&subCategory=&mbContent=test%20event%20transaction&mbDetailContent=test%20details%20&assetId=3&mcid=CE80D16F-3CDA-43DE-9EEE-85826767DBAB&mcscid=
```

### 数据映射关系
| CSV字段 | Money Manager API字段 | 转换规则 |
|---------|----------------------|----------|
| Date | mbDate | 转换为ISO格式 (2025-07-09T00:00:00) |
| Amount | mbCash | 取绝对值 |
| Amount | inOutType | 负数=Expense, 正数=Income |
| Amount | inOutCode | 负数=1, 正数=0 |
| Merchant Name | mbContent | 直接使用 |
| Transaction Details | mbDetailContent | 直接使用 |
| Category | mbCategory | 需要映射到Money Manager分类 |

## 开发进度

### ✅ 阶段1: 核心模块开发 (已完成)
1. **csv-loader.ts** ✅
   - ✅ 读取CSV文件
   - ✅ 解析CSV数据为JSON数组
   - ✅ 分类映射 (通过category-map.json)
   - ✅ 卡号尾号提取 (作为tag)
   - ✅ 交互式文件选择
   - ✅ 颜色日志支持
   - ✅ 错误处理和报告

2. **request-maker.ts** ✅
   - ✅ HTTP请求构造
   - ✅ 请求发送功能 (curl命令)
   - ✅ 交互式测试菜单
   - ✅ 随机数据生成
   - ✅ 手动数据输入
   - ✅ CSV转换测试
   - ✅ 颜色日志支持

3. **main.ts** ✅
   - ✅ 整合两个模块
   - ✅ 交互式CLI界面
   - ✅ 批量处理流程
   - ✅ 配置管理
   - ✅ 进度追踪和报告
   - ✅ 错误重试机制

### 📊 数据映射实现
- ✅ **默认参数**: assetId=3, mcscid=''
- ✅ **商家名称**: CSV Merchant Name → mbContent
- ✅ **标签功能**: 卡号尾号 → mbDetailContent (如"0299, 0570")
- ✅ **分类映射**: 25个预配置分类 + 未知分类自动归为Uncategorised
- ✅ **日期解析**: "08 Jul 25" → "2025-07-08T00:00:00"
- ✅ **金额处理**: 负数自动识别为支出

### ✅ 项目状态: 核心功能已完成！
**第一阶段 - 核心功能**: ✅ 已完成
- ✅ CSV解析和数据转换
- ✅ HTTP请求构造和发送
- ✅ 主程序集成和批量处理
- ✅ 交互式CLI界面
- ✅ 错误重试和进度追踪
- ✅ 完整的导入报告

**可选的后续优化**:
- 📄 配置文件支持 (目前使用交互式配置)
- 🔒 认证信息管理
- ⚡ 性能优化 (并发处理)
- 📊 详细日志记录

## 项目技术栈
整个项目为typescript项目,每一个module都对应一个typescript,同时有自己的main入口.
没有单元测试,但是每一个module都能够有自己的demo示例.

### 开发环境
- **bun**: 运行时和包管理器
- **typescript**: 类型安全的JavaScript
- **无第三方依赖**: 使用Node.js内置模块

### 模块说明
- **csv-loader.ts**: 用来加载,遍历csv文件的模块. 运行bun csv-loader.ts则展示一个互动demo菜单.
- **request-maker.ts**: 将某一条csv记录,对应生成payload,并构造http请求的模块. 运行bun request-maker.ts则展示一个互动demo菜单.
- **main.ts**: 真正的主程序入口. 调用`csv-loader` 和`request-maker`两个模块,展示互动菜单,完成导入操作.

## 使用说明

### 🎯 正式使用 (推荐)
```bash
# 运行主程序 - 完整的批量导入工具
bun main.ts
```
**主程序提供完整的交互式界面，包括文件选择、配置管理、批量导入和详细报告。**

### 🧪 模块测试 (开发调试)
```bash
# 测试CSV处理模块
bun csv-loader.ts

# 测试HTTP请求模块  
bun request-maker.ts
```

### 📖 使用流程
1. **启动主程序**: `bun main.ts`
2. **选择操作**: 
   - 选择1进行完整批量导入
   - 选择2预览CSV文件内容
   - 选择3配置API地址和批处理参数
3. **文件选择**: 选择要导入的CSV文件
4. **确认配置**: 检查API地址、批处理大小等设置
5. **开始导入**: 确认后自动批量发送数据
6. **查看报告**: 导入完成后查看详细的成功率和错误报告

## 功能演示

### CSV Loader 功能
- 📂 加载CSV文件 (支持示例文件和自定义路径)
- 🏷️ 自动提取卡号尾号作为标签
- 🗂️ 分类映射 (25个预配置分类)
- 📊 处理报告和未知分类提醒
- 🎨 色彩界面

### Request Maker 功能  
- 🌐 可配置API地址
- 🎲 随机测试数据生成
- ✍️ 手动数据输入
- 🧪 CSV转换测试
- 🚀 HTTP请求发送 (curl)
- 📋 完整日志输出

### Main App 主程序功能 ⭐
- 🚀 **批量导入** - 完整的CSV到Money Manager导入流程
- 📋 **CSV预览** - 解析并预览CSV文件内容，不发送请求
- ⚙️ **配置管理** - 交互式设置API地址、批处理大小、重试次数等
- 🧪 **模块测试** - 独立测试CSV加载或HTTP请求模块
- 📈 **进度追踪** - 实时显示批量处理进度和统计信息
- 🔄 **智能重试** - 自动重试失败的请求，支持可配置重试次数
- 📊 **详细报告** - 完成后生成包含时间、成功率、错误详情的完整报告
- ⚠️ **分类提醒** - 识别并提醒用户处理未知分类
- 🎨 **友好界面** - 彩色CLI界面，支持交互式操作

## 参考文件
[curl http request example 1](./reference/curl-example-1.sh)
[curl http request example 2](./reference/curl-example-2.sh)
[transactions csv example](./reference/transactions_example.csv)
[90天完整交易数据](./reference/Transactions_90days.csv)