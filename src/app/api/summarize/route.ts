import { NextResponse } from 'next/server';

const SUMMARIZE_PROMPT = `
你是一个专业的“记忆管理员”。你的任务是维护一份用户的“长期记忆档案”。
你会收到两部分信息：
1. 【旧档案】：用户之前的长期记忆（可能为空）。
2. 【新对话】：最近发生的对话（每条消息都带有 [MM/DD HH:mm] 的时间戳）。

请执行以下操作：
1. **时间线整合**：在记录重要事件时，**必须**带上大概的时间点（例如“2月12日晚，用户提到...”）。这非常重要，因为用户可能会问“昨天说了什么”。
2. **整合更新**：阅读【新对话】，提取其中的关键事实（如用户属性、喜好、重要事件），并将其整合进【旧档案】中。
3. **修正冲突**：如果新信息与旧信息冲突（例如用户以前说单身，现在说有对象），以【新对话】为准更新档案。
4. **遗忘细节**：删除旧档案中过于琐碎、不再重要的具体对话细节，只保留核心事实和结论。
5. **输出格式**：直接输出更新后的完整档案文本，不要加任何解释或前缀。

档案结构建议包含：
- **用户画像**：基本属性、性格、喜好。
- **关键关系**：与伴侣/朋友的状态。
- **重要事件时间线**：近期发生的大事及其发生时间。
`;

export async function POST(req: Request) {
  try {
    const { messages, oldMemory } = await req.json();
    const apiKey = process.env.DOUBAO_API_KEY || process.env.ARK_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ 
        summary: '（模拟记忆）用户提到了...（由于未配置API Key，此处为模拟数据）' 
      });
    }

    const apiUrl = process.env.DOUBAO_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

    const userContent = oldMemory 
      ? `【旧档案】：\n${oldMemory}\n\n【新对话】：\n${JSON.stringify(messages)}`
      : `【旧档案】：(空)\n\n【新对话】：\n${JSON.stringify(messages)}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.DOUBAO_SUMMARY_MODEL || 'ep-20260212202309-c4q86', // Fallback to Lite model if env var missing
        messages: [
          {
            role: 'system',
            content: SUMMARIZE_PROMPT
          },
          {
            role: 'user',
            content: userContent
          }
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      console.error('Summarize API Error:', response.status);
      return NextResponse.json({ error: 'Summarize failed' }, { status: 500 });
    }

    const data = await response.json();
    const summary = data.choices[0].message.content;

    return NextResponse.json({ summary });

  } catch (error) {
    console.error('Server Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
