终端 AI 工具. 

项目理解: 使用 typescript , 实现一个自然语言到 cmd 操作的工具. 而不是聊天

example:

```
bun cli.ts who am i
```

系统执行命令, 并返回结果. 

[x] 如果模型支持工具调用, 则优先使用工具调用, 暂时优先使用 anthropic/claude-sonnet-4 模型, 暂不考虑适配其他模型

TODO:
1. 向用户询问是否允许执行命令(y/N)
2. 检测是否在权限允许内(rm -rf / (类似 GEMINI CLI)) 
3. 渲染思考动画

