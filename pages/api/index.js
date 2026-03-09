// pages/api/index.js - Fixed version
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://ewuhtrgpnmyejmuzeuvs.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3dWh0cmdwbm15ZWptdXpldXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODk5NDEsImV4cCI6MjA4ODY2NTk0MX0.qlcd8sQtpdwHklwpyyBd3SH7PG6UT_Nf-SQsD97Fe4A';

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const path = req.query.slug || '';
    
    if (path === 'campaigns') {
      return handleCampaigns(req, res);
    }
    
    if (path.startsWith('campaigns/')) {
      const campaignId = path.split('/')[1];
      return handleCampaign(req, res, campaignId);
    }
    
    if (path === 'contacts') {
      return handleContacts(req, res);
    }
    
    if (path === 'channels') {
      return handleChannels(req, res);
    }
    
    if (path === 'auth/login') {
      return handleLogin(req, res);
    }
    
    return res.status(404).json({ error: 'Not found' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function handleCampaigns(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ campaigns: data });
  }
  
  if (req.method === 'POST') {
    const { name, message, message_tag, total_contacts, user_id } = req.body;
    
    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        name,
        message,
        message_tag,
        total_contacts: total_contacts || 0,
        user_id,
        status: 'pending'
      })
      .select()
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ campaign: data });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleCampaign(req, res, campaignId) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ campaign: data });
  }
  
  if (req.method === 'PATCH') {
    const { status, sent, delivered, failed } = req.body;
    
    const { data, error } = await supabase
      .from('campaigns')
      .update({
        status,
        sent,
        delivered,
        failed,
        completed_at: status === 'completed' ? new Date().toISOString() : null
      })
      .eq('id', campaignId)
      .select()
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ campaign: data });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleContacts(req, res) {
  if (req.method === 'GET') {
    const { channel_id, user_id } = req.query;
    
    let query = supabase.from('contacts').select('*');
    if (channel_id) query = query.eq('channel_id', channel_id);
    if (user_id) query = query.eq('user_id', user_id);
    
    const { data, error } = await query;
    
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ contacts: data });
  }
  
  if (req.method === 'POST') {
    const { name, email, phone, channel_id, user_id, external_id } = req.body;
    
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        name,
        email,
        phone,
        channel_id,
        user_id,
        external_id
      })
      .select()
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ contact: data });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleChannels(req, res) {
  if (req.method === 'GET') {
    const { user_id } = req.query;
    
    let query = supabase.from('channels').select('*');
    if (user_id) query = query.eq('user_id', user_id);
    
    const { data, error } = await query;
    
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ channels: data });
  }
  
  if (req.method === 'POST') {
    const { name, type, page_id, access_token, user_id } = req.body;
    
    const { data, error } = await supabase
      .from('channels')
      .insert({
        name,
        type,
        page_id,
        access_token,
        user_id
      })
      .select()
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ channel: data });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleLogin(req, res) {
  if (req.method === 'POST') {
    const { email } = req.body;
    
    let { data: user, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error || !user) {
      const { data: newUser, error: createError } = await supabase
        .from('profiles')
        .insert({
          email,
          full_name: email.split('@')[0],
          role: 'admin'
        })
        .select()
        .single();
      
      if (createError) return res.status(500).json({ error: createError.message });
      user = newUser;
    }
    
    return res.status(200).json({ user });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}
