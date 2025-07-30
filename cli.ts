#!/usr/bin/env bun
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { exec } from 'child_process';
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
    // console.log(`Chatting with ${provider}:${modelId}...\n`);
    const animation = createAnimation('Thinking');
    animation.start();
    if (options.stream) {
      const result = streamText({ model, prompt: message, temperature: parseFloat(options.temperature) });
      for await (const chunk of result.textStream) process.stdout.write(chunk);
      console.log('\n');
    } else {
      const result = await generateText({ model, prompt: message, temperature: parseFloat(options.temperature) });
      animation.stop();
      console.log(result.text);
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
    // console.log(`Streaming with ${provider}:${modelId}...\n`);
    const animation = createAnimation('Thinking');
    animation.start();
    const result = streamText({ model, prompt, temperature: DEFAULT_TEMPERATURE });
    for await (const chunk of result.textStream) process.stdout.write(chunk);
    animation.stop();
    console.log('\n');
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
    console.log(`Converting: "${naturalLanguage}"`);
    console.log('');
    const thinkingAnimation = createAnimation('Thinking');
    thinkingAnimation.start();
    
    // Get system information
    let systemInfo = '';
    try {
      const platform = process.platform;
      if (platform === 'win32') {
        // Windows system info
        const { stdout } = await execAsync('systeminfo | findstr /B /C:"OS Name" /C:"OS Version"');
        systemInfo = stdout.trim();
      } else {
        // Unix-like system info
        const { stdout } = await execAsync('uname -a');
        systemInfo = stdout.trim();
      }
    } catch (error) {
      systemInfo = `Platform: ${process.platform}, Architecture: ${process.arch}`;
    }
    
    const result = await generateText({
      model,
      prompt: `Convert this natural language to a shell command for the current system. The system information is provided below.

System information:
${systemInfo}

Return ONLY the command, no explanations or markdown.

Natural language: ${naturalLanguage}

Command:`,
    });
    thinkingAnimation.stop();
    const command = result.text.trim();
    if (!command) {
      console.error('Could not determine command from natural language');
      return;
    }
    console.log(`Generated command: \x1b[1m${command}\x1b[22m`);
    if (isDangerousCommand(command)) {
      console.error('DANGEROUS COMMAND DETECTED!');
      console.error('This command is blocked for safety reasons.');
      console.error(`   Command: ${command}`);
      console.error('If you really need to run this, use the shell directly.');
      return;
    }
    let shouldExecute = options.yes;
    if (!shouldExecute) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      shouldExecute = await new Promise(resolve => rl.question('Execute this command? (y/N): ', ans => { rl.close(); resolve(ans.toLowerCase() === 'y' || ans.toLowerCase() === 'yes'); }));
    }
    if (!shouldExecute) { console.log('Command execution cancelled'); return; }
    const executingAnimation = createAnimation('Executing');
    executingAnimation.start();
    try {
      const { stdout, stderr } = await execAsync(command);
      executingAnimation.stop();
      if (stdout) console.log('Output:', stdout);
      if (stderr) console.log('Error Output:', stderr);
    } catch (error) {
      executingAnimation.stop();
      // Node.js 的 child_process 模块在命令执行失败时，会生成一个 Error 对象。
      // 这个对象的 .message 属性被设计成一个自带总结的字符串，其格式通常是 Command failed: [执行的命令]。
      // 所以在我们的例子中，error.message 的值本身就是 "Command failed: false"。
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
