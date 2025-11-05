import { NextRequest, NextResponse } from 'next/server';
import { searchRelevantSources, formatSourcesForPrompt } from '@/lib/rag';
import { createServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rateLimit';
import { buildSystemPrompt } from '@/lib/mistral/prompts';

const mistralApiKey = process.env.MISTRAL_API_KEY!;

export async function POST(req: NextRequest) {
  try {
    // 🔒 SECURITY: Verify authentication
    const supabase = await createServerClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    // 🛡️ RATE LIMITING: Check before processing request
    const identifier = session?.user?.id ||
      req.headers.get('x-forwarded-for') ||
      req.headers.get('x-real-ip') ||
      'anonymous';

    const rateLimit = checkRateLimit(identifier, 30, 60000); // 30 req/min

    if (!rateLimit.allowed) {
      logger.warn('🚫 Rate limit exceeded:', identifier);
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez patienter 1 minute.' },
        {
          status: 429,
          headers: {
            'Retry-After': '60',
            'X-RateLimit-Remaining': '0'
          }
        }
      );
    }

    // 🔍 DEBUG: Log session details
    logger.debug('[DEBUG] Session check:', {
      hasSession: !!session,
      userId: session?.user?.id,
      email: session?.user?.email,
      authError: authError?.message,
      timestamp: new Date().toISOString(),
    });

    if (authError || !session) {
      logger.error('[AUTH] Unauthorized access attempt', {
        error: authError?.message,
        hasSession: !!session,
      });
      return NextResponse.json(
        { error: 'Non authentifié. Veuillez vous connecter.' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    logger.info(`[AUTH] User ${userEmail} (${userId}) authenticated`);

    const { message, conversationId } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message requis' }, { status: 400 });
    }

    logger.debug(`Question from user ${userId}:`, message);
    logger.info(`[AUTH] ConversationId: ${conversationId || 'NEW'}`);

    // 🔒 SECURITY: Verify conversation ownership if conversationId is provided
    if (conversationId) {
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('id, user_id')
        .eq('id', conversationId)
        .single();

      if (convError || !conversation) {
        logger.error(`[AUTH] Conversation ${conversationId} not found`);
        return NextResponse.json(
          { error: 'Conversation introuvable.' },
          { status: 404 }
        );
      }

      if (conversation.user_id !== userId) {
        logger.error(`[AUTH] User ${userId} attempted to access conversation ${conversationId} owned by ${conversation.user_id}`);
        return NextResponse.json(
          { error: 'Accès non autorisé à cette conversation.' },
          { status: 403 }
        );
      }

      logger.info(`[AUTH] Conversation ${conversationId} ownership verified`);
    }

    // 📝 CONVERSATION HISTORY: Fetch previous messages for context
    let conversationHistory = '';
    if (conversationId) {
      const { data: previousMessages, error: messagesError } = await supabase
        .from('messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (!messagesError && previousMessages && previousMessages.length > 0) {
        conversationHistory = previousMessages
          .map(m => `[${m.role}]: ${m.content}`)
          .join('\n');
        logger.debug(`[CONTEXT] Loaded ${previousMessages.length} previous messages for context`);
      }
    }

    // 1. Rechercher les sources pertinentes (articles + jurisprudence + méthodologies)
    logger.debug('\n═══════════════════════════════════════════════════════════');
    logger.debug('RECHERCHE DE SOURCES PERTINENTES');
    logger.debug('═══════════════════════════════════════════════════════════\n');

    const sources = await searchRelevantSources(message, {
      maxArticles: 3,  // REDUCED from 5 to 3 for better precision
      maxJurisprudence: 8,  // INCREASED to 8 for better jurisprudence coverage
      maxMethodologies: 3,  // Pedagogical content
      articleThreshold: 0.75,  // INCREASED from 0.65 to 0.75 for better precision
      jurisprudenceThreshold: 0.40,  // LOWERED to 0.40 for better recall (2,017 decisions)
      methodologyThreshold: 0.60,  // LOWERED to 0.60 to include 5 more relevant methodologies (scores 0.6085-0.6155)
    });

    logger.debug('\n═══════════════════════════════════════════════════════════');
    logger.debug('RÉSULTATS DE LA RECHERCHE');
    logger.debug('═══════════════════════════════════════════════════════════');
    logger.debug(`Articles trouvés: ${sources.articles.length}`);
    logger.debug(`Jurisprudence trouvée: ${sources.jurisprudence.length}`);
    logger.debug(`Méthodologies trouvées: ${sources.methodologies.length}`);

    if (sources.jurisprudence.length > 0) {
      logger.debug('\nJURISPRUDENCE RÉCUPÉRÉE:');
      sources.jurisprudence.forEach((j, idx) => {
        logger.debug(`   ${idx + 1}. ${j.juridiction} - ${j.date}`);
        logger.debug(`      ${j.titre}`);
        logger.debug(`      Similarité: ${(j.similarity * 100).toFixed(2)}%`);
      });
    } else {
      logger.debug('\nAUCUNE JURISPRUDENCE TROUVÉE !');
    }
    logger.debug('═══════════════════════════════════════════════════════════\n');

    // 2. Construire le contexte avec formatage ultra-strict
    const context = formatSourcesForPrompt(sources);

    // 3. Créer le prompt pour Mistral avec intelligence contextuelle
    const systemPrompt = buildSystemPrompt(
      context,
      conversationHistory.length > 0 ? conversationHistory : undefined
    );
    const userPrompt = message;

    logger.debug('Appel Mistral...');

    // 4. Appeler Mistral pour générer la réponse
    const mistralResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`
      },
      body: JSON.stringify({
        model: 'open-mistral-7b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!mistralResponse.ok) {
      const errorText = await mistralResponse.text();
      logger.error('Erreur Mistral:', errorText);
      throw new Error('Erreur Mistral: ' + errorText);
    }

    const mistralData = await mistralResponse.json();
    const response = mistralData.choices[0].message.content;

    logger.success('Réponse générée');

    // ========================================================================
    // 💾 SAVE CONVERSATION AND MESSAGES TO DATABASE
    // ========================================================================

    let finalConversationId = conversationId;

    // Step 1: Create conversation if it doesn't exist
    if (!finalConversationId) {
      logger.debug('\nCréation d\'une nouvelle conversation...');

      const { data: newConversation, error: convError } = await supabase
        .from('conversations')
        .insert([{
          user_id: userId,
          title: message.substring(0, 100), // First 100 chars of question as title
        }])
        .select()
        .single();

      if (convError || !newConversation) {
        logger.error('Erreur création conversation:', convError);
        return NextResponse.json(
          {
            error: 'Erreur lors de la création de la conversation',
            details: convError?.message
          },
          { status: 500 }
        );
      }

      finalConversationId = newConversation.id;
      logger.success(`Conversation créée: ${finalConversationId} pour user: ${userId}`);
    } else {
      logger.debug(`\nUtilisation de la conversation existante: ${finalConversationId}`);
    }

    // Step 2: Save user message
    logger.debug('\nInsertion du message utilisateur...');
    logger.debug('Données:', {
      conversation_id: finalConversationId,
      role: 'user',
      content_length: message.length,
      userId: userId
    });

    const { error: userMessageError } = await supabase
      .from('messages')
      .insert([{
        conversation_id: finalConversationId,
        role: 'user',
        content: message,
      }]);

    if (userMessageError) {
      logger.error('Erreur insertion message utilisateur:', userMessageError);
      logger.error('   Message:', userMessageError.message);
      logger.error('   Code:', userMessageError.code);
      logger.error('   Details:', userMessageError.details);
      logger.error('   Hint:', userMessageError.hint);

      return NextResponse.json(
        {
          error: 'Erreur lors de l\'enregistrement du message utilisateur',
          details: userMessageError.message,
          code: userMessageError.code
        },
        { status: 500 }
      );
    }

    logger.success('Message utilisateur inséré');

    // Step 3: Save assistant response
    logger.debug('\nInsertion de la réponse assistant...');
    logger.debug('Données:', {
      conversation_id: finalConversationId,
      role: 'assistant',
      content_length: response.length,
      userId: userId
    });

    const { error: assistantMessageError } = await supabase
      .from('messages')
      .insert([{
        conversation_id: finalConversationId,
        role: 'assistant',
        content: response,
      }]);

    if (assistantMessageError) {
      logger.error('Erreur insertion réponse assistant:', assistantMessageError);
      logger.error('   Message:', assistantMessageError.message);
      logger.error('   Code:', assistantMessageError.code);

      return NextResponse.json(
        {
          error: 'Erreur lors de l\'enregistrement de la réponse',
          details: assistantMessageError.message,
          code: assistantMessageError.code
        },
        { status: 500 }
      );
    }

    logger.success('Réponse assistant insérée');

    // Step 4: Update conversation's updated_at timestamp
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', finalConversationId);

    if (updateError) {
      logger.warn('Erreur mise à jour timestamp conversation:', updateError.message);
      // Non-critical, continue
    }

    logger.success('\nConversation et messages sauvegardés avec succès');
    logger.debug('═══════════════════════════════════════════════════════════\n');

    return NextResponse.json({
      response,
      conversationId: finalConversationId, // Return conversationId for frontend
      articlesUsed: sources.articles.length,
      jurisprudenceUsed: sources.jurisprudence.length,
      methodologiesUsed: sources.methodologies.length,
      userId, // Include userId for frontend tracking
    });

  } catch (error: any) {
    logger.error('Erreur API:', error);
    return NextResponse.json(
      {
        error: 'Erreur serveur',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        response: "Désolé, une erreur s'est produite. Le système est en cours de configuration."
      },
      { status: 500 }
    );
  }
}
