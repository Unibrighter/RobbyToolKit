#!/usr/bin/env bun

/**
 * request-maker.ts
 * HTTP请求构造和发送模块
 */

import { createInterface, Interface } from 'readline';
import { ColorLog, CSVLoader } from './csv-loader.ts';
import type { TransactionData, CSVRecord, CategoryMapping } from './csv-loader.ts';

// 应用配置
interface AppConfig {
  baseUrl: string;
  sessionId?: string;
}

class RequestMaker {
  private config: AppConfig = {
    baseUrl: 'http://10.141.198.56:8888'
  };

  private readline?: Interface;
  private csvLoader = new CSVLoader();

  // 设置readline接口
  public setReadline(rl: Interface): void {
    this.readline = rl;
    this.csvLoader.setReadline(rl);
  }

  // 预定义的分类和商家 (用于测试数据生成)
  private testCategories = [
    { name: '餐饮', category: 'Restaurants & takeaway', id: 'C04A4312-2F80-4566-AF53-875A0DE9C232' },
    { name: '购物', category: 'Groceries', id: '43BD793D-C508-4C4A-BDC1-A31594ABC96C' },
    { name: '交通', category: 'Public transport', id: '1B567814-F7DB-4EDA-964B-D105B0FE4EE1' },
    { name: '娱乐', category: 'Attractions & events', id: '7548ED60-0C18-4953-83CC-2D2A4C24AFD3' },
    { name: '医疗', category: 'Medical', id: 'ABCFB6B8-42C0-4ED7-B12B-E8361AB2C08E' },
    { name: '其他', category: 'Other shopping', id: '3452831F-F7EB-4EE2-9763-687E608ED8D1' }
  ];

  private merchants = [
    'McDonald\'s', 'KFC', 'Subway', 'Starbucks', 'Coles', 'Woolworths', 
    'ALDI', 'Target', 'Kmart', 'JB Hi-Fi', 'Chemist Warehouse', 'Myki'
  ];

  // 提问辅助函数
  private async ask(question: string): Promise<string> {
    if (!this.readline) {
      throw new Error('Readline interface not set');
    }
    return new Promise((resolve) => {
      this.readline!.question(question, resolve);
    });
  }

  // 生成随机测试数据
  private generateRandomTransaction(date?: string): TransactionData {
    const isExpense = Math.random() > 0.2; // 80%概率是支出
    const categoryIndex = Math.floor(Math.random() * this.testCategories.length);
    const testCategory = this.testCategories[categoryIndex]!; // 确保有值
    const merchantIndex = Math.floor(Math.random() * this.merchants.length);
    const merchant = this.merchants[merchantIndex]!; // 确保有值
    
    return {
      mbDate: date || new Date().toISOString().split('T')[0] + 'T00:00:00',
      mbCash: Math.round((Math.random() * 200 + 5) * 100) / 100, // 5-205之间的金额
      inOutType: isExpense ? 'Expense' : 'Income',
      inOutCode: isExpense ? 1 : 0,
      payType: 'Credit Cards',
      mbCategory: testCategory.category,
      subCategory: '',
      mbContent: merchant,
      mbDetailContent: `Random transaction at ${merchant}`,
      assetId: 3,
      mcid: testCategory.id,
      mcscid: ''
    };
  }

  // 手动输入交易数据
  private async inputTransactionManually(): Promise<TransactionData> {
    console.log('\n📝 ' + ColorLog.cyan('手动输入交易数据'));
    console.log(ColorLog.gray('提示：直接回车使用默认值'));
    
    const date = await this.ask('日期 (YYYY-MM-DD, 默认今天): ') || new Date().toISOString().split('T')[0];
    const amount = parseFloat(await this.ask('金额 (默认50.00): ') || '50.00');
    const typeInput = await this.ask('类型 (1=支出, 0=收入, 默认1): ') || '1';
    const isExpense = typeInput === '1';
    
    console.log('\n' + ColorLog.blue('可用分类:'));
    this.testCategories.forEach((cat, index) => {
      console.log(`${ColorLog.yellow((index + 1).toString())}. ${cat.name} (${cat.category})`);
    });
    
    const categoryIndex = parseInt(await this.ask(`选择分类 (1-${this.testCategories.length}, 默认1): `) || '1') - 1;
    const validIndex = categoryIndex >= 0 && categoryIndex < this.testCategories.length ? categoryIndex : 0;
    const selectedTestCategory = this.testCategories[validIndex]!; // 确保有值
    
    const merchant = await this.ask('商家名称 (默认Test Store): ') || 'Test Store';
    const details = await this.ask('详细描述 (默认Test transaction): ') || 'Test transaction';
    const payType = await this.ask('支付方式 (默认Credit Cards): ') || 'Credit Cards';
    
    return {
      mbDate: date + 'T00:00:00',
      mbCash: amount,
      inOutType: isExpense ? 'Expense' : 'Income',
      inOutCode: isExpense ? 1 : 0,
      payType,
      mbCategory: selectedTestCategory.category,
      subCategory: '',
      mbContent: merchant,
      mbDetailContent: details,
      assetId: 3,
      mcid: selectedTestCategory.id,
      mcscid: ''
    };
  }

  // 构造HTTP请求payload
  private buildPayload(data: TransactionData): string {
    const params = new URLSearchParams();
    params.append('mbDate', data.mbDate);
    params.append('mbCash', data.mbCash.toString());
    params.append('inOutType', data.inOutType);
    params.append('inOutCode', data.inOutCode.toString());
    params.append('payType', data.payType);
    params.append('mbCategory', data.mbCategory);
    params.append('subCategory', data.subCategory);
    params.append('mbContent', data.mbContent);
    params.append('mbDetailContent', data.mbDetailContent);
    params.append('assetId', data.assetId.toString());
    params.append('mcid', data.mcid);
    params.append('mcscid', data.mcscid);
    
    // 将加号转换回空格 (保持mbContent的空格分隔)
    return params.toString().replace(/\+/g, ' ');
  }

  // 发送HTTP请求
  public async sendRequest(data: TransactionData): Promise<boolean> {
    const payload = this.buildPayload(data);
    const url = `${this.config.baseUrl}/moneyBook/create`;
    
    console.log('\n🚀 ' + ColorLog.blue('发送请求...'));
    console.log(ColorLog.cyan('URL:'), url);
    console.log(ColorLog.cyan('Payload:'), payload);
    
    // 构造curl命令 (静默模式，只显示响应)
    const curlCommand = [
      'curl',
      `'${url}'`,
      '-H', "'Accept: */*'",
      '-H', "'Content-Type: application/x-www-form-urlencoded; charset=UTF-8'",
      '-H', "'X-Requested-With: XMLHttpRequest'",
      '--data-raw', `'${payload}'`,
      '--insecure',
      '--silent',  // 静默模式，不显示进度信息
      '-w', '"\\nHTTP Status: %{http_code}\\n"'
    ].join(' ');
    
    console.log('\n📋 ' + ColorLog.yellow('执行的curl命令:'));
    console.log(ColorLog.gray(curlCommand));
    
    try {
      const proc = Bun.spawn(['sh', '-c', curlCommand], {
        stdout: 'pipe',
        stderr: 'pipe'
      });
      
      const output = await new Response(proc.stdout).text();
      const error = await new Response(proc.stderr).text();
      
      await proc.exited;
      
      console.log('\n✅ ' + ColorLog.green('响应结果:'));
      console.log(output);
      
      // 只在真正出错时显示错误信息
      if (error && proc.exitCode !== 0) {
        console.log('\n⚠️  ' + ColorLog.yellow('错误信息:'));
        console.log(ColorLog.red(error));
      }
      
      return proc.exitCode === 0;
    } catch (error) {
      console.error('❌ ' + ColorLog.red('请求失败:'), error);
      return false;
    }
  }

  // 设置基础URL (交互式)
  private async setBaseUrl(): Promise<void> {
    console.log('\n🌐 ' + ColorLog.cyan(`当前基础URL: ${this.config.baseUrl}`));
    const newUrl = await this.ask('输入新的基础URL (直接回车保持不变): ');
    
    if (newUrl.trim()) {
      // 移除末尾的斜杠
      this.config.baseUrl = newUrl.replace(/\/$/, '');
      console.log('✅ ' + ColorLog.green(`基础URL已更新为: ${this.config.baseUrl}`));
    }
  }

  // 设置基础URL (程序化)
  public setBaseUrlProgrammatically(baseUrl: string): void {
    this.config.baseUrl = baseUrl.replace(/\/$/, '');
  }

  // 显示主菜单
  private async showMenu(): Promise<void> {
    console.log('\n' + ColorLog.cyan('='.repeat(50)));
    console.log(ColorLog.bold('🚀 Request Maker - Money Manager API 测试工具'));
    console.log(ColorLog.cyan('='.repeat(50)));
    console.log(ColorLog.blue(`📡 当前API地址: ${this.config.baseUrl}/moneyBook/create`));
    console.log('\n' + ColorLog.bold('选择操作:'));
    console.log(ColorLog.yellow('1.') + ' 设置基础URL');
    console.log(ColorLog.yellow('2.') + ' 生成随机测试数据并发送');
    console.log(ColorLog.yellow('3.') + ' 手动输入数据并发送');
    console.log(ColorLog.yellow('4.') + ' 生成指定日期的随机数据');
    console.log(ColorLog.yellow('5.') + ' 测试CSV记录转换');
    console.log(ColorLog.red('0.') + ' 退出');
    console.log('\n' + ColorLog.cyan('='.repeat(50)));
  }

  // 测试CSV记录转换
  private async testCSVConversion(): Promise<void> {
    console.log('\n🧪 ' + ColorLog.cyan('CSV记录转换测试'));
    
    // 示例CSV记录
    const sampleCSV: CSVRecord = {
      Date: '08 Jul 25',
      Amount: '-14.55',
      'Account Number': 'Card ending 0299',
      'Transaction Type': 'PURCHASE AUTHORISATION',
      'Transaction Details': 'Subway King St Melbourne',
      Balance: '-4790.73',
      Category: 'Restaurants & takeaway',
      'Merchant Name': 'Subway (King Street Melbourne)'
    };
    
    console.log('\n' + ColorLog.blue('示例CSV记录:'));
    console.table(sampleCSV);
    
    const unknownCategories = new Set<string>();
    const converted = this.csvLoader.convertCSVRecordToTransaction(sampleCSV, unknownCategories);
    
    console.log('\n' + ColorLog.green('转换后的数据:'));
    console.table(converted);
    
    if (unknownCategories.size > 0) {
      console.log('\n' + ColorLog.yellow('未知分类:'));
      Array.from(unknownCategories).forEach(cat => {
        console.log(ColorLog.yellow(`  • ${cat}`));
      });
    }
    
    const sendTest = await this.ask('是否发送此测试数据? (y/n): ');
    if (sendTest.toLowerCase() === 'y') {
      await this.sendRequest(converted);
    }
  }

  // 主运行循环
  public async run(): Promise<void> {
    console.log('🎯 ' + ColorLog.bold('Request Maker 启动中...'));
    
    // 启动时加载分类映射
    await this.csvLoader.loadCategoryMapping();
    
    while (true) {
      await this.showMenu();
      const choice = await this.ask('请选择 (0-5): ');
      
      switch (choice) {
        case '1':
          await this.setBaseUrl();
          break;
          
        case '2':
          console.log('\n🎲 ' + ColorLog.magenta('生成随机测试数据...'));
          const randomData = this.generateRandomTransaction();
          console.log('\n' + ColorLog.green('生成的数据:'));
          console.table(randomData);
          
          const sendRandom = await this.ask('是否发送此数据? (y/n): ');
          if (sendRandom.toLowerCase() === 'y') {
            await this.sendRequest(randomData);
          }
          break;
          
        case '3':
          const manualData = await this.inputTransactionManually();
          console.log('\n📊 ' + ColorLog.green('输入的数据:'));
          console.table(manualData);
          
          const sendManual = await this.ask('是否发送此数据? (y/n): ');
          if (sendManual.toLowerCase() === 'y') {
            await this.sendRequest(manualData);
          }
          break;
          
        case '4':
          const targetDate = await this.ask('输入日期 (YYYY-MM-DD, 默认今天): ') || new Date().toISOString().split('T')[0];
          const dateData = this.generateRandomTransaction(targetDate + 'T00:00:00');
          console.log('\n📅 ' + ColorLog.green('生成的指定日期数据:'));
          console.table(dateData);
          
          const sendDate = await this.ask('是否发送此数据? (y/n): ');
          if (sendDate.toLowerCase() === 'y') {
            await this.sendRequest(dateData);
          }
          break;
          
        case '5':
          await this.testCSVConversion();
          break;
          
        case '0':
          console.log('\n👋 ' + ColorLog.green('再见！'));
          if (this.readline) {
            this.readline.close();
          }
          process.exit(0);
          
        default:
          console.log('❌ ' + ColorLog.red('无效选择，请重试'));
      }
      
      await this.ask('\n' + ColorLog.gray('按回车键继续...'));
    }
  }
}

// 模块导出
export { RequestMaker };
export type { TransactionData };

// 直接运行时启动demo
if (import.meta.main) {
  const requestMaker = new RequestMaker();
  requestMaker.run().catch(console.error);
} 