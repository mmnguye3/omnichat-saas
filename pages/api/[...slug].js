// pages/api/index.js - Simplified
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL || 'https://ewuhtrgpnmyejmuzeuvs.supabase.co';
const supabaseAnon = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3dWh0cmdwbm15ZWptdXpldXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODk5NDEsImV4cCI6MjA4ODY2NTk0MX0.qlcd8sQtpdwHklwpyyBd3SH7PG6UT_Nf-SQsD97Fe4A';

const supabase = createClient(supabaseUrl, supabaseAnon);

// Helper: Get user from auth header
async function getUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return user;
}

// Helper: Check if super admin
async function isSuperAdmin(userId) {
  const { data } = await supabase
    .from('super_admins')
    .select('id')
    .eq('user_id', userId)
    .single();
  return !!data;
}

// Helper: Check if workspace admin
async function isWorkspaceAdmin(workspaceId, userId) {
  const { data } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .in('role', ['owner', 'admin'])
    .single();
  return !!data;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const path = Array.isArray(req.query.slug) ? req.query.slug.join('/') : req.query.slug || '';
    
    // ========== WORKSPACES ==========
    if (path === 'workspaces') {
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      
      // Get owned workspaces
      const { data: owned } = await supabase
        .from('workspaces')
        .select('*')
        .eq('owner_id', user.id);
      
      // Get workspaces where user is member
      const { data: memberships } = await supabase
        .from('workspace_members')
        .select('workspace_id, role, workspaces(*)')
        .eq('user_id', user.id);
      
      const memberWorkspaces = memberships?.map(m => ({
        ...m.workspaces,
        role: m.role,
        is_member: true
      })) || [];
      
      const allWorkspaces = [
        ...(owned || []).map(w => ({ ...w, role: 'owner', is_owner: true })),
        ...memberWorkspaces
      ];
      
      return res.status(200).json(allWorkspaces);
    }
    
    // ========== CREATE WORKSPACE ==========
    if (path === 'workspaces' && req.method === 'POST') {
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      
      const { name, user_id } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Name required' });
      }
      
      const { data: workspace, error } = await supabase
        .from('workspaces')
        .insert({ name, owner_id: user.id })
        .select()
        .single();
      
      if (error) return res.status(400).json({ error: error.message });
      
      return res.status(201).json(workspace);
    }
    
    // ========== SUPER ADMIN INVITATIONS ==========
    if (path === 'super-admin/invite') {
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      if (!(await isSuperAdmin(user.id))) return res.status(403).json({ error: 'Super admin only' });
      
      if (req.method === 'POST') {
        const { email, workspace_id, role = 'admin' } = req.body;
        
        if (!email || !workspace_id) {
          return res.status(400).json({ error: 'Email and workspace_id required' });
        }
        
        const inviteToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        
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
        
        if (error) return res.status(400).json({ error: error.message });
        
        const invitationLink = `${process.env.APP_URL || 'http://localhost:3000'}/invite/${inviteToken}`;
        
        return res.status(201).json({ 
          success: true, 
          invitation: { id: invitation.id, email, role, expires_at: expiresAt },
          invitation_link: invitationLink
        });
      }
      
      if (req.method === 'GET') {
        const { data: invitations } = await supabase
          .from('admin_invitations')
          .select('*, profiles(full_name)')
          .order('created_at', { ascending: false });
        
        return res.status(200).json({ invitations: invitations || [] });
      }
    }
    
    // ========== LIST INVITATIONS ==========
    if (path === 'super-admin/invitations') {
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      if (!(await isSuperAdmin(user.id))) return res.status(403).json({ error: 'Super admin only' });
      
      const { data: invitations } = await supabase
        .from('admin_invitations')
        .select('*, profiles(full_name)')
        .order('created_at', { ascending: false });
      
      return res.status(200).json({ invitations: invitations || [] });
    }
    
    // ========== GET INVITATION ==========
    if (path.startsWith('invitations/') && !path.includes('/accept')) {
      const token = path.split('/')[1];
      
      const { data: invitation } = await supabase
        .from('admin_invitations')
        .select('*, workspaces(name)')
        .eq('token', token)
        .single();
      
      if (!invitation) {
        return res.status(404).json({ error: 'Invalid invitation' });
      }
      
      if (invitation.status !== 'pending') {
        return res.status(400).json({ error: `Invitation already ${invitation.status}` });
      }
      
      if (new Date(invitation.expires_at) < new Date()) {
        return res.status(400).json({ error: 'Invitation expired' });
      }
      
      return res.status(200).json({ 
        invitation: {
          email: invitation.email,
          role: invitation.role,
          workspace_name: invitation.workspaces?.name,
          workspace_id: invitation.workspace_id
        }
      });
    }
    
    // ========== ACCEPT INVITATION ==========
    if (path.match(/^invitations\/[\w-]+\/accept$/)) {
      const token = path.split('/')[1];
      
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      
      const { data: invitation } = await supabase
        .from('admin_invitations')
        .select('*')
        .eq('token', token)
        .single();
      
      if (!invitation) {
        return res.status(404).json({ error: 'Invalid invitation' });
      }
      
      if (invitation.status !== 'pending') {
        return res.status(400).json({ error: `Invitation already ${invitation.status}` });
      }
      
      // Check email matches
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', user.id)
        .single();
      
      if (profile?.email.toLowerCase() !== invitation.email.toLowerCase()) {
        return res.status(400).json({ error: 'Email mismatch. Use the account that was invited.' });
      }
      
      // Add to workspace
      const { error: memberError } = await supabase
        .from('workspace_members')
        .insert({
          workspace_id: invitation.workspace_id,
          user_id: user.id,
          role: invitation.role
        });
      
      if (memberError) return res.status(400).json({ error: memberError.message });
      
      // Mark accepted
      await supabase
        .from('admin_invitations')
        .update({ status: 'accepted' })
        .eq('id', invitation.id);
      
      return res.status(200).json({ 
        success: true, 
        message: 'You are now a member of the workspace',
        workspace_id: invitation.workspace_id
      });
    }
    
    // ========== FACEBOOK PAGES ==========
    if (path === 'facebook/pages') {
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      
      const workspaceId = req.query.workspace_id;
      if (!workspaceId) return res.status(400).json({ error: 'workspace_id required' });
      
      if (!(await isWorkspaceAdmin(workspaceId, user.id))) {
        return res.status(403).json({ error: 'Admins only' });
      }
      
      if (req.method === 'GET') {
        const { data: pages } = await supabase
          .from('facebook_pages')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        
        return res.status(200).json({ pages: pages || [] });
      }
      
      if (req.method === 'POST') {
        const { page_id, page_name, page_access_token } = req.body;
        
        if (!page_id || !page_name || !page_access_token) {
          return res.status(400).json({ error: 'page_id, page_name, page_access_token required' });
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
        
        if (error) return res.status(400).json({ error: error.message });
        
        return res.status(201).json({ success: true, page });
      }
      
      if (req.method === 'DELETE') {
        const pageId = req.query.page_id;
        if (!pageId) return res.status(400).json({ error: 'page_id required' });
        
        const { error } = await supabase
          .from('facebook_pages')
          .update({ is_active: false })
          .eq('id', pageId)
          .eq('workspace_id', workspaceId);
        
        if (error) return res.status(400).json({ error: error.message });
        
        return res.status(200).json({ success: true });
      }
    }
    
    // ========== FACEBOOK CONNECT (OAuth URL) ==========
    if (path === 'facebook/connect') {
      const workspaceId = req.query.workspace_id;
      if (!workspaceId) return res.status(400).json({ error: 'workspace_id required' });
      
      const clientId = process.env.FB_APP_ID;
      const redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/api/facebook/oauth/callback?workspace_id=${workspaceId}`;
      const scope = 'pages_show_list,pages_read_engagement,pages_manage_metadata,pages_messaging';
      
      const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code&state=${workspaceId}`;
      
      return res.status(200).json({ auth_url: authUrl });
    }
    
    // ========== EMPLOYEE ACCESS ==========
    if (path === 'employees/access') {
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      
      const workspaceId = req.query.workspace_id;
      if (!workspaceId) return res.status(400).json({ error: 'workspace_id required' });
      
      if (!(await isWorkspaceAdmin(workspaceId, user.id))) {
        return res.status(403).json({ error: 'Admins only' });
      }
      
      if (req.method === 'GET') {
        const { data: members } = await supabase
          .from('workspace_members')
          .select('*, profiles(email, full_name, avatar_url)')
          .eq('workspace_id', workspaceId)
          .eq('role', 'member');
        
        const memberIds = members?.map(m => m.user_id) || [];
        
        let accesses = [];
        if (memberIds.length > 0) {
          const { data: accessData } = await supabase
            .from('employee_conversation_access')
            .select('*, conversations(id, contact_id, contacts(name))')
            .in('employee_id', memberIds);
          accesses = accessData || [];
        }
        
        const result = members?.map(member => ({
          ...member,
          profiles: member.profiles,
          access: accesses.filter(a => a.employee_id === member.user_id)
        })) || [];
        
        return res.status(200).json({ employees: result });
      }
      
      if (req.method === 'POST') {
        const { employee_id, conversation_ids } = req.body;
        
        if (!employee_id || !conversation_ids?.length) {
          return res.status(400).json({ error: 'employee_id and conversation_ids required' });
        }
        
        const accessRecords = conversation_ids.map(cid => ({
          employee_id,
          conversation_id: cid,
          granted_by: user.id
        }));
        
        const { error } = await supabase
          .from('employee_conversation_access')
          .upsert(accessRecords, { onConflict: 'employee_id,conversation_id' });
        
        if (error) return res.status(400).json({ error: error.message });
        
        return res.status(201).json({ success: true });
      }
      
      if (req.method === 'DELETE') {
        const accessId = req.query.access_id;
        if (!accessId) return res.status(400).json({ error: 'access_id required' });
        
        const { error } = await supabase
          .from('employee_conversation_access')
          .delete()
          .eq('id', accessId);
        
        if (error) return res.status(400).json({ error: error.message });
        
        return res.status(200).json({ success: true });
      }
    }
    
    // ========== CONVERSATIONS (with employee filtering) ==========
    if (path === 'conversations') {
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      
      // Get owned workspace
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_id', user.id)
        .single();
      
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
        return res.status(200).json([]);
      }
      
      let query = supabase
        .from('conversations')
        .select('*, contact:contacts(*), channel:channels(*)')
        .eq('workspace_id', workspaceId);
      
      // Employee filtering
      if (userRole === 'member') {
        const { data: access } = await supabase
          .from('employee_conversation_access')
          .select('conversation_id')
          .eq('employee_id', user.id);
        
        const accessibleIds = access?.map(a => a.conversation_id) || [];
        
        // Show assigned or explicitly granted
        query = query.or(`assigned_to.eq.${user.id},id.in.(${accessibleIds.join(',')})`);
      }
      
      const { data: conversations } = await query
        .order('updated_at', { ascending: false })
        .limit(50);
      
      return res.status(200).json(conversations || []);
    }
    
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
