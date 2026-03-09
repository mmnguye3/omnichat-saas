import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Initialize (will be set from environment)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' });

const supabase = createClient(supabaseUrl, supabaseKey);

// ==================== AUTH ====================

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    // Route handling
    if (path === '/api/auth/callback') {
      return handleAuthCallback(request, corsHeaders);
    }
    
    if (path.startsWith('/api/webhooks/')) {
      return handleWebhook(request, path, corsHeaders);
    }
    
    if (path === '/api/channels') {
      return handleChannels(request, corsHeaders);
    }
    
    if (path === '/api/conversations') {
      return handleConversations(request, corsHeaders);
    }
    
    if (path === '/api/messages') {
      return handleMessages(request, corsHeaders);
    }
    
    if (path === '/api/stats') {
      return handleStats(request, corsHeaders);
    }
    
    if (path === '/api/stripe/checkout') {
      return handleStripeCheckout(request, corsHeaders);
    }
    
    if (path === '/api/stripe/webhook') {
      return handleStripeWebhook(request, corsHeaders);
    }
    
    if (path === '/api/channels/facebook') {
      return handleFacebookChannel(request, corsHeaders);
    }
    
    if (path.startsWith('/api/webhooks/facebook')) {
      return handleFacebookWebhook(request, corsHeaders);
    }
    
    if (path === '/api/campaigns') {
      return handleCampaigns(request, corsHeaders);
    }
    
    if (path.match(/^\/api\/campaigns\/[\w-]+\/(start|pause|resume|status)$/)) {
      return handleCampaignAction(request, path, corsHeaders);
    }
    
    if (path.match(/^\/api\/campaigns\/[\w-]+$/)) {
      return handleCampaignAction(request, path, corsHeaders);
    }
    
    return new Response(JSON.stringify({ error: 'Not found' }), { 
      status: 404, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
    
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
}

// ==================== HANDLERS ====================

async function handleAuthCallback(request, headers) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  
  if (!code) {
    return new Response(JSON.stringify({ error: 'No code provided' }), { 
      status: 400, headers: { ...headers, 'Content-Type': 'application/json' } 
    });
  }
  
  // Exchange code for session
  // In production, use Supabase auth exchangeCodeForSession
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 400, headers: { ...headers, 'Content-Type': 'application/json' } 
    });
  }
  
  // Create or update profile
  const { data: profile } = await supabase
    .from('profiles')
    .upsert({
      id: data.user.id,
      email: data.user.email,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
  
  // Redirect to app
  return new Response(null, {
    status: 302,
    headers: {
      ...headers,
      'Location': '/dashboard'
    }
  });
}

async function handleWebhook(request, path, headers) {
  const channelType = path.split('/')[3]; // /api/webhooks/telegram
  
  const body = await request.json();
  
  if (channelType === 'telegram') {
    return handleTelegramWebhook(body, headers);
  }
  
  return new Response(JSON.stringify({ ok: true }), { headers: { ...headers, 'Content-Type': 'application/json' } });
}

async function handleTelegramWebhook(body, headers) {
  const { message, edited_message, callback_query } = body;
  
  if (message) {
    const chatId = message.chat.id;
    const text = message.text;
    const user = message.from;
    
    // Find or create contact
    // Find channel by config (need to match bot token)
    // This is simplified - in production you'd match by bot token
    
    console.log(`Telegram message from ${user?.first_name}: ${text}`);
  }
  
  return new Response(JSON.stringify({ ok: true }), { headers: { ...headers, 'Content-Type': 'application/json' } });
}

async function handleChannels(request, headers) {
  const user = await getUser(request);
  if (!user) {
    return unauthorized(headers);
  }
  
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_id', user.id)
    .single();
  
  if (request.method === 'GET') {
    const { data: channels } = await supabase
      .from('channels')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false });
    
    return new Response(JSON.stringify(channels || []), { 
      headers: { ...headers, 'Content-Type': 'application/json' } 
    });
  }
  
  if (request.method === 'POST') {
    const body = await request.json();
    
    const { data: channel, error } = await supabase
      .from('channels')
      .insert({
        workspace_id: workspace.id,
        type: body.type,
        name: body.name,
        config: body.config || {}
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return new Response(JSON.stringify(channel), { 
      status: 201, headers: { ...headers, 'Content-Type': 'application/json' } 
    });
  }
  
  return methodNotAllowed(headers);
}

async function handleConversations(request, headers) {
  const user = await getUser(request);
  if (!user) return unauthorized(headers);
  
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_id', user.id)
    .single();
  
  const { data: conversations } = await supabase
    .from('conversations')
    .select(`
      *,
      contact:contacts(*),
      channel:channels(*)
    `)
    .eq('workspace_id', workspace.id)
    .order('updated_at', { ascending: false })
    .limit(50);
  
  return new Response(JSON.stringify(conversations || []), { 
    headers: { ...headers, 'Content-Type': 'application/json' } 
  });
}

async function handleMessages(request, headers) {
  const user = await getUser(request);
  if (!user) return unauthorized(headers);
  
  const url = new URL(request.url);
  const conversationId = url.searchParams.get('conversation_id');
  
  if (!conversationId) {
    return new Response(JSON.stringify({ error: 'conversation_id required' }), { 
      status: 400, headers: { ...headers, 'Content-Type': 'application/json' } 
    });
  }
  
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  
  // Mark as read
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .is('read_at', null);
  
  return new Response(JSON.stringify(messages || []), { 
    headers: { ...headers, 'Content-Type': 'application/json' } 
  });
}

async function handleStats(request, headers) {
  const user = await getUser(request);
  if (!user) return unauthorized(headers);
  
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_id', user.id)
    .single();
  
  const [contacts, conversations, messages] = await Promise.all([
    supabase.from('contacts').select('id', { count: 'exact' }).eq('workspace_id', workspace.id),
    supabase.from('conversations').select('id', { count: 'exact' }).eq('workspace_id', workspace.id),
    supabase.from('messages').select('id', { count: 'exact' }).eq('workspace_id', workspace.id)
  ]);
  
  return new Response(JSON.stringify({
    contacts: contacts.count || 0,
    conversations: conversations.count || 0,
    messages: messages.count || 0
  }), { 
    headers: { ...headers, 'Content-Type': 'application/json' } 
  });
}

async function handleStripeCheckout(request, headers) {
  const user = await getUser(request);
  if (!user) return unauthorized(headers);
  
  const body = await request.json();
  const { plan } = body; // starter, pro, agency
  
  const prices = {
    starter: process.env.STRIPE_STARTER_PRICE_ID,
    pro: process.env.STRIPE_PRO_PRICE_ID,
    agency: process.env.STRIPE_AGENCY_PRICE_ID
  };
  
  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: user.email,
    line_items: [{ price: prices[plan], quantity: 1 }],
    success_url: `${process.env.APP_URL}/dashboard?success=true`,
    cancel_url: `${process.env.APP_URL}/pricing?canceled=true`,
    metadata: { user_id: user.id }
  });
  
  return new Response(JSON.stringify({ url: session.url }), { 
    headers: { ...headers, 'Content-Type': 'application/json' } 
  });
}

async function handleStripeWebhook(request, headers) {
  const sig = request.headers.get('stripe-signature');
  const body = await request.text();
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400, headers });
  }
  
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      await handleSubscriptionCreated(session);
      break;
      
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      break;
      
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object);
      break;
  }
  
  return new Response(JSON.stringify({ received: true }), { headers: { ...headers, 'Content-Type': 'application/json' } });
}

async function handleSubscriptionCreated(session) {
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_id', session.metadata.user_id)
    .single();
  
  await supabase.from('subscriptions').insert({
    workspace_id: workspace?.id,
    stripe_subscription_id: session.subscription,
    plan: 'starter', // Get from session
    status: 'active',
    current_period_start: new Date().toISOString()
  });
  
  await supabase.from('profiles')
    .update({ stripe_customer_id: session.customer })
    .eq('id', session.metadata.user_id);
}

async function handleSubscriptionUpdated(subscription) {
  await supabase.from('subscriptions')
    .update({
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
    })
    .eq('stripe_subscription_id', subscription.id);
}

async function handleSubscriptionDeleted(subscription) {
  await supabase.from('subscriptions')
    .update({ status: 'canceled' })
    .eq('stripe_subscription_id', subscription.id);
}

// ==================== HELPERS ====================

async function getUser(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;
  
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error) return null;
  return user;
}

function unauthorized(headers) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
    status: 401, 
    headers: { ...headers, 'Content-Type': 'application/json' } 
  });
}

function methodNotAllowed(headers) {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
    status: 405, 
    headers: { ...headers, 'Content-Type': 'application/json' } 
  });
}

// ==================== FACEBOOK MESSENGER ====================

async function handleFacebookChannel(request, headers) {
  const url = new URL(request.url);
  const method = request.method;
  
  // GET - Get Facebook channel status
  if (method === 'GET') {
    const { data } = await supabase
      .from('channels')
      .select('*')
      .eq('provider', 'facebook')
      .single();
    
    return new Response(JSON.stringify({ 
      connected: !!data,
      channel: data 
    }), { headers: { ...headers, 'Content-Type': 'application/json' } });
  }
  
  // POST - Connect Facebook channel
  if (method === 'POST') {
    const { pageAccessToken, verifyToken } = await request.json();
    
    if (!pageAccessToken || !verifyToken) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // Save or update channel
    const { data, error } = await supabase
      .from('channels')
      .upsert({
        provider: 'facebook',
        name: 'Facebook Messenger',
        config: {
          pageAccessToken,
          verifyToken,
          webhookUrl: `${url.origin}/api/webhooks/facebook`
        },
        status: 'active',
        updatedAt: new Date().toISOString()
      }, { onConflict: 'provider' })
      .select()
      .single();
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ success: true, channel: data }), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  // DELETE - Disconnect Facebook channel
  if (method === 'DELETE') {
    await supabase
      .from('channels')
      .delete()
      .eq('provider', 'facebook');
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  return methodNotAllowed(headers);
}

// Facebook Webhook Handler
async function handleFacebookWebhook(request, headers) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  
  // Webhook verification (GET)
  if (request.method === 'GET') {
    // Get verify token from DB
    const { data: channel } = await supabase
      .from('channels')
      .select('config')
      .eq('provider', 'facebook')
      .single();
    
    const verifyToken = channel?.config?.verifyToken;
    
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('Webhook verified!');
      return new Response(challenge, { headers: { ...headers, 'Content-Type': 'text/plain' } });
    }
    
    return new Response(JSON.stringify({ error: 'Verification failed' }), {
      status: 403, headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  // Message handling (POST)
  if (request.method === 'POST') {
    const body = await request.json();
    
    // Process webhook entries
    if (body.object === 'page') {
      for (const entry of body.entry || []) {
        for (const message of entry.messaging || []) {
          if (message.message) {
            // Save message to database
            const { senderId, recipientId, text, timestamp } = parseFacebookMessage(message);
            
            if (senderId) {
              // Create or get contact
              let { data: contact } = await supabase
                .from('contacts')
                .select('id')
                .eq('facebookId', senderId)
                .single();
              
              if (!contact) {
                const { data: newContact } = await supabase
                  .from('contacts')
                  .insert({
                    facebookId: senderId,
                    name: `User ${senderId.slice(-6)}`,
                    createdAt: new Date().toISOString()
                  })
                  .select()
                  .single();
                contact = newContact;
              }
              
              // Create conversation
              const { data: conversation } = await supabase
                .from('conversations')
                .upsert({
                  contactId: contact.id,
                  channel: 'facebook',
                  status: 'open',
                  updatedAt: new Date().toISOString()
                }, { onConflict: 'contactId,channel' })
                .select()
                .single();
              
              // Save message
              await supabase
                .from('messages')
                .insert({
                  conversationId: conversation.id,
                  contactId: contact.id,
                  direction: 'incoming',
                  content: text,
                  channel: 'facebook',
                  timestamp: timestamp || new Date().toISOString()
                });
            }
          }
        }
      }
    }
    
    return new Response('OK', { headers: { ...headers, 'Content-Type': 'text/plain' } });
  }
  
  return methodNotAllowed(headers);
}

function parseFacebookMessage(message) {
  return {
    senderId: message.sender?.id,
    recipientId: message.recipient?.id,
    text: message.message?.text,
    timestamp: message.timestamp
  };
}

// ==================== CAMPAIGNS (Background Processing) ====================

// In-memory campaign storage (for demo - use D1 in production)
const campaigns = new Map();

// Create campaign
async function handleCampaigns(request, headers) {
  const method = request.method;
  
  // GET - List campaigns
  if (method === 'GET') {
    const campaignList = Array.from(campaigns.values()).map(c => ({
      id: c.id,
      name: c.name,
      pageId: c.pageId,
      totalContacts: c.totalContacts,
      sent: c.sent,
      delivered: c.delivered,
      failed: c.failed,
      status: c.status,
      createdAt: c.createdAt,
      completedAt: c.completedAt
    }));
    
    return new Response(JSON.stringify({ campaigns: campaignList }), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  // POST - Create campaign
  if (method === 'POST') {
    const body = await request.json();
    const { name, pageId, contacts, message, messageTag, pageAccessToken } = body;
    
    const campaign = {
      id: crypto.randomUUID(),
      name,
      pageId,
      contacts: contacts || [],
      message,
      messageTag: messageTag || null,
      pageAccessToken: pageAccessToken || null,
      totalContacts: (contacts || []).length,
      sent: 0,
      delivered: 0,
      failed: 0,
      status: 'pending',
      createdAt: new Date().toISOString(),
      completedAt: null,
      results: []
    };
    
    campaigns.set(campaign.id, campaign);
    
    return new Response(JSON.stringify({ success: true, campaign: { id: campaign.id, name: campaign.name, totalContacts: campaign.totalContacts } }), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  return methodNotAllowed(headers);
}

// Get campaign status / Start campaign
async function handleCampaignAction(request, path, headers) {
  const method = request.method;
  const campaignId = path.split('/').slice(-2, -1)[0];
  const action = path.split('/').pop();
  const campaign = campaigns.get(campaignId);
  
  if (!campaign) {
    return new Response(JSON.stringify({ error: 'Campaign not found' }), {
      status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  // GET - Get campaign status
  if (method === 'GET') {
    return new Response(JSON.stringify({ 
      campaign: {
        id: campaign.id,
        name: campaign.name,
        totalContacts: campaign.totalContacts,
        sent: campaign.sent,
        delivered: campaign.delivered,
        failed: campaign.failed,
        status: campaign.status,
        progress: campaign.totalContacts > 0 ? Math.round((campaign.sent / campaign.totalContacts) * 100) : 0,
        createdAt: campaign.createdAt,
        completedAt: campaign.completedAt
      }
    }), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  // POST - Start/Stop campaign
  if (method === 'POST') {
    if (action === 'start' && campaign.status === 'pending') {
      // Start processing in background
      processCampaign(campaign);
      return new Response(JSON.stringify({ success: true, message: 'Campaign started' }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    if (action === 'pause' && campaign.status === 'running') {
      campaign.status = 'paused';
      return new Response(JSON.stringify({ success: true, message: 'Campaign paused' }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    if (action === 'resume' && campaign.status === 'paused') {
      campaign.status = 'running';
      processCampaign(campaign);
      return new Response(JSON.stringify({ success: true, message: 'Campaign resumed' }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  return methodNotAllowed(headers);
}

// Background campaign processor
async function processCampaign(campaign) {
  campaign.status = 'running';
  
  console.log(`Starting campaign ${campaign.id} for ${campaign.totalContacts} contacts`);
  
  // Process each contact with delay (rate limiting)
  for (let i = 0; i < campaign.contacts.length; i++) {
    if (campaign.status === 'paused') {
      console.log(`Campaign ${campaign.id} paused`);
      break;
    }
    
    const contact = campaign.contacts[i];
    
    try {
      // In production: Send via Facebook API
      // For demo: simulate sending
      await simulateSendMessage(campaign, contact);
      
      campaign.sent++;
      campaign.delivered++;
      
      console.log(`Campaign ${campaign.id}: ${campaign.sent}/${campaign.totalContacts} sent`);
      
    } catch (error) {
      campaign.failed++;
      console.error(`Failed to send to ${contact.id}:`, error.message);
    }
    
    // Rate limiting: wait between messages (Facebook limits)
    await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
  }
  
  // Mark completed
  campaign.status = 'completed';
  campaign.completedAt = new Date().toISOString();
  console.log(`Campaign ${campaign.id} completed: ${campaign.sent} sent, ${campaign.failed} failed`);
}

// Simulate sending message (replace with actual Facebook API in production)
async function simulateSendMessage(campaign, contact) {
  // In production, this would call Facebook Messenger API:
  // POST https://graph.facebook.com/v18.0/me/messages
  // {
  //   recipient: { id: contact.facebookId },
  //   message: { text: campaign.message },
  //   tag: campaign.messageTag
  // }
  
  // Demo: just simulate success
  return { success: true, messageId: `msg_${Date.now()}` };
}
