#!/usr/bin/env bun

/**
 * main.ts
 * CSV到Money Manager批量导入主程序
 */

import { createInterface } from 'readline';
import { CSVLoader, ColorLog } from './csv-loader.ts';
import { RequestMaker } from './request-maker.ts';
import type { TransactionData, ProcessingReport, CSVProcessingResult } from './csv-loader.ts';

// 批量处理配置
interface BatchConfig {
  batchSize: number;        // 批处理大小
  delayMs: number;          // 请求间隔(毫秒)
  maxRetries: number;       // 最大重试次数
  baseUrl: string;          // API基础地址
}

// 批量处理报告
interface BatchReport {
  totalRecords: number;
  processedRecords: number;
  successfulRequests: number;
  failedRequests: number;
  skippedRecords: number;
  unknownCategories: Set<string>;
  errors: string[];
  startTime: Date;
  endTime?: Date;
  duration?: number;
}

class MainApp {
  private csvLoader = new CSVLoader();
  private requestMaker = new RequestMaker();
  private readline = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  private config: BatchConfig = {
    batchSize: 1000,        // 最大化批处理大小
    delayMs: 0,             // 移除延时
    maxRetries: 3,
    baseUrl: 'http://10.141.198.56:8888'
  };

  // 提问辅助函数
  private async ask(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.readline.question(question, resolve);
    });
  }

  // 延时函数
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 显示欢迎信息
  private showWelcome(): void {
    console.log('\n' + ColorLog.cyan('='.repeat(60)));
    console.log(ColorLog.bold('🎯 CSV to Money Manager - 批量导入工具'));
    console.log(ColorLog.cyan('='.repeat(60)));
    console.log(ColorLog.gray('将银行CSV交易记录批量导入到Money Manager应用'));
    console.log('\n' + ColorLog.blue('功能特点:'));
    console.log('📊 ' + ColorLog.green('智能分类映射') + ' - 自动识别25种交易分类');
    console.log('🏷️ ' + ColorLog.green('卡号标签') + ' - 自动提取卡号尾号作为标签');
    console.log('🔄 ' + ColorLog.green('批量处理') + ' - 支持大量数据的稳定导入');
    console.log('⚡ ' + ColorLog.green('错误重试') + ' - 自动重试失败的请求');
    console.log('📈 ' + ColorLog.green('进度追踪') + ' - 实时显示处理进度');
    console.log(ColorLog.cyan('='.repeat(60)));
  }

  // 配置设置菜单
  private async configureSettings(): Promise<void> {
    console.log('\n⚙️ ' + ColorLog.cyan('导入配置'));
    console.log(ColorLog.gray('当前配置:'));
    console.log(`🌐 API地址: ${ColorLog.blue(this.config.baseUrl)}`);
    console.log(`🔄 最大重试: ${ColorLog.yellow(this.config.maxRetries.toString())} 次`);
    console.log(`⚡ 处理模式: ${ColorLog.green('最大化速度 - 无延时线性处理')}`);
    
    const changeConfig = await this.ask('\n是否修改配置? (y/n): ');
    if (changeConfig.toLowerCase() !== 'y') return;

    const newBaseUrl = await this.ask(`API地址 (当前: ${this.config.baseUrl}): `);
    if (newBaseUrl.trim()) {
      this.config.baseUrl = newBaseUrl.replace(/\/$/, '');
      // 同时更新RequestMaker的baseUrl
      this.requestMaker.setBaseUrlProgrammatically(this.config.baseUrl);
    }

    const newRetries = await this.ask(`最大重试次数 (当前: ${this.config.maxRetries}): `);
    if (newRetries.trim()) {
      const retries = parseInt(newRetries);
      if (retries >= 0 && retries <= 10) {
        this.config.maxRetries = retries;
      }
    }

    console.log('\n✅ ' + ColorLog.green('配置已更新'));
  }

  // 交互式文件选择
  private async selectCSVFile(): Promise<string> {
    console.log('\n📁 ' + ColorLog.cyan('选择CSV文件:'));
    console.log('1. reference/transactions_example.csv (示例文件 - 34条记录)');
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

  // 批量发送请求
  private async batchSendRequests(transactions: TransactionData[]): Promise<BatchReport> {
    const report: BatchReport = {
      totalRecords: transactions.length,
      processedRecords: 0,
      successfulRequests: 0,
      failedRequests: 0,
      skippedRecords: 0,
      unknownCategories: new Set(),
      errors: [],
      startTime: new Date()
    };

    console.log('\n🚀 ' + ColorLog.bold('开始批量发送请求...'));
    console.log(`📊 总记录数: ${ColorLog.cyan(transactions.length.toString())}`);
    console.log(`⚡ 处理模式: ${ColorLog.yellow('最大化速度 - 无延时线性处理')}`);

    // 线性处理，无分组，无延时
    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i]!; // 确保不为undefined
      const recordIndex = i + 1;
      
      console.log(`\n${ColorLog.gray(`[${recordIndex}/${transactions.length}]`)} ${transaction.mbContent} - $${transaction.mbCash}`);
      
      let success = false;
      let retryCount = 0;

      // 重试逻辑
      while (!success && retryCount <= this.config.maxRetries) {
        try {
          if (retryCount > 0) {
            console.log(`  ${ColorLog.yellow(`重试 ${retryCount}/${this.config.maxRetries}`)}`);
          }

          success = await this.requestMaker.sendRequest(transaction);
          
          if (success) {
            console.log(`  ${ColorLog.green('✅ 成功')}`);
            report.successfulRequests++;
          } else {
            throw new Error('请求失败');
          }

        } catch (error) {
          retryCount++;
          if (retryCount > this.config.maxRetries) {
            console.log(`  ${ColorLog.red('❌ 失败')} (已达最大重试次数)`);
            report.failedRequests++;
            report.errors.push(`记录${recordIndex}: ${transaction.mbContent} - ${error}`);
          } else {
            console.log(`  ${ColorLog.yellow('⚠️ 重试中...')}`);
            // 重试时稍微延时避免过于频繁
            if (retryCount > 1) {
              await this.delay(500);
            }
          }
        }
      }

      report.processedRecords++;
    }

    report.endTime = new Date();
    report.duration = report.endTime.getTime() - report.startTime.getTime();

    return report;
  }

  // 生成最终报告
  private generateFinalReport(csvReport: ProcessingReport, batchReport: BatchReport): void {
    console.log('\n' + ColorLog.bold('📋 导入完成报告'));
    console.log('='.repeat(60));
    
    // 时间统计
    const durationSec = batchReport.duration ? Math.round(batchReport.duration / 1000) : 0;
    const avgTimePerRecord = batchReport.processedRecords > 0 ? 
      Math.round(batchReport.duration! / batchReport.processedRecords) : 0;

    console.log(ColorLog.blue('⏱️ 时间统计:'));
    console.log(`   开始时间: ${batchReport.startTime.toLocaleString()}`);
    console.log(`   结束时间: ${batchReport.endTime?.toLocaleString()}`);
    console.log(`   总耗时: ${ColorLog.cyan(durationSec.toString())} 秒`);
    console.log(`   平均速度: ${ColorLog.cyan(avgTimePerRecord.toString())} 毫秒/条`);

    // 处理统计
    console.log('\n' + ColorLog.blue('📊 处理统计:'));
    console.log(`   CSV解析: ${ColorLog.green(csvReport.successful.toString())}/${csvReport.totalProcessed} 成功`);
    console.log(`   API请求: ${ColorLog.green(batchReport.successfulRequests.toString())}/${batchReport.processedRecords} 成功`);
    
    if (batchReport.failedRequests > 0) {
      console.log(`   失败请求: ${ColorLog.red(batchReport.failedRequests.toString())} 条`);
    }

    // 成功率
    const successRate = batchReport.processedRecords > 0 ? 
      Math.round((batchReport.successfulRequests / batchReport.processedRecords) * 100) : 0;
    console.log(`   成功率: ${successRate >= 90 ? ColorLog.green : successRate >= 70 ? ColorLog.yellow : ColorLog.red}${successRate}%${ColorLog.cyan('')}`);

    // 未知分类
    if (csvReport.unknownCategories.size > 0) {
      console.log('\n' + ColorLog.yellow('⚠️ 未知分类 (已归为Uncategorised):'));
      Array.from(csvReport.unknownCategories).forEach(category => {
        console.log(`   • ${ColorLog.yellow(category)}`);
      });
      console.log(`\n   ${ColorLog.cyan('💡 建议:')} 在category-map.json中添加这些分类的映射`);
    }

    // 错误详情
    if (batchReport.errors.length > 0) {
      console.log('\n' + ColorLog.red('❌ 错误详情:'));
      batchReport.errors.slice(0, 5).forEach((error, index) => {
        console.log(`   ${index + 1}. ${ColorLog.red(error)}`);
      });
      if (batchReport.errors.length > 5) {
        console.log(`   ${ColorLog.gray(`... 还有 ${batchReport.errors.length - 5} 个错误`)}`);
      }
    }

    console.log('='.repeat(60));
    
    if (successRate >= 90) {
      console.log(ColorLog.green('🎉 导入基本完成！大部分数据已成功导入Money Manager。'));
    } else if (successRate >= 70) {
      console.log(ColorLog.yellow('⚠️ 导入部分完成，建议检查失败的记录。'));
    } else {
      console.log(ColorLog.red('❌ 导入遇到较多问题，建议检查配置和网络连接。'));
    }
  }

  // 显示主菜单
  private async showMainMenu(): Promise<void> {
    console.log('\n' + ColorLog.cyan('='.repeat(50)));
    console.log(ColorLog.bold('🎯 主菜单'));
    console.log(ColorLog.cyan('='.repeat(50)));
    console.log('\n' + ColorLog.bold('选择操作:'));
    console.log(ColorLog.yellow('1.') + ' 开始批量导入 (完整流程)');
    console.log(ColorLog.yellow('2.') + ' 预览CSV文件 (仅解析，不发送)');
    console.log(ColorLog.yellow('3.') + ' 配置设置');
    console.log(ColorLog.yellow('4.') + ' 测试单个模块');
    console.log(ColorLog.red('0.') + ' 退出');
    console.log('\n' + ColorLog.cyan('='.repeat(50)));
  }

  // 测试模块菜单
  private async showTestMenu(): Promise<void> {
    console.log('\n🧪 ' + ColorLog.cyan('测试模块'));
    console.log('1. 测试CSV加载模块');
    console.log('2. 测试HTTP请求模块');
    console.log('0. 返回主菜单');
    
    const choice = await this.ask('请选择 (0-2): ');
    
    switch (choice) {
      case '1':
        console.log('\n' + ColorLog.blue('启动CSV Loader模块...'));
        await this.csvLoader.runDemo();
        break;
      case '2':
        console.log('\n' + ColorLog.blue('启动Request Maker模块...'));
        await this.requestMaker.run();
        break;
      case '0':
        return;
      default:
        console.log('❌ ' + ColorLog.red('无效选择'));
    }
  }

  // 预览CSV文件
  private async previewCSV(): Promise<void> {
    console.log('\n📋 ' + ColorLog.cyan('CSV文件预览'));
    
    const filePath = await this.selectCSVFile();
    console.log(ColorLog.blue(`\n📂 解析文件: ${filePath}`));
    
    const result = await this.csvLoader.loadCSVFile(filePath);
    this.csvLoader.generateReport(result.report);
    
    if (result.transactions.length > 0) {
      console.log('\n' + ColorLog.green('前3条记录预览:'));
      result.transactions.slice(0, 3).forEach((transaction, index) => {
        console.log(ColorLog.cyan(`\n--- 记录 ${index + 1} ---`));
        console.log(`日期: ${transaction.mbDate}`);
        console.log(`金额: $${transaction.mbCash} (${transaction.inOutType})`);
        console.log(`商家: ${transaction.mbContent}`);
        console.log(`分类: ${transaction.mbCategory}`);
        console.log(`标签: ${transaction.mbDetailContent}`);
      });
    }
  }

  // 完整批量导入流程
  private async runBatchImport(): Promise<void> {
    console.log('\n🚀 ' + ColorLog.bold('开始批量导入流程'));
    
    // 1. 选择文件
    const filePath = await this.selectCSVFile();
    
    // 2. 确认配置
    console.log('\n⚙️ ' + ColorLog.cyan('当前配置:'));
    console.log(`📁 文件: ${ColorLog.blue(filePath)}`);
    console.log(`🌐 API: ${ColorLog.blue(this.config.baseUrl)}/moneyBook/create`);
    console.log(`⚡ 处理模式: ${ColorLog.green('最大化速度 - 无延时线性处理')}`);
    console.log(`🔄 最大重试: ${ColorLog.yellow(this.config.maxRetries.toString())} 次`);
    
    const confirm = await this.ask('\n是否继续? (y/n): ');
    if (confirm.toLowerCase() !== 'y') {
      console.log(ColorLog.yellow('已取消导入'));
      return;
    }

    // 3. 解析CSV
    console.log('\n📊 ' + ColorLog.blue('第1步: 解析CSV文件...'));
    const csvResult = await this.csvLoader.loadCSVFile(filePath);
    
    if (csvResult.transactions.length === 0) {
      console.log(ColorLog.red('❌ 没有可处理的记录'));
      return;
    }

    console.log(ColorLog.green(`✅ 解析完成: ${csvResult.transactions.length} 条记录可导入`));

    // 4. 最终确认
    const finalConfirm = await this.ask(`\n确认发送 ${csvResult.transactions.length} 条记录到Money Manager? (y/n): `);
    if (finalConfirm.toLowerCase() !== 'y') {
      console.log(ColorLog.yellow('已取消导入'));
      return;
    }

    // 5. 批量发送
    console.log('\n🌐 ' + ColorLog.blue('第2步: 批量发送到Money Manager...'));
    const batchReport = await this.batchSendRequests(csvResult.transactions);

    // 6. 生成报告
    this.generateFinalReport(csvResult.report, batchReport);
  }

  // 主运行循环
  public async run(): Promise<void> {
    this.showWelcome();
    
    // 初始化
    console.log('\n🔧 ' + ColorLog.blue('初始化组件...'));
    await this.csvLoader.loadCategoryMapping();
    // 设置共享的readline接口
    this.csvLoader.setReadline(this.readline);
    this.requestMaker.setReadline(this.readline);
    // 同步RequestMaker的baseUrl配置
    this.requestMaker.setBaseUrlProgrammatically(this.config.baseUrl);
    console.log('✅ ' + ColorLog.green('初始化完成'));

    while (true) {
      await this.showMainMenu();
      const choice = await this.ask('请选择 (0-4): ');
      
      try {
        switch (choice) {
          case '1':
            await this.runBatchImport();
            break;
            
          case '2':
            await this.previewCSV();
            break;
            
          case '3':
            await this.configureSettings();
            break;
            
          case '4':
            await this.showTestMenu();
            break;
            
          case '0':
            console.log('\n👋 ' + ColorLog.green('感谢使用！再见！'));
            this.readline.close();
            process.exit(0);
            
          default:
            console.log('❌ ' + ColorLog.red('无效选择，请重试'));
        }
      } catch (error) {
        console.log('❌ ' + ColorLog.red('操作失败:'), error);
      }
      
      await this.ask('\n' + ColorLog.gray('按回车键继续...'));
    }
  }
}

// 主程序入口
if (import.meta.main) {
  const app = new MainApp();
  app.run().catch(console.error);
}
