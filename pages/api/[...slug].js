// pages/api/index.js - Simplified
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://ewuhtrgpnmyejmuzeuvs.supabase.co';
const supabaseAnon = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3dWh0cmdwbm15ZWptdXpldXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODk5NDEsImV4cCI6MjA4ODY2NTk0MX0.qlcd8sQtpdwHklwpyyBd3SH7PG6UT_Nf-SQsD97Fe4A';

const supabase = createClient(supabaseUrl, supabaseAnon);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const path = Array.isArray(req.query.slug) ? req.query.slug.join('/') : req.query.slug || '';
    
    // Campaigns
    if (path === 'campaigns') {
      if (req.method === 'GET') {
        const { data } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
        return res.status(200).json({ campaigns: data || [] });
      }
      if (req.method === 'POST') {
        const { name, message, message_tag, total_contacts } = req.body;
        const { data, error } = await supabase.from('campaigns').insert({ name, message, message_tag, total_contacts, status: 'pending' }).select().single();
        if (error) return res.status(400).json({ error: error.message });
        return res.status(201).json({ campaign: data });
      }
    }
    
    // Single campaign
    if (path.startsWith('campaigns/')) {
      const id = path.split('/')[1];
      if (req.method === 'GET') {
        const { data } = await supabase.from('campaigns').select('*').eq('id', id).single();
        return res.status(200).json({ campaign: data });
      }
      if (req.method === 'PATCH') {
        const { status, sent, delivered, failed } = req.body;
        const { data, error } = await supabase.from('campaigns').update({ status, sent, delivered, failed }).eq('id', id).select().single();
        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ campaign: data });
      }
    }
    
    // Contacts
    if (path === 'contacts') {
      if (req.method === 'GET') {
        const { data } = await supabase.from('contacts').select('*');
        return res.status(200).json({ contacts: data || [] });
      }
    }
    
    // Channels
    if (path === 'channels') {
      if (req.method === 'GET') {
        const { data } = await supabase.from('channels').select('*');
        return res.status(200).json({ channels: data || [] });
      }
    }
    
    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
