#!/usr/bin/env bun

/**
 * csv-loader.ts
 * CSV文件加载、解析和数据转换模块
 */

import { readFile } from 'fs/promises';
import { createInterface, Interface } from 'readline';
import { createReadStream } from 'fs';

// 简单的颜色日志工具 (从request-maker.ts移过来)
class ColorLog {
  static red(text: string): string { return `\x1b[31m${text}\x1b[0m`; }
  static green(text: string): string { return `\x1b[32m${text}\x1b[0m`; }
  static yellow(text: string): string { return `\x1b[33m${text}\x1b[0m`; }
  static blue(text: string): string { return `\x1b[34m${text}\x1b[0m`; }
  static magenta(text: string): string { return `\x1b[35m${text}\x1b[0m`; }
  static cyan(text: string): string { return `\x1b[36m${text}\x1b[0m`; }
  static gray(text: string): string { return `\x1b[90m${text}\x1b[0m`; }
  static bold(text: string): string { return `\x1b[1m${text}\x1b[0m`; }
}

// CSV记录接口 (银行导出的原始数据)
interface CSVRecord {
  Date: string;
  Amount: string;
  'Account Number': string;
  'Transaction Type': string;
  'Transaction Details': string;
  Balance: string;
  Category: string;
  'Merchant Name': string;
}

// 交易数据类型定义
interface TransactionData {
  mbDate: string;          // 日期 (ISO格式)
  mbCash: number;          // 金额 (绝对值)
  inOutType: 'Expense' | 'Income';  // 收支类型
  inOutCode: 0 | 1;        // 收支代码 (0=收入, 1=支出)
  payType: string;         // 支付方式
  mbCategory: string;      // 分类
  subCategory: string;     // 子分类
  mbContent: string;       // 商家名称
  mbDetailContent: string; // 详细内容 (用作tag)
  assetId: number;         // 资产ID
  mcid: string;           // 分类ID
  mcscid: string;         // 子分类ID
}

// 分类映射接口
interface CategoryMapping {
  mbCategory: string;
  mcid: string;
}

// 分类映射配置
interface CategoryConfig {
  categories: CategoryMapping[];
}

// 处理报告接口
interface ProcessingReport {
  totalProcessed: number;
  successful: number;
  failed: number;
  unknownCategories: Set<string>;
  errors: string[];
}

// CSV处理结果
interface CSVProcessingResult {
  transactions: TransactionData[];
  report: ProcessingReport;
}

class CSVLoader {
  // 分类映射数据
  private categoryMap: Map<string, CategoryMapping> = new Map();
  private uncategorisedMapping: CategoryMapping = {
    mbCategory: 'Uncategorised',
    mcid: 'B2D7DE8F-39C7-4CF6-A1AB-43785E3AB0F0'
  };

  private readline?: Interface;

  // 设置readline接口
  public setReadline(rl: Interface): void {
    this.readline = rl;
  }

  // 提问辅助函数
  private async ask(question: string): Promise<string> {
    if (!this.readline) {
      throw new Error('Readline interface not set');
    }
    return new Promise((resolve) => {
      this.readline!.question(question, resolve);
    });
  }

  // 加载分类映射配置
  public async loadCategoryMapping(): Promise<void> {
    try {
      const configData = await readFile('category-map.json', 'utf-8');
      const config: CategoryConfig = JSON.parse(configData);
      
      // 构建分类映射Map
      this.categoryMap.clear();
      config.categories.forEach(category => {
        this.categoryMap.set(category.mbCategory, category);
      });
      
      console.log(ColorLog.green(`✅ 已加载 ${this.categoryMap.size} 个分类映射`));
    } catch (error) {
      console.log(ColorLog.yellow('⚠️  无法加载分类映射配置，使用默认设置'));
      console.log(ColorLog.gray(`错误: ${error}`));
    }
  }

  // 根据分类名称获取映射
  private getCategoryMapping(categoryName: string): CategoryMapping {
    const mapping = this.categoryMap.get(categoryName);
    if (mapping) {
      return mapping;
    }
    
    // 如果找不到，返回未分类
    return this.uncategorisedMapping;
  }

  // 提取账户卡号尾号
  private extractCardNumber(accountNumber: string): string {
    // 从 "Card ending 0299" 或类似格式中提取尾号
    const match = accountNumber.match(/(\d{4})/);
    return match && match[1] ? match[1] : '';
  }

  // 将CSV记录转换为TransactionData
  public convertCSVRecordToTransaction(csvRecord: CSVRecord, unknownCategories: Set<string>): TransactionData {
    // 解析日期
    const dateStr = csvRecord.Date.trim();
    let mbDate: string;
    
    try {
      // 处理 "08 Jul 25" 格式
      const parts = dateStr.split(' ');
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        const day = parts[0].padStart(2, '0');
        const monthMap: { [key: string]: string } = {
          'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
          'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
          'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
        };
        const monthKey = parts[1];
        const month = monthKey ? monthMap[monthKey] || '01' : '01';
        const year = '20' + parts[2];
        mbDate = `${year}-${month}-${day}T00:00:00`;
      } else {
        mbDate = new Date().toISOString().split('T')[0] + 'T00:00:00';
      }
    } catch {
      mbDate = new Date().toISOString().split('T')[0] + 'T00:00:00';
    }

    // 解析金额
    const amount = Math.abs(parseFloat(csvRecord.Amount.replace(',', '')) || 0);
    const isExpense = csvRecord.Amount.startsWith('-');

    // 获取分类映射
    const categoryName = csvRecord.Category.trim() || 'Uncategorised';
    const categoryMapping = this.getCategoryMapping(categoryName);
    
    // 如果是未知分类，记录下来
    if (categoryMapping === this.uncategorisedMapping && categoryName !== 'Uncategorised') {
      unknownCategories.add(categoryName);
    }

    // 提取卡号尾号作为tag
    const cardNumber = this.extractCardNumber(csvRecord['Account Number']);
    const mbDetailContent = cardNumber; // 目前只放卡号，未来可以用逗号分隔添加其他tag

    return {
      mbDate,
      mbCash: amount,
      inOutType: isExpense ? 'Expense' : 'Income',
      inOutCode: isExpense ? 1 : 0,
      payType: 'Credit Cards', // 默认信用卡
      mbCategory: categoryMapping.mbCategory,
      subCategory: '', // 暂不使用子分类
      mbContent: csvRecord['Merchant Name'] || csvRecord['Transaction Details'] || 'Unknown merchant',
      mbDetailContent, // 使用卡号作为tag
      assetId: 3, // 默认资产ID
      mcid: categoryMapping.mcid,
      mcscid: '' // 默认为空，暂不使用子分类
    };
  }

  // 解析CSV文件
  public async loadCSVFile(filePath: string): Promise<CSVProcessingResult> {
    const report: ProcessingReport = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      unknownCategories: new Set<string>(),
      errors: []
    };

    const transactions: TransactionData[] = [];

    try {
      console.log(ColorLog.blue('📂 读取CSV文件...'));
      const csvContent = await readFile(filePath, 'utf-8');
      const lines = csvContent.split('\n');
      
      if (lines.length < 2) {
        throw new Error('CSV文件格式错误或为空');
      }

      // 解析CSV头部
      const firstLine = lines[0];
      if (!firstLine) {
        throw new Error('CSV文件为空');
      }
      const headers = firstLine.split(',');
      console.log(ColorLog.cyan('📋 CSV列名:'), headers);

      // 处理数据行
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue; // 跳过空行
        
        const trimmedLine = line.trim();
        if (!trimmedLine) continue; // 跳过空行

        report.totalProcessed++;

        try {
          // 简单的CSV解析 (不处理复杂的引号转义)
          const values = trimmedLine.split(',');
          
          if (values.length < headers.length) {
            report.errors.push(`第${i + 1}行数据不完整`);
            report.failed++;
            continue;
          }

                     // 构建CSV记录对象
           const csvRecord: CSVRecord = {
             'Date': (values[0] || '').trim(),
             'Amount': (values[1] || '').trim(),
             'Account Number': (values[2] || '').trim(),
             'Transaction Type': (values[4] || '').trim(),
             'Transaction Details': (values[5] || '').trim(),
             'Balance': (values[6] || '').trim(),
             'Category': (values[7] || '').trim(),
             'Merchant Name': (values[8] || '').trim()
           };

          // 转换为交易数据
          const transaction = this.convertCSVRecordToTransaction(csvRecord, report.unknownCategories);
          transactions.push(transaction);
          report.successful++;

        } catch (error) {
          report.errors.push(`第${i + 1}行处理失败: ${error}`);
          report.failed++;
        }
      }

      console.log(ColorLog.green(`✅ CSV处理完成: ${report.successful}/${report.totalProcessed} 条记录成功`));

    } catch (error) {
      report.errors.push(`文件读取失败: ${error}`);
      console.log(ColorLog.red('❌ CSV文件读取失败:'), error);
    }

    return { transactions, report };
  }

  // 生成处理报告
  public generateReport(report: ProcessingReport): void {
    console.log('\n' + ColorLog.bold('📊 CSV处理报告'));
    console.log('='.repeat(50));
    console.log(ColorLog.green(`✅ 处理总数: ${report.totalProcessed}`));
    console.log(ColorLog.green(`✅ 成功: ${report.successful}`));
    if (report.failed > 0) {
      console.log(ColorLog.red(`❌ 失败: ${report.failed}`));
    }
    
    if (report.unknownCategories.size > 0) {
      console.log('\n' + ColorLog.yellow('⚠️  未知分类 (已归类为Uncategorised):'));
      Array.from(report.unknownCategories).forEach(category => {
        console.log(ColorLog.yellow(`  • ${category}`));
      });
      console.log('\n' + ColorLog.cyan('💡 建议: 请在category-map.json中添加这些分类的映射'));
    }
    
    if (report.errors.length > 0) {
      console.log('\n' + ColorLog.red('❌ 错误列表:'));
      report.errors.slice(0, 10).forEach((error, index) => { // 只显示前10个错误
        console.log(ColorLog.red(`  ${index + 1}. ${error}`));
      });
      if (report.errors.length > 10) {
        console.log(ColorLog.gray(`  ... 还有 ${report.errors.length - 10} 个错误`));
      }
    }
    console.log('='.repeat(50));
  }

  // 交互式文件选择
  private async selectCSVFile(): Promise<string> {
    if (!this.readline) {
      console.log(ColorLog.yellow('使用默认示例文件 (无交互模式)'));
      return 'reference/transactions_example.csv';
    }
    
    console.log('\n' + ColorLog.cyan('📁 请选择CSV文件:'));
    console.log('1. reference/transactions_example.csv (示例文件)');
    console.log('2. reference/Transactions_90days.csv (90天数据)');
    console.log('3. 手动输入文件路径');
    
    const choice = await this.ask('请选择 (1-3): ');
    
    switch (choice) {
      case '1':
        return 'reference/transactions_example.csv';
      case '2':
        return 'reference/Transactions_90days.csv';
      case '3':
        return await this.ask('请输入CSV文件路径: ');
      default:
        console.log(ColorLog.yellow('使用默认示例文件'));
        return 'reference/transactions_example.csv';
    }
  }

  // 显示演示菜单
  private async showDemoMenu(): Promise<void> {
    console.log('\n' + ColorLog.cyan('='.repeat(50)));
    console.log(ColorLog.bold('📊 CSV Loader - CSV文件处理工具'));
    console.log(ColorLog.cyan('='.repeat(50)));
    console.log('\n' + ColorLog.bold('选择操作:'));
    console.log(ColorLog.yellow('1.') + ' 加载并处理CSV文件');
    console.log(ColorLog.yellow('2.') + ' 测试单条CSV记录转换');
    console.log(ColorLog.yellow('3.') + ' 重新加载分类映射');
    console.log(ColorLog.red('0.') + ' 退出');
    console.log('\n' + ColorLog.cyan('='.repeat(50)));
  }

  // 测试单条CSV记录转换
  private async testSingleRecord(): Promise<void> {
    console.log('\n🧪 ' + ColorLog.cyan('单条CSV记录转换测试'));
    
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
    const converted = this.convertCSVRecordToTransaction(sampleCSV, unknownCategories);
    
    console.log('\n' + ColorLog.green('转换后的数据:'));
    console.table(converted);
    
    if (unknownCategories.size > 0) {
      console.log('\n' + ColorLog.yellow('未知分类:'));
      Array.from(unknownCategories).forEach(cat => {
        console.log(ColorLog.yellow(`  • ${cat}`));
      });
    }
  }

  // 演示运行循环
  public async runDemo(): Promise<void> {
    console.log('🎯 ' + ColorLog.bold('CSV Loader 启动中...'));
    
    // 启动时加载分类映射
    await this.loadCategoryMapping();
    
    while (true) {
      await this.showDemoMenu();
      const choice = await this.ask('请选择 (0-3): ');
      
      switch (choice) {
        case '1':
          const filePath = await this.selectCSVFile();
          console.log(ColorLog.blue(`\n📂 处理文件: ${filePath}`));
          
          const result = await this.loadCSVFile(filePath);
          this.generateReport(result.report);
          
          if (result.transactions.length > 0) {
            console.log('\n' + ColorLog.green('前5条转换结果预览:'));
            result.transactions.slice(0, 5).forEach((transaction, index) => {
              console.log(ColorLog.cyan(`\n--- 记录 ${index + 1} ---`));
              console.table(transaction);
            });
          }
          break;
          
        case '2':
          await this.testSingleRecord();
          break;
          
        case '3':
          await this.loadCategoryMapping();
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
      
      if (this.readline) {
        await this.ask('\n' + ColorLog.gray('按回车键继续...'));
      }
    }
  }
}

// 模块导出
export { CSVLoader, ColorLog };
export type { TransactionData, CSVRecord, CategoryMapping, ProcessingReport, CSVProcessingResult };

// 直接运行时启动demo
if (import.meta.main) {
  const csvLoader = new CSVLoader();
  csvLoader.runDemo().catch(console.error);
}
