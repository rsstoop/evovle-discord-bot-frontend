import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { messages, requestId } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      );
    }

    // Get N8N webhook URL from environment
    const n8nUrl = process.env.N8N_URL;

    if (!n8nUrl) {
      console.error('[chat] N8N_URL environment variable is not set');
      return NextResponse.json(
        { error: 'N8N webhook URL not configured' },
        { status: 500 }
      );
    }

    // Deduplicate messages - remove consecutive duplicate messages
    const deduplicatedMessages: any[] = [];
    for (let i = 0; i < messages.length; i++) {
      const current = messages[i];
      const previous = messages[i - 1];
      
      // Skip if this message is identical to the previous one (same role and content)
      if (previous && 
          previous.role === current.role && 
          previous.content === current.content) {
        console.log(`[chat] Skipping duplicate message at index ${i}`);
        continue;
      }
      
      deduplicatedMessages.push(current);
    }

    // Mark the last message as the new message to respond to
    const messagesWithLabel = deduplicatedMessages.map((msg: any, index: number) => {
      const isLastMessage = index === deduplicatedMessages.length - 1;
      return {
        ...msg,
        // Add a label to the new message that needs a response
        ...(isLastMessage && { _label: 'NEW_MESSAGE_TO_RESPOND_TO', _isNewMessage: true }),
        // Add index for reference
        _index: index,
      };
    });

    // Extract conversation summary for context
    const userMessages = messagesWithLabel.filter((m: any) => m.role === 'user');
    const botMessages = messagesWithLabel.filter((m: any) => m.role === 'bot' || m.role === 'assistant');
    const newUserMessage = messagesWithLabel[messagesWithLabel.length - 1];

    const requestBody = { 
      messages: messagesWithLabel,
      requestId: requestId, // Pass requestId to N8N so it can use it when logging
      // Add metadata to make it clear
      metadata: {
        totalMessages: messagesWithLabel.length,
        originalMessageCount: messages.length,
        newMessageIndex: messagesWithLabel.length - 1,
        conversationHistoryCount: messagesWithLabel.length - 1,
        deduplicated: messages.length !== messagesWithLabel.length,
        userMessageCount: userMessages.length,
        botResponseCount: botMessages.length,
        newUserMessage: newUserMessage?.content,
        // Help identify if this is a repeat question
        isRepeatQuestion: userMessages.length > 1 && 
          userMessages[userMessages.length - 1]?.content === userMessages[userMessages.length - 2]?.content,
      }
    };
    const requestBodyString = JSON.stringify(requestBody);

    console.log('[chat] Sending messages to N8N:', {
      n8nUrl: n8nUrl.replace(/\/[^\/]*$/, '/***'), // Mask webhook ID for security
      requestId: requestId,
      originalMessageCount: messages.length,
      deduplicatedMessageCount: messagesWithLabel.length,
      lastMessage: messagesWithLabel[messagesWithLabel.length - 1]?.content?.substring(0, 50) + '...',
      bodySize: requestBodyString.length,
      duplicatesRemoved: messages.length - messagesWithLabel.length,
    });

    // Send messages to N8N webhook asynchronously (fire and forget)
    // Use a promise that doesn't block the response but ensures the request is initiated
    const n8nRequest = fetch(n8nUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: requestBodyString,
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[chat] N8N webhook returned error:', {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
          });
        } else {
          console.log('[chat] Successfully sent to N8N webhook');
        }
      })
      .catch((error) => {
        // Log errors but don't block the response
        console.error('[chat] Error sending to N8N webhook:', {
          error: error.message,
          stack: error.stack,
        });
      });

    // In serverless, we need to ensure the request is at least initiated
    // We'll wait a bit to ensure the request starts, but not wait for full completion
    // This prevents the serverless function from terminating before the request is sent
    try {
      await Promise.race([
        n8nRequest,
        new Promise((resolve) => setTimeout(resolve, 500)), // Wait up to 500ms for request initiation
      ]);
      console.log('[chat] Request to N8N initiated');
    } catch (error) {
      console.error('[chat] Error during request initiation:', error);
      // Continue anyway - the request might still be sent
    }

    // Return immediately - N8N will process asynchronously
    return NextResponse.json({
      success: true,
      message: 'Message sent to N8N webhook',
    });

  } catch (error: any) {
    console.error('Error in chat route:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

