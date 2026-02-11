import { NextResponse } from 'next/server';
import { SYSTEM_PROMPT } from '@/lib/prompt';

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const apiKey = process.env.DOUBAO_API_KEY || process.env.ARK_API_KEY;

    // Mock Response if no API Key
    if (!apiKey) {
      console.log('No API Key found. Returning mock response.');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate delay
      return NextResponse.json({
        role: 'assistant',
        content: '（模拟回复）我收到了你的消息。请在 .env.local 中配置 DOUBAO_API_KEY 以启用真实 AI 回复。目前我是离线模式。',
      });
    }

    // Call Doubao/Ark API
    // Note: This is a placeholder URL. Replace with actual Doubao endpoint.
    // For Volcengine Ark, it's usually https://ark.cn-beijing.volces.com/api/v3/chat/completions
    const apiUrl = process.env.DOUBAO_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
    
    // Context Optimization: Sliding Window
    // Only keep the last 20 messages to prevent token explosion and stay within model limits (4k/32k).
    // The System Prompt is always added at the beginning.
    const recentMessages = messages.slice(-20);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.DOUBAO_MODEL || 'doubao-pro-32k', // Replace with your model ID
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT
          },
          ...recentMessages
        ],
        stream: false, // Phase 1: No streaming for simplicity
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Doubao API Error:', response.status, errorText);
      
      // Handle specific error cases
      if (response.status === 429) {
         return NextResponse.json({ role: 'assistant', content: '（系统繁忙）太多人在找树洞先生聊天啦，请稍等一分钟再试哦～' });
      }
      if (response.status === 400) {
         return NextResponse.json({ role: 'assistant', content: '（系统错误）请求参数好像有点问题，请刷新重试。' });
      }

      return NextResponse.json({ error: `AI Service Error: ${response.status}` }, { status: 500 });
    }

    const data = await response.json();
    const reply = data.choices[0].message;

    return NextResponse.json(reply);

  } catch (error) {
    console.error('Server Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
