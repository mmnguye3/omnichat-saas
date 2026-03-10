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
    
    if (path === '/api/workspaces') {
      return handleWorkspaces(request, corsHeaders);
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
    
    // Super admin invitations
    if (path === '/api/super-admin/invite' || path === '/api/super-admin/invitations') {
      return handleSuperAdminInvitations(request, corsHeaders);
    }
    
    // Invitation acceptance
    if (path.startsWith('/api/invitations/') && path.includes('/accept')) {
      const token = path.split('/')[3];
      return handleInvitationAccept(request, token, corsHeaders);
    }
    
    // Facebook pages management
    if (path === '/api/facebook/pages') {
      return handleFacebookPages(request, corsHeaders);
    }
    
    // Facebook OAuth initiate
    if (path === '/api/facebook/connect') {
      return handleFacebookConnect(request, corsHeaders);
    }
    
    // Employee access management
    if (path === '/api/employees/access') {
      return handleEmployeeAccess(request, corsHeaders);
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
  
  // If no owned workspace, check if member of any workspace
  let workspaceId = workspace?.id;
  let userRole = 'owner';
  
  if (!workspaceId) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'member'])
      .maybeSingle();
    
    if (membership) {
      workspaceId = membership.workspace_id;
      userRole = membership.role;
    }
  }
  
  if (!workspaceId) {
    return new Response(JSON.stringify([]), { 
      headers: { ...headers, 'Content-Type': 'application/json' } 
    });
  }
  
  let query = supabase
    .from('conversations')
    .select(`
      *,
      contact:contacts(*),
      channel:channels(*)
    `)
    .eq('workspace_id', workspaceId);
  
  // If employee (role='member'), only show assigned or explicitly granted conversations
  if (userRole === 'member') {
    const { data: access } = await supabase
      .from('employee_conversation_access')
      .select('conversation_id')
      .eq('employee_id', user.id);
    
    const accessibleIds = access?.map(a => a.conversation_id) || [];
    
    // Include conversations assigned to this user OR with explicit access
    query = query.in('id', [user.id, ...accessibleIds].filter(Boolean));
  }
  
  const { data: conversations } = await query
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

// Get workspaces for current user (owned + member of)
async function handleWorkspaces(request, headers) {
  const user = await getUser(request);
  if (!user) return unauthorized(headers);
  
  // Get owned workspaces
  const { data: owned } = await supabase
    .from('workspaces')
    .select('*, profiles!inner(email, full_name)')
    .eq('owner_id', user.id);
  
  // Get workspaces where user is member
  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces(*, profiles!inner(email, full_name))')
    .eq('user_id', user.id);
  
  const memberWorkspaces = memberships?.map(m => ({
    ...m.workspaces,
    role: m.role,
    is_member: true
  })) || [];
  
  const allWorkspaces = [...(owned || []).map(w => ({ ...w, role: 'owner', is_owner: true })), ...memberWorkspaces];
  
  return new Response(JSON.stringify(allWorkspaces), { 
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

// ==================== SUPER ADMIN & INVITATIONS ====================

// Check if user is super admin
async function isSuperAdmin(userId) {
  const { data, error } = await supabase
    .from('super_admins')
    .select('id')
    .eq('user_id', userId)
    .single();
  return !!data;
}

// Check if user is workspace admin or owner
async function isWorkspaceAdmin(workspaceId, userId) {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .in('role', ['owner', 'admin'])
    .single();
  return !!data;
}

// Handle super admin invitations
async function handleSuperAdminInvitations(request, headers) {
  const method = request.method;
  
  // POST /api/super-admin/invite - Create invitation
  if (method === 'POST') {
    // Get user from auth header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // Check if super admin
    if (!(await isSuperAdmin(user.id))) {
      return new Response(JSON.stringify({ error: 'Forbidden: Super admin only' }), {
        status: 403, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    const body = await request.json();
    const { email, workspace_id, role = 'admin' } = body;
    
    if (!email || !workspace_id) {
      return new Response(JSON.stringify({ error: 'Email and workspace_id required' }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // Generate invitation token
    const inviteToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
    
    const { data: invitation, error } = await supabase
      .from('admin_invitations')
      .insert({
        email,
        token: inviteToken,
        role,
        invited_by: user.id,
        workspace_id,
        expires_at: expiresAt
      })
      .select()
      .single();
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // In production: Send email with invitation link
    const invitationLink = `${process.env.APP_URL || 'http://localhost:3000'}/invite/${inviteToken}`;
    
    return new Response(JSON.stringify({ 
      success: true, 
      invitation: { id: invitation.id, email, role, expires_at: expiresAt },
      invitation_link: invitationLink
    }), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  // GET /api/super-admin/invitations - List invitations
  if (method === 'GET') {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    
    if (!user || !(await isSuperAdmin(user.id))) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    const { data: invitations } = await supabase
      .from('admin_invitations')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false });
    
    return new Response(JSON.stringify({ invitations }), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  return methodNotAllowed(headers);
}

// Handle invitation acceptance
async function handleInvitationAccept(request, token, headers) {
  const method = request.method;
  
  // GET /api/invitations/:token - Get invitation details
  if (method === 'GET') {
    const { data: invitation } = await supabase
      .from('admin_invitations')
      .select('*, workspaces(name)')
      .eq('token', token)
      .single();
    
    if (!invitation) {
      return new Response(JSON.stringify({ error: 'Invalid invitation' }), {
        status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    if (invitation.status !== 'pending') {
      return new Response(JSON.stringify({ error: `Invitation already ${invitation.status}` }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    if (new Date(invitation.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Invitation expired' }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ 
      invitation: {
        email: invitation.email,
        role: invitation.role,
        workspace_name: invitation.workspaces?.name,
        workspace_id: invitation.workspace_id
      }
    }), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  // POST /api/invitations/:token/accept - Accept invitation
  if (method === 'POST') {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    const acceptToken = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(acceptToken);
    
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // Get invitation
    const { data: invitation } = await supabase
      .from('admin_invitations')
      .select('*')
      .eq('token', token)
      .single();
    
    if (!invitation) {
      return new Response(JSON.stringify({ error: 'Invalid invitation' }), {
        status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    if (invitation.status !== 'pending') {
      return new Response(JSON.stringify({ error: `Invitation already ${invitation.status}` }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // Check user's email matches invitation
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .single();
    
    if (profile?.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return new Response(JSON.stringify({ error: 'Email mismatch. Use the account that was invited.' }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // Add user to workspace
    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: invitation.workspace_id,
        user_id: user.id,
        role: invitation.role
      });
    
    if (memberError) {
      return new Response(JSON.stringify({ error: memberError.message }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // Mark invitation as accepted
    await supabase
      .from('admin_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation.id);
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'You are now a member of the workspace',
      workspace_id: invitation.workspace_id
    }), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  return methodNotAllowed(headers);
}

// ==================== FACEBOOK PAGES ====================

async function handleFacebookPages(request, headers) {
  const method = request.method;
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspace_id');
  
  if (!workspaceId) {
    return new Response(JSON.stringify({ error: 'workspace_id required' }), {
      status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  // Auth check
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabase.auth.getUser(token);
  
  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401, headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  // Check workspace admin
  if (!(await isWorkspaceAdmin(workspaceId, user.id))) {
    return new Response(JSON.stringify({ error: 'Forbidden: Admins only' }), {
      status: 403, headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  // GET - List Facebook pages
  if (method === 'GET') {
    const { data: pages } = await supabase
      .from('facebook_pages')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    return new Response(JSON.stringify({ pages: pages || [] }), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  // POST - Add Facebook page (after OAuth flow)
  if (method === 'POST') {
    const body = await request.json();
    const { page_id, page_name, page_access_token } = body;
    
    if (!page_id || !page_name || !page_access_token) {
      return new Response(JSON.stringify({ error: 'page_id, page_name, and page_access_token required' }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    const { data: page, error } = await supabase
      .from('facebook_pages')
      .upsert({
        workspace_id: workspaceId,
        connected_by: user.id,
        page_id,
        page_name,
        page_access_token,
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'workspace_id,page_id' })
      .select()
      .single();
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ success: true, page }), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  // DELETE - Remove Facebook page
  if (method === 'DELETE') {
    const pageId = url.searchParams.get('page_id');
    
    if (!pageId) {
      return new Response(JSON.stringify({ error: 'page_id required' }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    const { error } = await supabase
      .from('facebook_pages')
      .update({ is_active: false })
      .eq('id', pageId)
      .eq('workspace_id', workspaceId);
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  return methodNotAllowed(headers);
}

// Facebook OAuth for connecting pages
async function handleFacebookConnect(request, headers) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspace_id');
  
  if (!workspaceId) {
    return new Response(JSON.stringify({ error: 'workspace_id required' }), {
      status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  const clientId = process.env.FB_APP_ID;
  const redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/api/facebook/oauth/callback?workspace_id=${workspaceId}`;
  const scope = 'pages_show_list,pages_read_engagement,pages_manage_metadata,pages_messaging';
  
  const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code&state=${workspaceId}`;
  
  return new Response(JSON.stringify({ auth_url: authUrl }), {
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

// ==================== EMPLOYEE ACCESS ====================

async function handleEmployeeAccess(request, headers) {
  const method = request.method;
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspace_id');
  
  if (!workspaceId) {
    return new Response(JSON.stringify({ error: 'workspace_id required' }), {
      status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  // Auth check
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabase.auth.getUser(token);
  
  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401, headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  // Check workspace admin (only admins can manage employee access)
  if (!(await isWorkspaceAdmin(workspaceId, user.id))) {
    return new Response(JSON.stringify({ error: 'Forbidden: Admins only' }), {
      status: 403, headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  // GET - List employees and their access
  if (method === 'GET') {
    const { data: members } = await supabase
      .from('workspace_members')
      .select('*, profiles(email, full_name, avatar_url)')
      .eq('workspace_id', workspaceId)
      .eq('role', 'member');
    
    // Get access for each member
    const memberIds = members?.map(m => m.user_id) || [];
    const { data: accesses } = await supabase
      .from('employee_conversation_access')
      .select('*, conversations(id, contact_id, contacts(name))')
      .in('employee_id', memberIds);
    
    const result = members?.map(member => ({
      ...member,
      profiles: member.profiles,
      access: accesses?.filter(a => a.employee_id === member.user_id) || []
    }));
    
    return new Response(JSON.stringify({ employees: result || [] }), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  // POST - Grant conversation access to employee
  if (method === 'POST') {
    const body = await request.json();
    const { employee_id, conversation_ids } = body;
    
    if (!employee_id || !conversation_ids?.length) {
      return new Response(JSON.stringify({ error: 'employee_id and conversation_ids required' }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    const accessRecords = conversation_ids.map(cid => ({
      employee_id,
      conversation_id: cid,
      granted_by: user.id
    }));
    
    const { error } = await supabase
      .from('employee_conversation_access')
      .upsert(accessRecords, { onConflict: 'employee_id,conversation_id' });
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  // DELETE - Remove conversation access
  if (method === 'DELETE') {
    const accessId = url.searchParams.get('access_id');
    
    if (!accessId) {
      return new Response(JSON.stringify({ error: 'access_id required' }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    const { error } = await supabase
      .from('employee_conversation_access')
      .delete()
      .eq('id', accessId);
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  
  return methodNotAllowed(headers);
}
