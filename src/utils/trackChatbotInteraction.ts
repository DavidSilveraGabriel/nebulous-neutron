import { createClient } from '@supabase/supabase-js'

async function trackChatbotInteraction(params: {
  userId: string,
  userQuery: string,
  botResponse: string,
  interactionType: string,
  relevanceScore?: number,
  responseTimeMs?: number
}) {
  const supabase = createClient(
    process.env.SUPABASE_URL!, 
    process.env.SUPABASE_KEY!
  )

  const { error } = await supabase
    .from('chatbot_interactions')
    .insert({
      user_id: params.userId,
      user_query: params.userQuery,
      bot_response: params.botResponse,
      interaction_type: params.interactionType,
      relevance_score: params.relevanceScore,
      response_time_ms: params.responseTimeMs
    })

  if (error) console.error('Metrics tracking error:', error)
}

export {trackChatbotInteraction} 