#!/usr/bin/env bun
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as readline from 'readline';

// Animation utility
function createAnimation(text: string = 'Processing') {
  const steps = 24;
  const delay = 50;
  const phaseStep = 0.3;
  const speedFactor = 0.3;
  const codes = Array.from({ length: steps }, (_, i) => 232 + i);

  let frame = 0;
  let timer: NodeJS.Timeout | null = null;

  const start = () => {
    process.stdout.write('\x1b[?25l');
    timer = setInterval(() => {
      process.stdout.write('\r\x1b[K');

      let line = '';
      line += '\x1b[2m';

      for (let i = 0; i < text.length; i++) {
        const phase = (i * phaseStep) - (frame * speedFactor);
        const brightness = (Math.sin(phase) + 1) / 2;
        const idx = Math.floor(brightness * (steps - 1));
        const color = codes[idx];
        line += `\x1b[38;5;${color}m${text[i]}`;
      }

      line += '\x1b[0m';
      process.stdout.write(line);
      frame++;
    }, delay);
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    process.stdout.write('\r\x1b[K\x1b[?25h');
  };

  // Ensure cursor is restored on exit
  process.on('exit', stop);
  process.on('SIGINT', () => {
    stop();
    process.exit(0);
  });
  process.on('SIGTERM', stop);

  return { start, stop };
}

const CLI_NAME = 'aix';
const CLI_VERSION = '1.0.0';
const program = new Command();
const execAsync = promisify(exec);

// Provider configuration
const providers = {
  openrouter: {
    name: 'OpenRouter',
    create: createOpenRouter,
    keyEnv: 'OPENROUTER_API_KEY',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  deepseek: {
    name: 'DeepSeek',
    create: createDeepSeek,
    keyEnv: 'DEEPSEEK_API_KEY',
    baseURL: 'https://api.deepseek.com/v1',
  },
  groq: {
    name: 'Groq',
    create: createGroq,
    keyEnv: 'GROQ_API_KEY',
    baseURL: 'https://api.groq.com/openai/v1',
  },
  mistral: {
    name: 'Mistral',
    create: createMistral,
    keyEnv: 'MISTRAL_API_KEY',
    baseURL: 'https://api.mistral.ai/v1',
  },
  moonshot: {
    name: 'MoonShot AI',
    create: () => null, // Moonshot uses custom implementation
    keyEnv: 'MOONSHOT_API_KEY',
    baseURL: 'https://api.moonshot.cn/v1',
  },
};

// Default settings
const DEFAULT_PROVIDER = process.env.AIX_DEFAULT_PROVIDER || 'moonshot';
const DEFAULT_MODEL = process.env.AIX_DEFAULT_MODEL || 'kimi-k2-0711-preview';
const DEFAULT_TEMPERATURE = 0.6;

// Parse model string format: provider:model or just model
function parseModelString(modelString: string): { provider: string; model: string } {
  const parts = modelString.split(':');
  if (parts.length === 2) {
    const [provider, model] = parts;
    return { provider: provider || DEFAULT_PROVIDER, model: model || DEFAULT_MODEL };
  }
  return { provider: DEFAULT_PROVIDER, model: modelString };
}

// Get model instance based on provider and model
function getModelInstance(providerName: string, modelId: string) {
  const providerConfig = providers[providerName as keyof typeof providers];
  if (!providerConfig) {
    throw new Error(`Unknown provider: ${providerName}. Available: ${Object.keys(providers).join(', ')}`);
  }

  const apiKey = process.env[providerConfig.keyEnv];
  if (!apiKey) {
    throw new Error(`${providerConfig.keyEnv} environment variable is required for ${providerConfig.name}`);
  }

  if (providerName === 'moonshot') {
    // Use OpenAI provider for Moonshot as it's OpenAI-compatible
    const openai = createOpenAI({ apiKey, baseURL: providerConfig.baseURL });
    return openai(modelId);
  }

  const provider = providerConfig.create({ apiKey, baseURL: providerConfig.baseURL });
  if (!provider) {
    throw new Error(`Failed to create provider for ${providerName}`);
  }
  return provider(modelId);
}

// Dangerous commands blacklist
const DANGEROUS_COMMANDS = [
  /\brm\s+-rf/i,
  /\brm\s+--recursive/i,
  /\brm\s+.*\*\s+-rf/i,
  /\bformat\s+/i,
  /\bdd\s+/i,
  /\bsudo\s+rm/i,
  /\bchmod\s+.*777/i,
  /\bchown\s+.*root/i,
  /\bmv\s+.*\/dev\/null/i,
  /\b:\(\)\{\s*:\|\s*:\s*&\s*\}/i, // fork bomb
  /\bshutdown\s+-h\s+now/i,
  /\bpoweroff/i,
  /\binit\s+0/i,
  /\bmkfs/i,
  /\bfsck/i,
];

function isDangerousCommand(command: string): boolean {
  return DANGEROUS_COMMANDS.some(pattern => pattern.test(command));
}

// 需要真实 TTY 的交互式程序（非穷尽）
const TTY_APPS = /\b(btop|htop|top|vim|nvim|less|more|ssh|tmux|screen|man)\b/;
function needsTty(command: string): boolean {
  return TTY_APPS.test(command);
}

// Global hook: show CLI name, version, and selected provider:model in dim text
program
  .name(CLI_NAME)
  .description('AI CLI tool for multiple providers')
  .version(CLI_VERSION)
  .hook('preAction', (thisCommand, actionCommand) => {
    const opts = actionCommand.opts();
    const modelOpt = opts.model || DEFAULT_MODEL;
    const { provider, model } = parseModelString(modelOpt);
    const providerName = providers[provider as keyof typeof providers]?.name || provider;
    console.log(`\x1b[2m${CLI_NAME} ${CLI_VERSION} (${providerName}:${model})\x1b[0m`);
  });

program
  .command('chat')
  .description('Chat with any OpenRouter model')
  .argument('<message>', 'Message to send to the model')
  .option('-m, --model <model>', 'Model to use', DEFAULT_MODEL)
  .option('-t, --temperature <temp>', 'Temperature (0-1)', DEFAULT_TEMPERATURE.toString())
  .option('-s, --stream', 'Stream the response')
  .action(async (message, options) => {
    const { provider, model: modelId } = parseModelString(options.model);
    const model = getModelInstance(provider, modelId);
    const animation = createAnimation('Thinking');
    animation.start();
    
    try {
      if (options.stream) {
        const result = streamText({ model, prompt: message, temperature: parseFloat(options.temperature) });
        let firstChunk = true;
        for await (const chunk of result.textStream) {
          if (firstChunk) {
            animation.stop();
            firstChunk = false;
          }
          process.stdout.write(chunk);
        }
        console.log('\n');
      } else {
        const result = await generateText({ model, prompt: message, temperature: parseFloat(options.temperature) });
        animation.stop();
        console.log(result.text);
      }
    } finally {
      animation.stop(); // Ensure animation stops even on error/exit
    }
  });

program
  .command('models')
  .description('List available models')
  .action(() => {
    console.log('Available Models:');
    console.log('');
    console.log(`• ${DEFAULT_PROVIDER}:${DEFAULT_MODEL} - Kimi K2 (default)`);
    console.log('');
    console.log('Kimi:');
    console.log('• moonshot:kimi-k2-0711-preview - Kimi K2');
    console.log('• moonshot:kimi-v1-8k - Kimi V1');
    console.log('');
    console.log('DeepSeek:');
    console.log('• deepseek/deepseek-chat - DeepSeek V3');
    console.log('• deepseek/deepseek-reasoner - DeepSeek R1');
    console.log('');
    console.log('Groq:');
    console.log('• llama-3.3-70b-versatile - Llama 3.3 70B');
    console.log('• gemma2-9b-it - Gemma 2 9B');
    console.log('');
    console.log('Mistral:');
    console.log('• mistral-large-latest - Mistral Large');
    console.log('• pixtral-large-latest - Pixtral Large');
    console.log('');
    console.log('OpenRouter:');
    console.log('• anthropic/claude-sonnet-4 - Claude Sonnet 4');
    console.log('• meta-llama/llama-3.1-405b-instruct - Llama 3.1 405B');
    console.log('• google/gemini-pro - Google Gemini Pro');
    console.log('• openai/gpt-4o - GPT-4 Optimized');
    console.log('');
    console.log('Visit https://openrouter.ai/models for full list');
  });

program
  .command('ask')
  .description('Ask a question with file context')
  .argument('<file>', 'File to include as context')
  .argument('<question>', 'Question about the file')
  .option('-m, --model <model>', 'Model to use', DEFAULT_MODEL)
  .action(async (file, question, options) => {
    try {
      const content = readFileSync(file, 'utf-8');
      const prompt = `File content:\n\n${content}\n\nQuestion: ${question}`;
      const { provider, model: modelId } = parseModelString(options.model);
      const model = getModelInstance(provider, modelId);
      const animation = createAnimation('Thinking');
      animation.start();
      const result = await generateText({ model, prompt });
      animation.stop();
      console.log(`File: ${file}`);
      console.log(`Question: ${question}`);
      console.log('');
      console.log(result.text);
    } catch (error) {
      console.error(`Error reading file: ${file}`);
      console.error(error instanceof Error ? error.message : String(error));
    }
  });

program
  .command('stream')
  .description('Stream a conversation')
  .argument('<prompt>', 'Initial prompt')
  .option('-m, --model <model>', 'Model to use', DEFAULT_MODEL)
  .action(async (prompt, options) => {
    const { provider, model: modelId } = parseModelString(options.model);
    const model = getModelInstance(provider, modelId);
    const animation = createAnimation('Thinking');
    animation.start();
    
    try {
      const result = streamText({ model, prompt, temperature: DEFAULT_TEMPERATURE });
      let firstChunk = true;
      for await (const chunk of result.textStream) {
        if (firstChunk) {
          animation.stop();
          firstChunk = false;
        }
        process.stdout.write(chunk);
      }
      console.log('\n');
    } finally {
      animation.stop(); // Ensure animation stops even on error/exit
    }
  });

program
  .command('exec')
  .description('Execute shell commands from natural language')
  .argument('<natural-language>', 'Natural language description of what you want to do')
  .option('-m, --model <model>', 'Model to use', DEFAULT_MODEL)
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (naturalLanguage, options) => {
    const { provider, model: modelId } = parseModelString(options.model);
    const model = getModelInstance(provider, modelId);
    console.log(`\x1b[2mConverting: "${naturalLanguage}"\x1b[0m`);
    console.log('');
    const thinkingAnimation = createAnimation('Thinking');
    thinkingAnimation.start();

    // Get system information
    let systemInfo = '';
    try {
      const platform = process.platform;
      if (platform === 'win32') {
        const { stdout } = await execAsync('systeminfo | findstr /B /C:"OS Name" /C:"OS Version"');
        systemInfo = stdout.trim();
      } else {
        const { stdout } = await execAsync('uname -a');
        systemInfo = stdout.trim();
      }
    } catch (_error) {
      systemInfo = `Platform: ${process.platform}, Architecture: ${process.arch}`;
    }

    // 颜色工具（使用 ANSI 转义，避免引入依赖）
    const color = {
      red: (s: string) => `\x1b[31m${s}\x1b[39m`,
      yellow: (s: string) => `\x1b[33m${s}\x1b[39m`,
      green: (s: string) => `\x1b[32m${s}\x1b[39m`,
      bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
      dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
    };

    // 如果是 Moonshot/Kimi，使用 JSON Mode（chat.completions + response_format: json_object）
    if (provider === 'moonshot') {
      // 使用 OpenAI 兼容接口：messages + response_format
      const systemPrompt = `
You are a command generator and security analyzer for shell commands.
You must output ONLY a valid JSON Object (no markdown, no extra text) with EXACT fields:
{
  "command": "string",
  "explanation": "string",
  "arguments": [{"arg":"string","reason":"string"}],
  "dangerLevel": 1
}
Rules:
- Output must be a JSON Object, not array or other types.
- Provide a minimal, safe command for the user's intent.
- Explain each argument in 'arguments'.
- Set dangerLevel in [1..5], where 5 is very dangerous.
- Never pipe remote content into a shell (e.g. curl ... | sh).
- Prefer non-destructive options by default.
- Adapt to system info below.
System: ${systemInfo}
      `.trim();

      // 由于本项目通过 ai SDK 的 generateText/streamText 抽象不同 provider，
      // 这里沿用 generateText 但以严格提示约束输出为 JSON；Moonshot 平台会遵循 response_format=json_object。
      // 若将来切换到底层 OpenAI SDK，可在此处直接调用 chat.completions.create 并传入 response_format。
      const jsonModePrompt = `
User Intent:
${naturalLanguage}

Return ONLY the JSON object with fields: command, explanation, arguments, dangerLevel.
      `.trim();

      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: jsonModePrompt,
        temperature: 0,
        // 逻辑层面说明：Moonshot 的 JSON Mode 需要 response_format={"type":"json_object"}
        // 当前 ai SDK 未直接暴露，此处通过更严格的 system+user 约束，并配合 Moonshot 端配置生效。
      });

      thinkingAnimation.stop();

      // 解析 JSON
      let parsed: { command: string; explanation: string; arguments: { arg: string; reason: string }[]; dangerLevel: number };
      try {
        parsed = JSON.parse(result.text.trim());
      } catch {
        console.error('无法解析模型返回的 JSON。原始输出如下：');
        console.error(result.text);
        return;
      }

      const command = (parsed.command || '').trim();
      if (!command) {
        console.error('未能从模型结果中提取命令');
        return;
      }

      // 本地风险评估（基于现有黑名单）并取较高值
      const modelDanger = Math.min(5, Math.max(1, Number(parsed.dangerLevel) || 1));
      const localDanger = isDangerousCommand(command) ? 5 : 1;
      const finalDanger = Math.max(modelDanger, localDanger);

      // 打印解释与参数
      console.log(color.bold('Generated command: '), color.bold(command));
      console.log('');
      if (parsed.explanation) {
        console.log('Explanation:');
        console.log(parsed.explanation);
        console.log('');
      }
      if (Array.isArray(parsed.arguments) && parsed.arguments.length > 0) {
        console.log('Arguments:');
        for (const item of parsed.arguments) {
          const arg = item?.arg ?? '';
          const reason = item?.reason ?? '';
          console.log(`  - ${color.bold(arg)}: ${reason}`);
        }
        console.log('');
      }

      // 打印危险等级（≥4 用红色警告）
      const dangerLine = `Danger Level: ${finalDanger} (1~5)`;
      if (finalDanger >= 4) {
        console.log(color.red(dangerLine));
        console.log(color.red('警告：该命令被评定为高危，已阻止自动执行。请在手动核对后于系统 Shell 中自行执行。'));
        return;
      } else if (finalDanger === 3) {
        console.log(color.yellow(dangerLine));
      } else {
        console.log(color.green(dangerLine));
      }
      console.log('');

      // 询问是否执行
      let shouldExecute = options.yes;
      if (!shouldExecute) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        shouldExecute = await new Promise(resolve =>
          rl.question('Execute this command? (y/N): ', ans => {
            rl.close();
            resolve(ans.toLowerCase() === 'y' || ans.toLowerCase() === 'yes');
          })
        );
      }
      if (!shouldExecute) {
        console.log('Command execution cancelled');
        return;
      }

      // 若命令包含 sudo 或需要交互式输入：先启动动画，随后切换到可输入状态（暂停动画并恢复光标）
      const needsInteractive = /\bsudo\b/.test(command) || /\bpasswd\b|\bpassword\b/i.test(command);
      const executingAnimation = createAnimation('Executing');
      executingAnimation.start();
      if (needsInteractive) {
        // 切换动画状态：停止动画，恢复光标，提示可输入
        executingAnimation.stop();
        process.stdout.write('\x1b[2m[interactive mode] Waiting for input (e.g. password)...\x1b[0m\n');
      }
      try {
        // 如果是需要 TTY 的交互式程序，使用 spawn 继承 TTY
        if (needsTty(command)) {
          // 交互式：确保动画已停
          executingAnimation.stop();
          process.stdout.write('\x1b[2m[interactive TTY] Attaching to terminal...\x1b[0m\n');
          await new Promise<void>((resolve, reject) => {
            const child = spawn(command, {
              shell: true,
              stdio: 'inherit', // 继承当前 TTY，允许密码/键盘输入和 TUI
            });
            child.on('exit', (code) => {
              if (code === 0) resolve();
              else reject(new Error(`Process exited with code ${code}`));
            });
            child.on('error', reject);
          });
        } else {
          const { stdout, stderr } = await execAsync(command);
          if (!needsInteractive) executingAnimation.stop();
          if (stdout) console.log('Output:', stdout);
          if (stderr) console.log('Error Output:', stderr);
        }
      } catch (error) {
        if (!needsInteractive) executingAnimation.stop();
        console.error('[!] ', error instanceof Error ? error.message : String(error));
      }
      return;
    }

    // 其他 provider：沿用原先基于 prompt 的 JSON 结构输出（非 JSON Mode 确保兼容）
    const prompt = `You are a command generator and security analyzer.
Given the user's natural language request and the current system info, produce a safe, minimal shell command that satisfies the intent.
Additionally, explain the command and each argument, and assess a danger level from 1 (safe) to 5 (very dangerous).
If multiple commands are needed, try to combine them safely with '&&' where reasonable.

Strict output requirement:
Return ONLY valid JSON (no markdown), with this exact shape:
{
  "command": "string, the command line to run",
  "explanation": "string, human-readable explanation of what the command does",
  "arguments": [
    { "arg": "the literal argument token", "reason": "why this argument is needed" }
  ],
  "dangerLevel": 1
}

Constraints:
- Adapt to this system:
${systemInfo}
- Prefer non-destructive options by default (e.g., dry-run flags if available).
- Never include redirections to /dev/sda or destructive storage ops.
- Never pipe unknown network content directly into a shell (e.g. curl ... | sh).
- If the intent is inherently destructive, set dangerLevel to 4 or 5 and still provide the minimal correct command.

User Natural Language:
${naturalLanguage}
`;

    const result = await generateText({ model, prompt, temperature: 0 });
    thinkingAnimation.stop();

    let parsed: { command: string; explanation: string; arguments: { arg: string; reason: string }[]; dangerLevel: number };
    try {
      parsed = JSON.parse(result.text.trim());
    } catch {
      console.error('无法解析模型返回的 JSON。原始输出如下：');
      console.error(result.text);
      return;
    }

    const command = (parsed.command || '').trim();
    if (!command) {
      console.error('未能从模型结果中提取命令');
      return;
    }

    const modelDanger = Math.min(5, Math.max(1, Number(parsed.dangerLevel) || 1));
    const localDanger = isDangerousCommand(command) ? 5 : 1;
    const finalDanger = Math.max(modelDanger, localDanger);

    console.log(color.bold('Generated command: '), color.bold(command));
    console.log('');
    if (parsed.explanation) {
      console.log('Explanation:');
      console.log(parsed.explanation);
      console.log('');
    }
    if (Array.isArray(parsed.arguments) && parsed.arguments.length > 0) {
      console.log('Arguments:');
      for (const item of parsed.arguments) {
        const arg = item?.arg ?? '';
        const reason = item?.reason ?? '';
        console.log(`  - ${color.bold(arg)}: ${reason}`);
      }
      console.log('');
    }

    const dangerLine = `Danger Level: ${finalDanger} (1~5)`;
    if (finalDanger >= 4) {
      console.log(color.red(dangerLine));
      console.log(color.red('警告：该命令被评定为高危，已阻止自动执行。请在手动核对后于系统 Shell 中自行执行。'));
      return;
    } else if (finalDanger === 3) {
      console.log(color.yellow(dangerLine));
    } else {
      console.log(color.green(dangerLine));
    }
    console.log('');

    let shouldExecute = options.yes;
    if (!shouldExecute) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      shouldExecute = await new Promise(resolve =>
        rl.question('Execute this command? (y/N): ', ans => {
          rl.close();
          resolve(ans.toLowerCase() === 'y' || ans.toLowerCase() === 'yes');
        })
      );
    }
    if (!shouldExecute) {
      console.log('Command execution cancelled');
      return;
    }

    // 若命令包含 sudo 或需要交互式输入：先启动动画，随后切换到可输入状态（暂停动画并恢复光标）
    const needsInteractive = /\bsudo\b/.test(command) || /\bpasswd\b|\bpassword\b/i.test(command);
    const executingAnimation = createAnimation('Executing');
    executingAnimation.start();
    if (needsInteractive) {
      // 切换动画状态：停止动画，恢复光标，提示可输入
      executingAnimation.stop();
      process.stdout.write('\x1b[2m[interactive mode] Waiting for input (e.g. password)...\x1b[0m\n');
    }
    try {
      // 如果是需要 TTY 的交互式程序，使用 spawn 继承 TTY
      if (needsTty(command)) {
        // 交互式：确保动画已停
        executingAnimation.stop();
        process.stdout.write('\x1b[2m[interactive TTY] Attaching to terminal...\x1b[0m\n');
        await new Promise<void>((resolve, reject) => {
          const child = spawn(command, {
            shell: true,
            stdio: 'inherit',
          });
          child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Process exited with code ${code}`));
          });
          child.on('error', reject);
        });
      } else {
        const { stdout, stderr } = await execAsync(command);
        if (!needsInteractive) executingAnimation.stop();
        if (stdout) console.log('Output:', stdout);
        if (stderr) console.log('Error Output:', stderr);
      }
    } catch (error) {
      if (!needsInteractive) executingAnimation.stop();
      console.error('[!] ', error instanceof Error ? error.message : String(error));
    }
  });

// Check for at least one provider key
const hasAnyKey = Object.values(providers).some(config => process.env[config.keyEnv]);
if (!hasAnyKey) {
  console.error('At least one API key is required for the following providers:');
  Object.entries(providers).forEach(([, config]) => console.error(`  - ${config.name}: ${config.keyEnv}`));
  console.error('');
  console.error('Example: export OPENROUTER_API_KEY=your-key');
  process.exit(1);
}

program.parse();
